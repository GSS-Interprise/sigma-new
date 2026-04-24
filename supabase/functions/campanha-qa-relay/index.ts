// Chamado pelo bridge N8N quando detecta que responsável respondeu (quote) a um alerta pendente.
// Busca a pergunta pendente pelo alerta_msg_id, pede IA pra reformular a resposta em linguagem
// natural pro médico, envia via chip da campanha, marca como respondida+relayed, libera lead.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { quoted_msg_id, resposta_humana, from_phone } = await req.json();
    if (!quoted_msg_id) throw new Error("quoted_msg_id obrigatório");
    if (!resposta_humana) throw new Error("resposta_humana obrigatória");

    console.log(`[qa-relay] 🔄 quote=${quoted_msg_id.slice(0, 20)} resposta="${resposta_humana.slice(0, 80)}"`);

    // Busca pergunta pendente
    const { data: pend } = await supabase
      .from("campanha_perguntas_pendentes")
      .select("*, campanha_lead:campanha_lead_id(id, historico_conversa, campanha:campanha_id(briefing_ia, chip_id, chip_ids, nome))")
      .eq("alerta_msg_id", quoted_msg_id)
      .eq("respondida", false)
      .maybeSingle();

    if (!pend) {
      console.warn(`[qa-relay] ⚠️ pergunta pendente não encontrada pra quote=${quoted_msg_id}`);
      return jsonResp({ ok: false, reason: "pergunta_nao_encontrada" });
    }

    const campLead = (pend as any).campanha_lead;
    const campanha = campLead?.campanha;
    if (!campanha) throw new Error("campanha não carregou");

    const briefing = campanha.briefing_ia || {};
    const handoffNome = briefing.handoff_nome || "nossa equipe";

    // Busca lead pra pegar phone
    const { data: lead } = await supabase
      .from("leads")
      .select("id, nome, phone_e164")
      .eq("id", pend.lead_id)
      .maybeSingle();
    if (!lead) throw new Error("lead não encontrado");

    // Chip original da campanha
    const chipId = campanha.chip_id || (campanha.chip_ids || [])[0];
    const { data: chip } = await supabase
      .from("chips")
      .select("id, instance_name")
      .eq("id", chipId)
      .maybeSingle();
    if (!chip) throw new Error("chip da campanha não encontrado");

    // Credenciais
    const { data: evoConfig } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    const evoUrl = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
    const evoKey = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!evoUrl || !evoKey) throw new Error("Evolution não configurada");
    if (!openaiKey) throw new Error("OPENAI_API_KEY não configurada");

    // Pede pra IA reformular a resposta do humano em linguagem natural
    const systemPrompt = `Você é da equipe GSS conversando com um médico via WhatsApp como colega de profissão. O responsável da campanha (${handoffNome}) acabou de te mandar a resposta pra uma dúvida que o médico fez.
Sua missão: reformular a resposta do ${handoffNome} numa mensagem NATURAL e CURTA pro médico, no mesmo tom que vocês já conversavam.
Regras:
- 1-2 msgs curtas no máximo
- Não mencione "${handoffNome} me disse" literalmente — você absorve a info e fala como se fosse sua
- Sem formalidade vazia, sem "espero ter ajudado"
- Depois de entregar a info, devolva a conversa pro fluxo natural com uma pergunta ou comentário curto que mantenha o médico engajado
- NÃO invente nada além do que o ${handoffNome} falou. Se a resposta dele é ambígua, mantenha ambígua.
- Saída: JSON {"messages": ["msg1","msg2"]}`;

    const contextoHist = (campLead.historico_conversa || []).slice(-6).map((m: any) => `${m.role === "medico" ? "Médico" : "IA"}: ${m.text}`).join("\n");
    const userPrompt = `PERGUNTA ORIGINAL DO MÉDICO:
"${pend.pergunta_medico}"

ÚLTIMO CONTEXTO DA CONVERSA:
${contextoHist}

RESPOSTA DO ${handoffNome.toUpperCase()}:
"${resposta_humana}"

Reformula isso em 1-2 msgs naturais pro médico.`;

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.6,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!aiResp.ok) throw new Error(`openai ${aiResp.status}: ${(await aiResp.text()).slice(0, 200)}`);
    const aiData = await aiResp.json();
    const rawOut = aiData.choices?.[0]?.message?.content || "{}";
    let parsed: any;
    try { parsed = JSON.parse(rawOut); } catch { parsed = { messages: [resposta_humana] }; }
    const messages: string[] = Array.isArray(parsed.messages) && parsed.messages.length > 0 ? parsed.messages : [resposta_humana];

    // Envia pro médico via chip original
    const phoneDigits = (lead.phone_e164 || "").replace(/\D/g, "");
    const sendUrl = `${evoUrl}/message/sendText/${encodeURIComponent(chip.instance_name)}`;
    let relayedText = "";
    for (let i = 0; i < messages.length; i++) {
      if (i > 0) await sleep(1500 + Math.random() * 1500);
      try {
        const r = await fetch(sendUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify({ number: phoneDigits, text: messages[i] }),
        });
        if (r.ok) relayedText += (relayedText ? "\n" : "") + messages[i];
      } catch (e: any) { console.error(`[qa-relay] send err: ${e.message}`); }
    }

    // Atualiza histórico do lead
    const novoHist = [...(campLead.historico_conversa || [])];
    for (const m of messages) novoHist.push({ role: "gss", text: m, ts: new Date().toISOString(), via_qa_relay: true });
    await supabase.from("campanha_leads").update({
      historico_conversa: novoHist,
      aguarda_resposta_humana: false,
      data_ultimo_contato: new Date().toISOString(),
    }).eq("id", campLead.id);

    // Marca pergunta como respondida + relayed
    await supabase
      .from("campanha_perguntas_pendentes")
      .update({
        respondida: true,
        resposta_humana,
        respondida_at: new Date().toISOString(),
        relayed: true,
        relayed_at: new Date().toISOString(),
        relayed_text: relayedText,
      })
      .eq("id", pend.id);

    // Log
    await supabase.from("lead_historico").insert({
      lead_id: lead.id,
      tipo_evento: "qa_resposta_relayed",
      descricao_resumida: `Resposta do ${handoffNome} encaminhada pro médico: ${relayedText.slice(0, 200)}`,
      metadados: {
        campanha_id: pend.campanha_id,
        campanha_lead_id: pend.campanha_lead_id,
        pergunta_pendente_id: pend.id,
        alerta_msg_id: quoted_msg_id,
        resposta_do_humano: resposta_humana.slice(0, 300),
      },
    });

    console.log(`[qa-relay] ✅ relayed ${messages.length} msg(s) pro médico`);

    return jsonResp({ ok: true, relayed: messages.length, lead_id: lead.id });
  } catch (err: any) {
    console.error("[qa-relay] ERRO:", err.message);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
