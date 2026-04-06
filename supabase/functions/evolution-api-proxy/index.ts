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
        const createResponseText = await response.text();
        console.log("Creating instance - Response Status:", response.status);
        console.log("Creating instance - Response Body:", createResponseText);
        // Re-create response since we consumed the body
        return new Response(
          createResponseText,
          { 
            status: response.status, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );

      case "connectInstance":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/instance/connect/${instanceName}`;
        response = await fetch(endpoint, { method: "GET", headers });
        break;

      case "connectionState":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/instance/connectionState/${instanceName}`;
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
        endpoint = `${evolutionApiUrl}/instance/logout/${instanceName}`;
        method = "DELETE";
        response = await fetch(endpoint, { method, headers });
        break;

      case "deleteInstance":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/instance/delete/${instanceName}`;
        method = "DELETE";
        response = await fetch(endpoint, { method, headers });
        break;

      case "setSettings":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/settings/set/${instanceName}`;
        method = "POST";
        body = JSON.stringify(data);
        response = await fetch(endpoint, { method, headers, body });
        break;

      case "fetchInstance":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/instance/fetchInstances?instanceName=${instanceName}`;
        response = await fetch(endpoint, { method: "GET", headers });
        break;

      case "setProxy":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/proxy/set/${instanceName}`;
        method = "POST";
        body = JSON.stringify(data);
        console.log(`Setting proxy for ${instanceName}:`, data);
        response = await fetch(endpoint, { method, headers, body });
        break;

      case "getProxy":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/proxy/find/${instanceName}`;
        response = await fetch(endpoint, { method: "GET", headers });
        break;

      case "setWebhook":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/webhook/set/${instanceName}`;
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
        endpoint = `${evolutionApiUrl}/webhook/find/${instanceName}`;
        response = await fetch(endpoint, { method: "GET", headers });
        break;

      case "findMessages":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/chat/findMessages/${instanceName}`;
        method = "POST";
        body = JSON.stringify(data);
        console.log(`Finding messages for ${instanceName}:`, data);
        response = await fetch(endpoint, { method, headers, body });
        break;

      case "checkIsOnWhatsapp":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/chat/whatsappNumbers/${instanceName}`;
        method = "POST";
        body = JSON.stringify(data);
        console.log(`Checking WhatsApp numbers for ${instanceName}:`, data);
        response = await fetch(endpoint, { method, headers, body });
        break;

      case "fetchProfile":
        if (!instanceName) throw new Error("instanceName é obrigatório");
        endpoint = `${evolutionApiUrl}/chat/fetchProfile/${instanceName}`;
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
