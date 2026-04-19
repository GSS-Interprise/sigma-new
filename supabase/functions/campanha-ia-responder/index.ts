import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const {
      phone,
      message_text,
      instance_name,
      message_type = "text",
      media_url,
      aggregated_texts,
    } = await req.json();

    if (!phone) throw new Error("phone obrigatório");

    const finalText = aggregated_texts || message_text || "";
    if (!finalText) throw new Error("message_text ou aggregated_texts obrigatório");

    console.log(`[ia] 📩 ${phone}: ${finalText.slice(0, 100)} (type=${message_type})`);

    // ── 1. Identificar lead ──
    const phoneDigits = phone.replace(/\D/g, "");
    let lead: any = null;

    for (const pv of [`+${phoneDigits}`, `+55${phoneDigits}`, phoneDigits]) {
      const { data } = await supabase.from("leads")
        .select("id, nome, phone_e164, especialidade, uf, cidade")
        .eq("phone_e164", pv).is("merged_into_id", null).limit(1).maybeSingle();
      if (data) { lead = data; break; }
    }

    if (!lead) {
      const last8 = phoneDigits.slice(-8);
      const { data } = await supabase.from("leads")
        .select("id, nome, phone_e164, especialidade, uf, cidade")
        .like("phone_e164", `%${last8}`).is("merged_into_id", null).limit(1).maybeSingle();
      if (data) lead = data;
    }

    if (!lead) return json({ ok: false, reason: "lead_not_found" });
    console.log(`[ia] Lead: ${lead.nome} (${lead.id})`);

    // ── 2. Buscar campanha ativa ──
    const { data: campLead } = await supabase.from("campanha_leads")
      .select("id, campanha_id, status, humano_assumiu, historico_conversa, campanha:campanha_id(id, nome, briefing_ia, responsaveis)")
      .eq("lead_id", lead.id).in("status", ["contatado", "em_conversa", "aquecido"])
      .order("data_ultimo_contato", { ascending: false }).limit(1).maybeSingle();

    if (!campLead) return json({ ok: false, reason: "not_in_campaign" });
    if (campLead.humano_assumiu) return json({ ok: true, reason: "humano_assumiu" });

    const campanha = campLead.campanha as any;
    const briefing = campanha?.briefing_ia || {};

    // ── 3. Processar multimodal ──
    let processedText = finalText;
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

    // Transcrição de áudio via Whisper
    if (message_type === "audio" && media_url) {
      console.log(`[ia] 🎙️ Transcrevendo áudio: ${media_url.slice(0, 80)}`);
      try {
        const audioResp = await fetch(media_url);
        if (audioResp.ok) {
          const audioBlob = await audioResp.blob();
          const formData = new FormData();
          formData.append("file", audioBlob, "audio.ogg");
          formData.append("model", "whisper-1");
          formData.append("language", "pt");

          const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
          });

          if (whisperResp.ok) {
            const whisperData = await whisperResp.json();
            processedText = `[Áudio transcrito]: ${whisperData.text}`;
            if (finalText && finalText !== "[audio]") processedText += `\n${finalText}`;
            console.log(`[ia] 🎙️ Transcrição: ${whisperData.text.slice(0, 100)}`);
          }
        }
      } catch (audioErr: any) {
        console.warn(`[ia] ⚠️ Erro transcrição áudio: ${audioErr.message}`);
        processedText = "[Mensagem de áudio não transcrita]";
      }
    }

    // Análise de imagem via GPT-4o Vision
    if (message_type === "image" && media_url) {
      console.log(`[ia] 🖼️ Analisando imagem: ${media_url.slice(0, 80)}`);
      try {
        const visionResp = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o", max_tokens: 300,
            messages: [{
              role: "user",
              content: [
                { type: "text", text: "Descreva esta imagem de forma objetiva em português, em 1-2 frases." },
                { type: "image_url", image_url: { url: media_url } },
              ],
            }],
          }),
        });

        if (visionResp.ok) {
          const visionData = await visionResp.json();
          const desc = visionData.choices?.[0]?.message?.content || "";
          processedText = `[Imagem enviada]: ${desc}`;
          if (finalText && finalText !== "[imagem]") processedText += `\n${finalText}`;
          console.log(`[ia] 🖼️ Análise: ${desc.slice(0, 100)}`);
        }
      } catch (imgErr: any) {
        console.warn(`[ia] ⚠️ Erro análise imagem: ${imgErr.message}`);
      }
    }

    // ── 4. Histórico ──
    const historico: Array<{ role: string; text: string; ts: string }> = campLead.historico_conversa || [];
    historico.push({ role: "medico", text: processedText, ts: new Date().toISOString() });

    const historicoTexto = historico
      .map((m: any) => `${m.role === "medico" ? "Médico" : "GSS"}: ${m.text}`)
      .join("\n");

    // ── 5. Prompt + IA ──
    const prompt = buildPrompt(briefing, lead);

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o", max_tokens: 800, temperature: 0.7,
        messages: [
          { role: "system", content: prompt },
          { role: "user", content: `[HISTÓRICO COMPLETO DA CONVERSA]\n${historicoTexto}\n\n[RESPONDA APENAS A ÚLTIMA MENSAGEM DO MÉDICO. NÃO REPITA PERGUNTAS JÁ RESPONDIDAS.]` },
        ],
      }),
    });

    if (!aiResponse.ok) throw new Error(`OpenAI ${aiResponse.status}: ${(await aiResponse.text()).slice(0, 200)}`);

    const rawOutput = (await aiResponse.json()).choices?.[0]?.message?.content || "";

    // ── 6. Parsear JSON ──
    let parsed: any;
    try {
      parsed = JSON.parse(rawOutput.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim());
    } catch {
      parsed = { messages: [rawOutput], ALERTA_LEAD: false, alerta_tipo: "", alerta_resumo: "", conversa_encerrada: false };
    }

    const messages: string[] = parsed.messages || [rawOutput];
    const alertaLead = parsed.ALERTA_LEAD === true;
    const conversaEncerrada = parsed.conversa_encerrada === true;

    // Salvar respostas no histórico
    for (const msg of messages) {
      historico.push({ role: "gss", text: msg, ts: new Date().toISOString() });
    }

    // ── 7. Enviar via Evolution ──
    const { data: evoConfig } = await supabase.from("config_lista_items")
      .select("campo_nome, valor").in("campo_nome", ["evolution_api_url", "evolution_api_key"]);

    const evoUrl = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
    const evoKey = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;

    if (evoUrl && evoKey && instance_name) {
      const sendUrl = `${evoUrl}/message/sendText/${encodeURIComponent(instance_name)}`;
      for (let i = 0; i < messages.length; i++) {
        if (i > 0) await sleep(2000);
        try {
          const resp = await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({ number: phoneDigits, text: messages[i] }),
          });
          const respText = await resp.text();
          if (!resp.ok) console.error(`[ia] ❌ Evolution ${resp.status}: ${respText.slice(0, 200)}`);
          else console.log(`[ia] ✅ Msg ${i + 1}/${messages.length} enviada`);
        } catch (e: any) { console.error(`[ia] ❌ Fetch: ${e.message}`); }
      }
    }

    // ── 8. Status + histórico ──
    let novoStatus = campLead.status;
    if (alertaLead) novoStatus = "quente";
    else if (conversaEncerrada) novoStatus = "descartado";
    else if (campLead.status === "contatado") novoStatus = "em_conversa";

    await supabase.from("campanha_leads").update({
      historico_conversa: historico,
      data_ultimo_contato: new Date().toISOString(),
    }).eq("id", campLead.id);

    if (novoStatus !== campLead.status) {
      await supabase.rpc("atualizar_status_lead_campanha", {
        p_campanha_id: campLead.campanha_id, p_lead_id: lead.id,
        p_novo_status: novoStatus, p_canal: "whatsapp",
      });
    }

    // ── 9. Handoff ──
    if (alertaLead) {
      const handoffNome = briefing.handoff_nome || "Equipe GSS";
      const handoffTel = briefing.handoff_telefone || "";
      const resumo = parsed.alerta_resumo || "Lead demonstrou interesse real";
      const conversaResumo = historico.slice(-12).map((m: any) => `${m.role === "medico" ? "Médico" : "GSS"}: ${m.text}`).join("\n");

      console.log(`[ia] 🔥 LEAD QUENTE: ${lead.nome} — ${resumo}`);

      if (evoUrl && evoKey && instance_name && handoffTel) {
        const alertMsg =
          `🔥 *LEAD QUENTE — AÇÃO NECESSÁRIA* 🔥\n\n` +
          `*Médico:* ${lead.nome}\n` +
          `*Telefone:* ${lead.phone_e164}\n` +
          `*Especialidade:* ${lead.especialidade || "N/I"}\n` +
          `${lead.cidade ? `*Cidade:* ${lead.cidade}/${lead.uf}\n` : ""}` +
          `*Campanha:* ${campanha.nome}\n\n` +
          `*O que aconteceu:*\n${resumo}\n\n` +
          `*Conversa completa:*\n${conversaResumo}\n\n` +
          `*Próximos passos:*\n` +
          `1. Ligue do SEU telefone para: ${lead.phone_e164}\n` +
          `2. O médico já confirmou interesse — vá direto aos detalhes\n` +
          `3. Apresente valores, escala e condições\n` +
          `4. Se fechar, converta o lead no Sigma`;

        try {
          await fetch(`${evoUrl}/message/sendText/${encodeURIComponent(instance_name)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({ number: handoffTel.replace(/\D/g, ""), text: alertMsg }),
          });
          console.log(`[ia] 📢 Alerta enviado para ${handoffNome}`);
        } catch (e: any) { console.error(`[ia] Falha alerta: ${e.message}`); }
      }
    }

    return json({
      ok: true, lead_id: lead.id, campanha_id: campLead.campanha_id,
      status: novoStatus, messages_sent: messages.length, alerta: alertaLead,
      historico_length: historico.length,
    });
  } catch (err: any) {
    console.error("[ia] ERRO:", err.message);
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function json(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function buildPrompt(b: any, lead: any): string {
  const beneficios = (b.beneficios || []).length > 0 ? `Benefícios: ${b.beneficios.join(", ")}.` : "";
  const objecoes = (b.objecoes || []).map((o: any) => `"${o.objecao}" → "${o.resposta}"`).join("\n  ") || "Nenhuma mapeada.";

  return `<prompt versao="sigma-v3">
<contexto>
Você é representante da GSS Saúde. Fala como colega médico: direto, sem formalidade. Sem emoji. Sem promessas. Nunca mencione IA, bot, automação ou assistente.
</contexto>

<oportunidade>
  Serviço: ${b.nome_servico || "?"} | Hospital: ${b.hospital || "?"} | Cidade: ${b.cidade || "?"}
  Tipo: ${b.tipo_servico || "plantão"} | Contratação: ${b.contratacao || "PJ"}
  Requisito: ${b.requisitos || "Formação na área"}
  ${b.estrutura ? `Estrutura: ${b.estrutura}` : ""}
  Valor: R$ ${b.valor_min || "?"} a R$ ${b.valor_max || "?"} por ${b.valor_por || "plantão"}
  ${beneficios}
  Handoff: ${b.handoff_nome || "equipe"}
</oportunidade>

<fluxo>
REGRA ABSOLUTA: Leia TODO o histórico. NUNCA repita pergunta já respondida.
"Sim" = passo concluído. Avance.

1. Confirmar perfil (especialidade/RQE) — se já respondeu, AVANCE
2. Origem e formação — se já respondeu, AVANCE
3. Experiência na área — se já respondeu, AVANCE
4. Abertura/interesse — se já respondeu, AVANCE
5. Handoff: "Posso passar seu contato pra ${b.handoff_nome || "equipe"}? Vai passar os detalhes."
   Após confirmar: "Ótimo, vou passar. Te chamam em breve."
</fluxo>

<regras>
- Máx 2 msgs. 1 pergunta por vez. Tom de colega.
- Não fale valores. ${b.handoff_nome || "Equipe"} passa detalhes.
- Nunca invente. Use o histórico. Responda perguntas do médico primeiro.
- Sem perfil: agradeça e encerre.
  Objeções: ${objecoes}
</regras>

${b.info_extra ? `<extra>${b.info_extra}</extra>` : ""}

<saida>
JSON válido apenas:
{"messages":["msg1","msg2"],"ALERTA_LEAD":false,"alerta_tipo":"","alerta_resumo":"","conversa_encerrada":false}
ALERTA_LEAD=true quando: interesse confirmado, pediu valores, aceitou handoff.
conversa_encerrada=true quando: sem perfil ou recusou.
</saida>
</prompt>`;
}
