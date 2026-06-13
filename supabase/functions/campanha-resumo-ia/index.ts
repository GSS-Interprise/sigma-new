import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RESPONDEU = ["em_conversa", "aquecido", "quente", "convertido"];
const MAX_CONVERSAS_AMOSTRA = 8;
const MAX_MSGS_POR_CONVERSA = 6;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (!openaiKey) return jsonResp({ ok: false, error: "OPENAI_API_KEY não configurada" }, 500);

  try {
    const { campanha_id, gerado_por = null } = await req.json();
    if (!campanha_id) throw new Error("campanha_id obrigatório");

    const { data: campanha, error: cErr } = await supabase
      .from("campanhas")
      .select("id, nome")
      .eq("id", campanha_id)
      .maybeSingle();
    if (cErr || !campanha) throw new Error(`Campanha não encontrada: ${cErr?.message || "null"}`);

    const { data: cls, error: lErr } = await supabase
      .from("campanha_leads")
      .select("status, resultado_final, motivo_perdido, historico_conversa, leads(especialidade)")
      .eq("campanha_id", campanha_id);
    if (lErr) throw new Error(`Erro ao buscar leads: ${lErr.message}`);

    const leads = cls || [];
    const total = leads.length;

    // Distribuições
    const statusDist: Record<string, number> = {};
    const motivos: Record<string, number> = {};
    const espResponderam: Record<string, number> = {};
    for (const l of leads as any[]) {
      statusDist[l.status] = (statusDist[l.status] || 0) + 1;
      if (l.motivo_perdido) motivos[l.motivo_perdido] = (motivos[l.motivo_perdido] || 0) + 1;
      else if (l.resultado_final === "perdido") motivos["perdido (sem motivo)"] = (motivos["perdido (sem motivo)"] || 0) + 1;
      if (RESPONDEU.includes(l.status)) {
        const esp = l.leads?.especialidade || "Sem especialidade";
        espResponderam[esp] = (espResponderam[esp] || 0) + 1;
      }
    }

    const convertidos = statusDist["convertido"] || 0;
    const responderam = RESPONDEU.reduce((s, k) => s + (statusDist[k] || 0), 0);

    // Amostra de conversas (leads que engajaram)
    const amostra: string[] = [];
    for (const l of leads as any[]) {
      if (amostra.length >= MAX_CONVERSAS_AMOSTRA) break;
      if (!RESPONDEU.includes(l.status)) continue;
      const hist = Array.isArray(l.historico_conversa) ? l.historico_conversa : [];
      if (hist.length < 2) continue;
      const ult = hist.slice(-MAX_MSGS_POR_CONVERSA).map((m: any) => {
        const who = m.from_me || m.role === "assistant" || m.operador === "ia" ? "GSS" : "MED";
        const txt = (m.text || m.content || m.conteudo || m.message || "").toString().slice(0, 200);
        return txt ? `${who}: ${txt}` : "";
      }).filter(Boolean).join("\n");
      if (ult) amostra.push(ult);
    }

    const metricas = {
      total,
      responderam,
      convertidos,
      taxa_resposta_pct: total > 0 ? +((responderam / total) * 100).toFixed(1) : 0,
      taxa_conversao_pct: total > 0 ? +((convertidos / total) * 100).toFixed(1) : 0,
      status: statusDist,
      motivos,
      especialidades_responderam: espResponderam,
    };

    const prompt = `Você é analista de prospecção médica da GSS. Gere um resumo EXECUTIVO (pra diretoria) da campanha "${campanha.nome}".

NÚMEROS:
- Total de leads: ${total}
- Responderam: ${responderam} (${metricas.taxa_resposta_pct}%)
- Convertidos: ${convertidos} (${metricas.taxa_conversao_pct}%)
- Distribuição por status: ${JSON.stringify(statusDist)}
- Motivos de perda: ${JSON.stringify(motivos)}
- Especialidades que mais responderam: ${JSON.stringify(espResponderam)}

AMOSTRA DE CONVERSAS (médicos que engajaram):
${amostra.length ? amostra.map((a, i) => `--- Conversa ${i + 1} ---\n${a}`).join("\n\n") : "(sem conversas com engajamento suficiente)"}

Responda em JSON com:
{
  "resumo_executivo": "2-3 frases diretas pra diretoria sobre o resultado da campanha",
  "o_que_funcionou": "o que deu certo (abordagem, perfil, canal)",
  "perfil_melhor": "qual perfil de médico respondeu/converteu melhor",
  "objecoes": ["objeção recorrente 1", "objeção 2"],
  "ajuste_sugerido": "1 ação concreta pra próxima campanha"
}
Seja específico e baseado nos dados. PT-BR. Sem enrolação.
IMPORTANTE: escreva sempre com acentuação correta do português (ex: "conversão", "médicos", "Tubarão"), MESMO que o texto de entrada apareça com caracteres corrompidos/mojibake — normalize na saída.`;

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
        temperature: 0.4,
      }),
    });
    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      throw new Error(`OpenAI ${openaiResp.status}: ${errText.slice(0, 300)}`);
    }
    const openaiData = await openaiResp.json();
    const resumo = JSON.parse(openaiData.choices?.[0]?.message?.content || "{}");

    const { data: saved, error: sErr } = await supabase
      .from("campanha_resumos")
      .insert({ campanha_id, resumo, metricas, gerado_por })
      .select("id, created_at")
      .single();
    if (sErr) throw new Error(`Erro ao salvar resumo: ${sErr.message}`);

    return jsonResp({ ok: true, id: saved.id, created_at: saved.created_at, resumo, metricas });
  } catch (err) {
    console.error("[campanha-resumo-ia]", err.message);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
