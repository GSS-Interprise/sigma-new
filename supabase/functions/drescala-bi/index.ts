import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DRESCALA_API_BASE = "https://api-gateway.drescala.com/api/bi/gss";

interface DrEscalaPlantao {
  id?: string | number;
  id_plantao?: string | number;
  data?: string;
  hora?: string;
  hora_inicio?: string;
  hora_fim?: string;
  nome_profissional?: string;
  local_id?: string | number;
  setor_id?: string | number;
  nome_local?: string;
  nome_setor?: string;
  [key: string]: unknown;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DRESCALA_API_KEY = Deno.env.get("DRESCALA_API_KEY");
    if (!DRESCALA_API_KEY) {
      throw new Error("DRESCALA_API_KEY não está configurada");
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    let response: Response;

    if (action === "locais-setores") {
      // Lista todos os locais e setores
      console.log("[drescala-bi] Fetching locais-setores...");
      
      response = await fetch(`${DRESCALA_API_BASE}/locais-setores`, {
        method: "GET",
        headers: {
          "x-api-key": DRESCALA_API_KEY,
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[drescala-bi] Locais-setores API error [${response.status}]:`, errorText);
        throw new Error(`Erro na API Dr. Escala [${response.status}]: ${errorText}`);
      }

      const data = await response.json();
      
      // Log para debug da estrutura
      const dataArray = Array.isArray(data) ? data : (data.data || data.locais_setores || []);
      console.log(`[drescala-bi] Locais-setores: ${dataArray.length} registros`);
      if (dataArray.length > 0) {
        console.log("[drescala-bi] Exemplo de local-setor:", JSON.stringify(dataArray[0]));
      }
      
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      
    } else if (action === "plantoes") {
      // Lista plantões com filtros
      const mes = url.searchParams.get("mes");
      const ano = url.searchParams.get("ano");
      const localId = url.searchParams.get("local_id");
      const setorId = url.searchParams.get("setor_id");

      if (!mes || !ano) {
        return new Response(
          JSON.stringify({ error: "Parâmetros 'mes' e 'ano' são obrigatórios" }),
          { 
            status: 400, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }

      let plantoesUrl = `${DRESCALA_API_BASE}/plantoes?mes=${mes}&ano=${ano}`;
      if (localId) plantoesUrl += `&local_id=${localId}`;
      if (setorId) plantoesUrl += `&setor_id=${setorId}`;

      console.log(`[drescala-bi] Fetching plantões: ${plantoesUrl}`);

      response = await fetch(plantoesUrl, {
        method: "GET",
        headers: {
          "x-api-key": DRESCALA_API_KEY,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[drescala-bi] Plantões API error [${response.status}]:`, errorText);
        throw new Error(`Erro na API Dr. Escala [${response.status}]: ${errorText}`);
      }

      const data = await response.json();
      
      // Analisar qualidade dos dados recebidos
      const plantoes: DrEscalaPlantao[] = Array.isArray(data) ? data : (data.data || data.plantoes || []);
      
      // Estatísticas de qualidade
      let comLocalId = 0;
      let comSetorId = 0;
      let comHoraInicio = 0;
      let comHoraFim = 0;
      let comProfissional = 0;
      
      for (const p of plantoes) {
        if (p.local_id) comLocalId++;
        if (p.setor_id) comSetorId++;
        if (p.hora_inicio || p.hora) comHoraInicio++;
        if (p.hora_fim) comHoraFim++;
        if (p.nome_profissional || p.profissional_nome) comProfissional++;
      }
      
      console.log(`[drescala-bi] Plantões recebidos: ${plantoes.length} total`);
      console.log(`[drescala-bi] Qualidade: local_id=${comLocalId}/${plantoes.length}, setor_id=${comSetorId}/${plantoes.length}`);
      console.log(`[drescala-bi] Qualidade: hora_inicio=${comHoraInicio}/${plantoes.length}, hora_fim=${comHoraFim}/${plantoes.length}`);
      console.log(`[drescala-bi] Qualidade: profissional=${comProfissional}/${plantoes.length}`);
      
      // Log estrutura do primeiro plantão para debug
      if (plantoes.length > 0) {
        console.log("[drescala-bi] Estrutura do primeiro plantão:", JSON.stringify(plantoes[0]));
      }
      
      // Alerta se muitos plantões sem local/setor
      const taxaIncompleta = plantoes.length > 0 
        ? ((plantoes.length - comLocalId) / plantoes.length * 100).toFixed(1)
        : "0";
      
      if (parseFloat(taxaIncompleta) > 10) {
        console.warn(`[drescala-bi] ALERTA: ${taxaIncompleta}% dos plantões sem local_id`);
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
      
    } else if (action === "status") {
      // Endpoint de status/health check
      return new Response(
        JSON.stringify({ 
          status: "ok", 
          api_base: DRESCALA_API_BASE,
          timestamp: new Date().toISOString()
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
      
    } else {
      return new Response(
        JSON.stringify({ 
          error: "Ação inválida. Use 'locais-setores', 'plantoes' ou 'status'" 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
  } catch (error: unknown) {
    console.error("[drescala-bi] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
