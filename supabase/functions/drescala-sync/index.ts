// Edge Function: drescala-sync - Sincroniza plantões do Dr. Escala para o SIGMA
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DRESCALA_API_BASE = "https://api-gateway.drescala.com/api/bi/gss";

interface PlantaoDrEscala {
  id: string;
  profissional?: {
    id?: string;
    nome?: string;
    crm?: string;
  };
  local?: {
    id?: string;
    nome?: string;
  };
  setor?: {
    id?: string;
    nome?: string;
  };
  data?: string;
  horario_inicio?: string;
  horario_fim?: string;
  status?: string;
  tipo?: string;
  [key: string]: unknown;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let totalProcessados = 0;
  let totalSucesso = 0;
  let totalErro = 0;
  const errosDetalhados: Array<{ id: string; erro: string }> = [];

  try {
    const DRESCALA_API_KEY = Deno.env.get("DRESCALA_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!DRESCALA_API_KEY) {
      throw new Error("DRESCALA_API_KEY não está configurada");
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Variáveis Supabase não configuradas");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Obter parâmetros da requisição
    const url = new URL(req.url);
    const mes = url.searchParams.get("mes") || new Date().getMonth() + 1;
    const ano = url.searchParams.get("ano") || new Date().getFullYear();
    const localId = url.searchParams.get("local_id");

    console.log(`[drescala-sync] Iniciando sincronização: ${mes}/${ano}`);

    // 1. Buscar plantões do Dr. Escala
    let plantoesUrl = `${DRESCALA_API_BASE}/plantoes?mes=${mes}&ano=${ano}`;
    if (localId) plantoesUrl += `&local_id=${localId}`;

    console.log(`[drescala-sync] Buscando plantões: ${plantoesUrl}`);

    const response = await fetch(plantoesUrl, {
      method: "GET",
      headers: {
        "x-api-key": DRESCALA_API_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erro na API Dr. Escala [${response.status}]: ${errorText}`);
    }

    const responseData = await response.json();
    
    // Extrair array de plantões (pode vir como { data: [...] } ou diretamente [...])
    const plantoes: PlantaoDrEscala[] = Array.isArray(responseData) 
      ? responseData 
      : (responseData.data || responseData.plantoes || []);

    if (!plantoes || plantoes.length === 0) {
      console.log("[drescala-sync] Nenhum plantão encontrado para o período");
      
      // Registrar log
      await supabase.from("escalas_integracao_logs").insert({
        sistema_origem: "DR_ESCALA",
        tipo_operacao: "sync_api",
        status: "sucesso",
        total_registros: 0,
        registros_sucesso: 0,
        registros_erro: 0,
        mensagem: `Sincronização ${mes}/${ano}: Nenhum plantão encontrado (${Date.now() - startTime}ms)`,
      });

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Nenhum plantão encontrado para o período",
          total: 0,
          sucesso: 0,
          erro: 0
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[drescala-sync] ${plantoes.length} plantões encontrados`);
    totalProcessados = plantoes.length;

    // 2. Transformar e inserir cada plantão
    for (const plantao of plantoes) {
      try {
        // Extrair e normalizar dados
        const idExterno = String(plantao.id || `DR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
        
        const profissionalNome = plantao.profissional?.nome || 
          (plantao as any).nome_profissional || 
          (plantao as any).medico?.nome || 
          "Profissional Não Informado";
        
        const profissionalCrm = plantao.profissional?.crm || 
          (plantao as any).crm || 
          (plantao as any).medico?.crm || 
          null;
        
        const profissionalIdExterno = String(plantao.profissional?.id || 
          (plantao as any).profissional_id || 
          (plantao as any).medico?.id || 
          "");

        const setor = plantao.setor?.nome || 
          (plantao as any).nome_setor || 
          (plantao as any).setor_nome || 
          "Setor Não Informado";

        const unidade = plantao.local?.nome || 
          (plantao as any).nome_local || 
          (plantao as any).local_nome || 
          (plantao as any).unidade || 
          null;

        // Normalizar data
        let dataEscala = plantao.data || (plantao as any).data_plantao || (plantao as any).data_escala;
        if (dataEscala && typeof dataEscala === "string") {
          // Se vier em formato DD/MM/YYYY, converter
          if (/^\d{2}\/\d{2}\/\d{4}$/.test(dataEscala)) {
            const [d, m, y] = dataEscala.split("/");
            dataEscala = `${y}-${m}-${d}`;
          }
        }

        // Normalizar horários - Dr. Escala pode enviar:
        // - horario_inicio / horario_fim
        // - hora_inicio / hora_fim  
        // - hora (apenas hora de início)
        // - inicio / fim
        let horaInicio = plantao.horario_inicio || 
          (plantao as any).hora_inicio || 
          (plantao as any).hora ||  // Campo "hora" = hora de início no Dr. Escala
          (plantao as any).inicio || 
          null;
        
        let horaFim = plantao.horario_fim || 
          (plantao as any).hora_fim || 
          (plantao as any).fim || 
          null;  // NÃO usar fallback "00:00" - marcar como incompleto
        
        // Garantir formato HH:MM
        if (horaInicio && horaInicio.length > 5) horaInicio = horaInicio.substring(0, 5);
        if (horaFim && horaFim.length > 5) horaFim = horaFim.substring(0, 5);

        // Detectar dados incompletos de horário
        const horarioInicioValido = horaInicio && horaInicio !== "00:00";
        const horarioFimValido = horaFim && horaFim !== "00:00";
        
        let dadosIncompletos = false;
        let motivoIncompleto: string | null = null;
        
        if (!horarioInicioValido && !horarioFimValido) {
          dadosIncompletos = true;
          motivoIncompleto = "Horário não informado pela origem";
          horaInicio = horaInicio || "00:00";
          horaFim = horaFim || "00:00";
        } else if (!horarioFimValido) {
          dadosIncompletos = true;
          motivoIncompleto = "Horário fim não informado pela origem";
          horaFim = "00:00";
        } else if (!horarioInicioValido) {
          dadosIncompletos = true;
          motivoIncompleto = "Horário início não informado pela origem";
          horaInicio = "00:00";
        }

        // Calcular carga horária (apenas se ambos horários são válidos)
        let cargaHorariaMinutos: number | null = null;
        if (horarioInicioValido && horarioFimValido) {
          try {
            const [hInicio, mInicio] = horaInicio.split(":").map(Number);
            const [hFim, mFim] = horaFim.split(":").map(Number);
            let minInicio = hInicio * 60 + mInicio;
            let minFim = hFim * 60 + mFim;
            if (minFim < minInicio) minFim += 24 * 60; // Plantão cruza meia-noite
            cargaHorariaMinutos = minFim - minInicio;
          } catch (e) {
            console.warn(`[drescala-sync] Erro calculando carga horária para ${idExterno}`);
          }
        }

        const status = plantao.status || (plantao as any).status_escala || "confirmado";
        const tipo = plantao.tipo || (plantao as any).tipo_plantao || null;

        // Upsert na tabela escalas_integradas
        const { error: upsertError } = await supabase
          .from("escalas_integradas")
          .upsert({
            id_externo: idExterno,
            sistema_origem: "DR_ESCALA",
            profissional_nome: profissionalNome,
            profissional_crm: profissionalCrm,
            profissional_id_externo: profissionalIdExterno || null,
            setor: setor,
            unidade: unidade,
            data_escala: dataEscala,
            hora_inicio: horaInicio,
            hora_fim: horaFim,
            carga_horaria_minutos: cargaHorariaMinutos,
            tipo_plantao: tipo,
            status_escala: status,
            sincronizado_em: new Date().toISOString(),
            dados_originais: plantao,
            dados_incompletos: dadosIncompletos,
            motivo_incompleto: motivoIncompleto,
          }, { 
            onConflict: "id_externo,sistema_origem" 
          });

        if (upsertError) {
          throw upsertError;
        }

        totalSucesso++;
      } catch (error: unknown) {
        totalErro++;
        const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
        errosDetalhados.push({ 
          id: String(plantao.id || "unknown"), 
          erro: errorMessage 
        });
        console.error(`[drescala-sync] Erro processando plantão ${plantao.id}:`, errorMessage);
      }
    }

    // 3. Registrar log de sincronização
    const statusFinal = totalErro === 0 ? "sucesso" : totalSucesso === 0 ? "erro" : "parcial";
    
    await supabase.from("escalas_integracao_logs").insert({
      sistema_origem: "DR_ESCALA",
      tipo_operacao: "sync_api",
      status: statusFinal,
      total_registros: totalProcessados,
      registros_sucesso: totalSucesso,
      registros_erro: totalErro,
      mensagem: `Sincronização ${mes}/${ano}: ${totalSucesso} sucesso, ${totalErro} erros (${Date.now() - startTime}ms)`,
      erros_detalhados: errosDetalhados.length > 0 ? errosDetalhados : null,
    });

    console.log(`[drescala-sync] Concluído: ${totalSucesso}/${totalProcessados} sucesso`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Sincronização concluída`,
        total: totalProcessados,
        sucesso: totalSucesso,
        erro: totalErro,
        duracao_ms: Date.now() - startTime,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[drescala-sync] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";

    // Tentar registrar log de erro
    try {
      const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
      const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        await supabase.from("escalas_integracao_logs").insert({
          sistema_origem: "DR_ESCALA",
          tipo_operacao: "sync_api",
          status: "erro",
          total_registros: totalProcessados,
          registros_sucesso: totalSucesso,
          registros_erro: totalErro || 1,
          mensagem: `Erro na sincronização: ${errorMessage}`,
        });
      }
    } catch (logError) {
      console.error("[drescala-sync] Erro ao registrar log:", logError);
    }

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        total: totalProcessados,
        sucesso: totalSucesso,
        erro: totalErro
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
