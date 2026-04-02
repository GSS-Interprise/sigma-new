import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-token",
};

interface EscalaPayload {
  id_externo: string;
  sistema_origem?: string;
  profissional_nome: string;
  profissional_crm?: string;
  profissional_id_externo?: string;
  setor: string;
  unidade?: string;
  cliente_id?: string;
  unidade_id?: string;
  data_escala: string;
  hora_inicio: string;
  hora_fim: string;
  tipo_plantao?: string;
  status_escala?: string;
  dados_originais?: Record<string, unknown>;
}

interface EscalasBulkPayload {
  escalas: EscalaPayload[];
  sistema_origem?: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Validar token de API
  const apiToken = req.headers.get("x-api-token");
  
  if (!apiToken) {
    console.error("[escalas-api] Token de API não fornecido");
    return new Response(
      JSON.stringify({ error: "Token de API obrigatório no header x-api-token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Validar token
  const { data: tokenId, error: tokenError } = await supabase.rpc("validate_escala_api_token", {
    _token: apiToken,
  });

  if (tokenError || !tokenId) {
    console.error("[escalas-api] Token inválido:", tokenError?.message);
    return new Response(
      JSON.stringify({ error: "Token de API inválido ou expirado" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("[escalas-api] Token validado:", tokenId);

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  try {
    // GET - Consultar escalas
    if (req.method === "GET") {
      console.log("[escalas-api] GET - Consultando escalas");

      const dataInicio = url.searchParams.get("data_inicio");
      const dataFim = url.searchParams.get("data_fim");
      const setor = url.searchParams.get("setor");
      const profissionalCrm = url.searchParams.get("crm");
      const sistemaOrigem = url.searchParams.get("sistema_origem") || "DR_ESCALA";

      let query = supabase
        .from("escalas_integradas")
        .select("*")
        .eq("sistema_origem", sistemaOrigem)
        .order("data_escala", { ascending: true })
        .order("hora_inicio", { ascending: true });

      if (dataInicio) {
        query = query.gte("data_escala", dataInicio);
      }

      if (dataFim) {
        query = query.lte("data_escala", dataFim);
      }

      if (setor) {
        query = query.ilike("setor", `%${setor}%`);
      }

      if (profissionalCrm) {
        query = query.eq("profissional_crm", profissionalCrm);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[escalas-api] Erro ao consultar:", error);
        throw error;
      }

      console.log("[escalas-api] Escalas encontradas:", data?.length || 0);

      return new Response(
        JSON.stringify({ success: true, data, total: data?.length || 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST - Receber escalas (individual ou em lote)
    if (req.method === "POST") {
      const body = await req.json();
      console.log("[escalas-api] POST - Recebendo escalas");

      // Verificar se é bulk ou individual
      const escalas: EscalaPayload[] = body.escalas || [body];
      const sistemaOrigem = body.sistema_origem || "DR_ESCALA";

      let registrosSucesso = 0;
      let registrosErro = 0;
      const errosDetalhados: Array<{ id_externo: string; erro: string }> = [];

      for (const escala of escalas) {
        try {
          const dadosEscala = {
            id_externo: escala.id_externo,
            sistema_origem: escala.sistema_origem || sistemaOrigem,
            profissional_nome: escala.profissional_nome,
            profissional_crm: escala.profissional_crm,
            profissional_id_externo: escala.profissional_id_externo,
            setor: escala.setor,
            unidade: escala.unidade,
            cliente_id: escala.cliente_id || null,
            unidade_id: escala.unidade_id || null,
            data_escala: escala.data_escala,
            hora_inicio: escala.hora_inicio,
            hora_fim: escala.hora_fim,
            tipo_plantao: escala.tipo_plantao,
            status_escala: escala.status_escala || "confirmado",
            dados_originais: escala.dados_originais || escala,
            sincronizado_em: new Date().toISOString(),
          };

          // Upsert - atualiza se já existe (baseado em id_externo + sistema_origem)
          const { error } = await supabase
            .from("escalas_integradas")
            .upsert(dadosEscala, {
              onConflict: "id_externo,sistema_origem",
              ignoreDuplicates: false,
            });

          if (error) {
            console.error("[escalas-api] Erro ao inserir escala:", escala.id_externo, error);
            registrosErro++;
            errosDetalhados.push({ id_externo: escala.id_externo, erro: error.message });
          } else {
            registrosSucesso++;
          }
        } catch (err) {
          console.error("[escalas-api] Erro inesperado:", err);
          registrosErro++;
          errosDetalhados.push({
            id_externo: escala.id_externo,
            erro: err instanceof Error ? err.message : "Erro desconhecido",
          });
        }
      }

      // Registrar log de integração
      const statusLog = registrosErro === 0 ? "sucesso" : registrosSucesso === 0 ? "erro" : "parcial";

      await supabase.from("escalas_integracao_logs").insert({
        sistema_origem: sistemaOrigem,
        tipo_operacao: "api",
        status: statusLog,
        total_registros: escalas.length,
        registros_sucesso: registrosSucesso,
        registros_erro: registrosErro,
        mensagem: `Sincronização via API: ${registrosSucesso} sucesso, ${registrosErro} erros`,
        erros_detalhados: errosDetalhados.length > 0 ? errosDetalhados : null,
        ip_origem: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      });

      console.log("[escalas-api] Resultado:", { registrosSucesso, registrosErro });

      return new Response(
        JSON.stringify({
          success: registrosErro === 0,
          status: statusLog,
          total_registros: escalas.length,
          registros_sucesso: registrosSucesso,
          registros_erro: registrosErro,
          erros: errosDetalhados.length > 0 ? errosDetalhados : undefined,
        }),
        { status: registrosErro === 0 ? 200 : 207, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // DELETE - Remover escala específica (por id_externo)
    if (req.method === "DELETE") {
      const idExterno = url.searchParams.get("id_externo");
      const sistemaOrigem = url.searchParams.get("sistema_origem") || "DR_ESCALA";

      if (!idExterno) {
        return new Response(
          JSON.stringify({ error: "Parâmetro id_externo obrigatório" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[escalas-api] DELETE - Removendo escala:", idExterno);

      const { error } = await supabase
        .from("escalas_integradas")
        .delete()
        .eq("id_externo", idExterno)
        .eq("sistema_origem", sistemaOrigem);

      if (error) {
        console.error("[escalas-api] Erro ao deletar:", error);
        throw error;
      }

      // Log
      await supabase.from("escalas_integracao_logs").insert({
        sistema_origem: sistemaOrigem,
        tipo_operacao: "api",
        status: "sucesso",
        total_registros: 1,
        registros_sucesso: 1,
        registros_erro: 0,
        mensagem: `Escala ${idExterno} removida via API`,
        ip_origem: req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip"),
      });

      return new Response(
        JSON.stringify({ success: true, message: `Escala ${idExterno} removida` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Método não suportado" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[escalas-api] Erro:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
