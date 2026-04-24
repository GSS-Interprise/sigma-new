import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_MSGS_PARA_EXTRAIR = 4;
const MAX_TIMELINE_MSGS = 80;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseKey);

  if (!openaiKey) {
    return jsonResp({ ok: false, error: "OPENAI_API_KEY não configurada" }, 500);
  }

  try {
    const { lead_id, force = false } = await req.json();
    if (!lead_id) throw new Error("lead_id obrigatório");

    console.log(`[perfil] 🔍 extraindo ${lead_id} (force=${force})`);

    // 1. Buscar dados do lead
    const { data: lead, error: leadErr } = await supabase
      .from("leads")
      .select("id, nome, phone_e164, especialidade, uf, cidade, email, classificacao, opt_out")
      .eq("id", lead_id)
      .is("merged_into_id", null)
      .maybeSingle();

    if (leadErr || !lead) throw new Error(`Lead não encontrado: ${leadErr?.message || "null"}`);
    if (lead.opt_out) {
      return jsonResp({ ok: false, reason: "opt_out", lead_id });
    }

    // 2. Buscar timeline (conversa real, filtra sistema)
    const { data: timelineAll } = await supabase
      .from("vw_lead_timeline")
      .select("ts, origem, operador, canal, conteudo")
      .eq("lead_id", lead_id)
      .in("operador", ["lead", "ia", "humano"])
      .not("conteudo", "is", null)
      .order("ts", { ascending: true })
      .limit(MAX_TIMELINE_MSGS);

    const timeline = (timelineAll || []).filter((m: any) => (m.conteudo || "").trim().length > 0);

    // Conta interações do lead propriamente dito
    const leadMsgs = timeline.filter((m: any) => m.operador === "lead").length;
    if (leadMsgs < MIN_MSGS_PARA_EXTRAIR && !force) {
      return jsonResp({
        ok: false,
        reason: "insuficiente",
        lead_msgs: leadMsgs,
        minimo: MIN_MSGS_PARA_EXTRAIR,
      });
    }

    // 3. Perfil atual (pra atualizar, não sobrescrever cego)
    const { data: perfilAtual } = await supabase
      .from("banco_interesse_leads")
      .select("*")
      .eq("lead_id", lead_id)
      .maybeSingle();

    // 4. Construir timeline resumida (formato compacto)
    const timelineTxt = timeline
      .map((m: any) => {
        const role =
          m.operador === "lead" ? "MED" :
          m.operador === "ia" ? "IA" :
          m.operador === "humano" ? "GSS" : "SYS";
        const origem = m.origem === "campanha_ia" ? "[IA]" :
                       m.origem === "conversa_manual" ? "[HUM]" : "[*]";
        return `${origem} ${role}: ${(m.conteudo || "").slice(0, 300)}`;
      })
      .join("\n");

    // 5. Prompt pra extração
    const systemPrompt = `Você é analista de dados de recrutamento médico.
Leia a timeline de conversas do médico com a GSS e extraia interesses estruturados.
Se já há perfil salvo, ATUALIZE com info nova — preserve o que foi confirmado antes.
Se uma informação não aparece em lugar nenhum, retorne null. NÃO invente.
Priorize o que o médico falou explicitamente sobre o que ele quer/prefere.
Observações devem ser CURTAS (2-4 linhas), objetivas, em português, 3ª pessoa.`;

    const userPrompt = `<lead>
Nome: ${lead.nome}
Especialidade base: ${lead.especialidade || "desconhecida"}
Cidade/UF: ${lead.cidade || "?"}/${lead.uf || "?"}
</lead>

<perfil_atual>
${perfilAtual ? JSON.stringify({
  tipo_contratacao_preferida: perfilAtual.tipo_contratacao_preferida,
  modalidade_preferida: perfilAtual.modalidade_preferida,
  valor_minimo_aceitavel: perfilAtual.valor_minimo_aceitavel,
  ufs: perfilAtual.ufs,
  cidades: perfilAtual.cidades,
  dias_preferidos: perfilAtual.dias_preferidos,
  periodo_preferido: perfilAtual.periodo_preferido,
  disponibilidade_plantoes_mes: perfilAtual.disponibilidade_plantoes_mes,
  observacoes_ia: perfilAtual.observacoes_ia,
}, null, 2) : "nenhum perfil anterior"}
</perfil_atual>

<timeline_conversas>
${timelineTxt}
</timeline_conversas>

<saida>
Retorne JSON válido com esse schema exato:
{
  "tipo_contratacao_preferida": ["pj"|"clt"|"cooperativa"] | null,
  "modalidade_preferida": ["plantao_12h"|"plantao_24h"|"producao"|"rotina"|"sobreaviso"] | null,
  "valor_minimo_aceitavel": number | null,
  "valor_minimo_unidade": "plantao"|"hora"|"mes" | null,
  "ufs": ["SC","RS",...] | null,
  "cidades": ["Chapecó","Florianópolis",...] | null,
  "dias_preferidos": ["seg","ter","qua","qui","sex","sab","dom","fds","uteis"] | null,
  "periodo_preferido": "diurno"|"noturno"|"flex" | null,
  "disponibilidade_plantoes_mes": number | null,
  "observacoes_ia": "texto 2-4 linhas resumindo preferências, objeções recorrentes, contexto chave",
  "confianca_score": 0..100,
  "mudancas_vs_perfil_atual": "texto curto sobre o que mudou"
}
</saida>`;

    // 6. Chamar OpenAI
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!openaiResp.ok) {
      const errText = await openaiResp.text();
      throw new Error(`OpenAI ${openaiResp.status}: ${errText.slice(0, 300)}`);
    }

    const openaiData = await openaiResp.json();
    const rawContent = openaiData.choices?.[0]?.message?.content || "{}";

    let parsed: any;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      throw new Error(`JSON inválido do modelo: ${rawContent.slice(0, 300)}`);
    }

    // 7. Sanitizar e UPSERT
    const payload = {
      lead_id: lead_id,
      tipo_contratacao_preferida: asStringArray(parsed.tipo_contratacao_preferida),
      modalidade_preferida: asStringArray(parsed.modalidade_preferida),
      valor_minimo_aceitavel: asNumber(parsed.valor_minimo_aceitavel),
      valor_minimo_unidade: asString(parsed.valor_minimo_unidade),
      ufs: asStringArray(parsed.ufs),
      cidades: asStringArray(parsed.cidades),
      dias_preferidos: asStringArray(parsed.dias_preferidos),
      periodo_preferido: asString(parsed.periodo_preferido),
      disponibilidade_plantoes_mes: asInt(parsed.disponibilidade_plantoes_mes),
      observacoes_ia: asString(parsed.observacoes_ia),
      confianca_score: asInt(parsed.confianca_score),
      extracao_fonte: "ia_auto",
      ultima_extracao_em: new Date().toISOString(),
    };

    // Remove chaves null/undefined pra não sobrescrever com null (UPSERT usa defaults)
    const payloadLimpo: any = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v !== null && v !== undefined) payloadLimpo[k] = v;
    }

    const { error: upsertErr } = await supabase
      .from("banco_interesse_leads")
      .upsert(payloadLimpo, { onConflict: "lead_id" });

    if (upsertErr) throw new Error(`UPSERT falhou: ${upsertErr.message}`);

    // 8. Log em lead_historico
    await supabase.from("lead_historico").insert({
      lead_id: lead_id,
      tipo_evento: "perfil_extraido",
      descricao_resumida: `Perfil extraído pela IA (confiança ${payload.confianca_score || 0}%). ${parsed.mudancas_vs_perfil_atual || ""}`.slice(0, 500),
      metadados: {
        confianca: payload.confianca_score,
        mudancas: parsed.mudancas_vs_perfil_atual,
        timeline_count: timeline.length,
        lead_msgs: leadMsgs,
      },
    });

    console.log(`[perfil] ✅ ${lead.nome} (conf ${payload.confianca_score}%)`);

    return jsonResp({
      ok: true,
      lead_id,
      perfil: payloadLimpo,
      timeline_analisada: timeline.length,
      confianca_score: payload.confianca_score,
    });
  } catch (err: any) {
    console.error("[perfil] ❌", err.message);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asString(v: any): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function asNumber(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function asInt(v: any): number | null {
  const n = asNumber(v);
  return n === null ? null : Math.round(n);
}

function asStringArray(v: any): string[] | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) return null;
  const filtered = v.map((x) => (x === null || x === undefined ? null : String(x).trim()))
                    .filter((x): x is string => x !== null && x.length > 0);
  return filtered.length > 0 ? filtered : null;
}
