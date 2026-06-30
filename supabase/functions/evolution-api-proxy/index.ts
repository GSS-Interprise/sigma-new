import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EvolutionRequest {
  action: string;
  instanceName?: string;
  data?: Record<string, unknown>;
}

async function getEvolutionConfig(supabase: any): Promise<{ url: string | null; key: string | null }> {
  // First try to get from config_lista_items table
  const { data: configItems } = await supabase
    .from("config_lista_items")
    .select("campo_nome, valor")
    .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);

  let url = configItems?.find((i: any) => i.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, '') || null;
  let key = configItems?.find((i: any) => i.campo_nome === "evolution_api_key")?.valor || null;

  // Fallback to environment variables if not found in database
  if (!url) url = Deno.env.get("EVOLUTION_API_URL") || null;
  if (!key) key = Deno.env.get("EVOLUTION_API_KEY") || null;

  return { url, key };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get Evolution API config from database or env
    const { url: evolutionApiUrl, key: evolutionApiKey } = await getEvolutionConfig(supabase);

    if (!evolutionApiUrl || !evolutionApiKey) {
      return new Response(
        JSON.stringify({ error: "Evolution API não configurada. Configure nas Configurações Avançadas." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { action, instanceName, data } = await req.json() as EvolutionRequest;
    console.log(`Evolution API Proxy - Action: ${action}, Instance: ${instanceName || 'N/A'}`);

    // FIX 27/05/2026: nomes de instance com espaço, ç, ã (ex: "Amanda porspecção",
    // "IPHONE ANTÔNIA - DISPARO AGENDAS") quebravam URL fetch sem encode —
    // edge function retornava erro 500 e equipe não conseguia gerar QR.
    const encInstance = instanceName ? encodeURIComponent(instanceName) : "";

    const headers = {
      "apikey": evolutionApiKey,
      "Content-Type": "application/json",
    };

    let response: Response;
    let endpoint: string;
    let method: string = "GET";
    let body: string | undefined;

    switch (action) {
      case "fetchInstances":
        endpoint = `${evolutionApiUrl}/instance/fetchInstances`;
        response = await fetch(endpoint, { method: "GET", headers });
        break;

      case "createInstance":
        endpoint = `${evolutionApiUrl}/instance/create`;
        method = "POST";
        body = JSON.stringify(data);
        console.log("Creating instance - Endpoint:", endpoint);
        console.log("Creating instance - Payload:", body);
        response = await fetch(endpoint, { method, headers, body });
        let createResponseText = await response.text();
        console.log("Creating instance - Response Status:", response.status);
        console.log("Creating instance - Response Body:", createResponseText);
        // Se a instância já existe no Evolution (órfã de uma criação anterior),
        // remove e tenta de novo automaticamente — caso comum quando o chip
        // foi apagado só do nosso banco mas ficou no Evolution.
        if (response.status === 403 && /already in use/i.test(createResponseText)) {
          const orphanName = (data as any)?.instanceName;
          if (orphanName) {
            const encOrphan = encodeURIComponent(orphanName);
            console.log("Instance already exists, cleaning up:", orphanName);
            try {
              await fetch(`${evolutionApiUrl}/instance/logout/${encOrphan}`, { method: "DELETE", headers });
            } catch (e) { console.warn("logout falhou (ok):", e); }
            try {
              await fetch(`${evolutionApiUrl}/instance/delete/${encOrphan}`, { method: "DELETE", headers });
            } catch (e) { console.warn("delete falhou:", e); }
            response = await fetch(endpoint, { method, headers, body });
            createResponseText = await response.text();
            console.log("Retry create - Status:", response.status, "Body:", createResponseText);
          }
        }
        // Re-create response since we consumed the body
        return new Response(
          createResponseText,
          { 
            status: response.status, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );

      case "connectInstance": {
        if (!instanceName) throw new Error("instanceName é obrigatório");
        // FIX 02/06/2026: a janela de QR do Evolution v2.3.7 é curta e, em chip
        // travado em close/connecting (ou recém-criado), o connect devolve
        // {count:0} sem base64 → UI mostrava "não foi possível gerar o QR".
        // Solução: connect; se não veio QR e não está open, chuta com restart e
        // faz polling até o base64 aparecer (~24s). Single call da UI vira confiável.
        const connectUrl = `${evolutionApiUrl}/instance/connect/${encInstance}`;
        const tryConnect = async () => {
          const r = await fetch(connectUrl, { method: "GET", headers });
          const txt = await r.text();
          let d: any;
          try { d = JSON.parse(txt); } catch { d = { raw: txt }; }
          return d;
        };
        let connData: any = await tryConnect();
        if (connData?.instance?.state !== "open" && !connData?.base64) {
          // chuta o socket pra reiniciar a geração de QR
          try {
            await fetch(`${evolutionApiUrl}/instance/restart/${encInstance}`, { method: "POST", headers });
          } catch { /* ignora — segue pro polling */ }
          for (let i = 0; i < 6 && !connData?.base64; i++) {
            await new Promise((res) => setTimeout(res, 4000));
            try { connData = await tryConnect(); } catch { /* tenta de novo */ }
            if (connData?.instance?.state === "open") break;
          }
        }
        return new Response(
          JSON.stringify(connData),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "connectionState":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/instance/connectionState/${encInstance}`;
        response = await fetch(endpoint, { method: "GET", headers });
        break;

      case "restartInstance":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        // Evolution API v2.x usa POST para restart
        endpoint = `${evolutionApiUrl}/instance/restart/${encodeURIComponent(instanceName)}`;
        method = "POST";
        response = await fetch(endpoint, { method, headers });
        // Se 404, tenta endpoint alternativo (v1)
        if (response.status === 404) {
          console.log("Trying alternative restart endpoint (PUT)...");
          endpoint = `${evolutionApiUrl}/instance/restart/${encodeURIComponent(instanceName)}`;
          response = await fetch(endpoint, { method: "PUT", headers });
        }
        break;

      case "logoutInstance":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/instance/logout/${encInstance}`;
        method = "DELETE";
        response = await fetch(endpoint, { method, headers });
        break;

      case "deleteInstance":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        // Evolution API retorna 400 se a instância ainda estiver conectada.
        // Faz logout silencioso antes de deletar para evitar o erro.
        try {
          await fetch(`${evolutionApiUrl}/instance/logout/${encInstance}`, {
            method: "DELETE",
            headers,
          });
        } catch (e) {
          console.warn("Logout antes de delete falhou (ignorado):", e);
        }
        endpoint = `${evolutionApiUrl}/instance/delete/${encInstance}`;
        method = "DELETE";
        response = await fetch(endpoint, { method, headers });
        break;

      case "setSettings":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/settings/set/${encInstance}`;
        method = "POST";
        body = JSON.stringify(data);
        response = await fetch(endpoint, { method, headers, body });
        break;

      case "fetchInstance":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/instance/fetchInstances?instanceName=${encInstance}`;
        response = await fetch(endpoint, { method: "GET", headers });
        break;

      case "setProxy":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/proxy/set/${encInstance}`;
        method = "POST";
        body = JSON.stringify(data);
        console.log(`Setting proxy for ${instanceName}:`, data);
        response = await fetch(endpoint, { method, headers, body });
        break;

      case "getProxy":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/proxy/find/${encInstance}`;
        response = await fetch(endpoint, { method: "GET", headers });
        break;

      case "setWebhook":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/webhook/set/${encInstance}`;
        method = "POST";
        // Evolution API v2 espera { webhook: { ... } } com byEvents e base64 (não webhookByEvents/webhookBase64)
        const webhookPayload = {
          webhook: {
            enabled: data?.enabled ?? true,
            url: data?.url,
            byEvents: data?.webhookByEvents ?? false,
            base64: data?.webhookBase64 ?? false,
            events: data?.events || []
          }
        };
        body = JSON.stringify(webhookPayload);
        console.log(`Setting webhook for ${instanceName}:`, webhookPayload);
        response = await fetch(endpoint, { method, headers, body });
        break;

      case "findWebhook":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/webhook/find/${encInstance}`;
        response = await fetch(endpoint, { method: "GET", headers });
        break;

      case "findMessages":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/chat/findMessages/${encInstance}`;
        method = "POST";
        body = JSON.stringify(data);
        console.log(`Finding messages for ${instanceName}:`, data);
        response = await fetch(endpoint, { method, headers, body });
        break;

      case "checkIsOnWhatsapp":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/chat/whatsappNumbers/${encInstance}`;
        method = "POST";
        body = JSON.stringify(data);
        console.log(`Checking WhatsApp numbers for ${instanceName}:`, data);
        response = await fetch(endpoint, { method, headers, body });
        break;

      case "fetchProfile":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/chat/fetchProfile/${encInstance}`;
        method = "POST";
        body = JSON.stringify(data);
        response = await fetch(endpoint, { method, headers, body });
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Ação desconhecida: ${action}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const responseText = await response.text();
    console.log(`Evolution API Response Status: ${response.status}`);

    let responseData: unknown;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }

    // Treat 428 (Connection Closed) as a friendly error — check both HTTP status
    // and response body (Evolution API sometimes wraps 428 inside a 400 with isBoom)
    const isConnectionClosed =
      response.status === 428 ||
      (typeof responseData === "object" && responseData !== null &&
        ((responseData as any).isBoom === true &&
          (responseData as any).output?.statusCode === 428));

    if (isConnectionClosed) {
      console.warn(`Evolution API connection closed for action=${action}, instance=${instanceName}, httpStatus=${response.status}`);
      return new Response(
        JSON.stringify({
          error: "Instância desconectada. Reconecte pelo QR Code na aba de configuração.",
          code: "CONNECTION_CLOSED",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Instância inexistente na Evolution API (foi deletada/recriada com outro nome).
    // Retornamos 200 com code=INSTANCE_NOT_FOUND pra UI tratar sem crashar (blank screen).
    const msg = (() => {
      const m = (responseData as any)?.response?.message;
      if (Array.isArray(m)) return m.join(" ");
      if (typeof m === "string") return m;
      return "";
    })();
    const isInstanceNotFound =
      response.status === 404 &&
      /instance.*(does not exist|not exist|não existe)/i.test(msg);

    if (isInstanceNotFound) {
      console.warn(`Evolution instance not found: action=${action}, instance=${instanceName}`);
      return new Response(
        JSON.stringify({
          error: `Instância "${instanceName}" não existe na Evolution API. Recrie o chip ou ajuste o instance_name.`,
          code: "INSTANCE_NOT_FOUND",
          instanceName,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify(responseData),
      { 
        status: response.status, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: unknown) {
    console.error("Evolution API Proxy Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno do servidor";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
