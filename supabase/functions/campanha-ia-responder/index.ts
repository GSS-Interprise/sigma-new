import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { phone, message_text, instance_name, message_type = "text" } =
      await req.json();

    if (!phone || !message_text) throw new Error("phone e message_text obrigatórios");
    console.log(`[ia-responder] Mensagem de ${phone}: ${message_text.slice(0, 100)}`);

    // ── 1. Identificar lead pelo telefone ──
    const phoneDigits = phone.replace(/\D/g, "");
    const phoneVariants = [
      `+${phoneDigits}`,
      `+55${phoneDigits}`,
      phoneDigits,
    ];

    let lead: any = null;
    for (const pv of phoneVariants) {
      const { data } = await supabase
        .from("leads")
        .select("id, nome, phone_e164, especialidade, uf, cidade")
        .eq("phone_e164", pv)
        .is("merged_into_id", null)
        .limit(1)
        .maybeSingle();
      if (data) { lead = data; break; }
    }

    // Fallback: LIKE search
    if (!lead) {
      const lastDigits = phoneDigits.slice(-8);
      const { data } = await supabase
        .from("leads")
        .select("id, nome, phone_e164, especialidade, uf, cidade")
        .like("phone_e164", `%${lastDigits}`)
        .is("merged_into_id", null)
        .limit(1)
        .maybeSingle();
      if (data) lead = data;
    }

    if (!lead) {
      console.log(`[ia-responder] Lead não encontrado para ${phone}`);
      return json({ ok: false, reason: "lead_not_found" });
    }

    console.log(`[ia-responder] Lead encontrado: ${lead.nome} (${lead.id})`);

    // ── 2. Buscar campanha ativa desse lead ──
    const { data: campLead } = await supabase
      .from("campanha_leads")
      .select("id, campanha_id, status, tentativas, humano_assumiu, historico_conversa, campanha:campanha_id(id, nome, briefing_ia, mensagem_inicial, responsaveis)")
      .eq("lead_id", lead.id)
      .in("status", ["contatado", "em_conversa", "aquecido"])
      .order("data_ultimo_contato", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!campLead) {
      console.log(`[ia-responder] Lead ${lead.nome} não está em campanha ativa`);
      return json({ ok: false, reason: "not_in_campaign" });
    }

    // ── 3. Check se humano já assumiu ──
    if (campLead.humano_assumiu) {
      console.log(`[ia-responder] Humano já assumiu conversa com ${lead.nome} — IA não responde`);
      return json({ ok: true, reason: "humano_assumiu", lead_id: lead.id });
    }

    const campanha = campLead.campanha as any;
    const briefing = campanha?.briefing_ia || {};

    // ── 4. Recuperar e atualizar histórico da conversa ──
    const historico: Array<{role: string, text: string, ts: string}> = campLead.historico_conversa || [];

    // Adicionar mensagem do médico ao histórico
    historico.push({
      role: "medico",
      text: message_text,
      ts: new Date().toISOString(),
    });

    // Montar texto do histórico pra IA
    const historicoTexto = historico
      .map((m: any) => `${m.role === "medico" ? "Médico" : "GSS"}: ${m.text}`)
      .join("\n");

    // ── 5. Montar prompt dinâmico ──
    const prompt = buildPrompt(briefing, lead);

    // ── 6. Chamar IA ──
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

    const aiMessages = [
      { role: "system" as const, content: prompt },
      {
        role: "user" as const,
        content: historicoTexto
          ? `[HISTÓRICO DA CONVERSA]\n${historicoTexto}\n\n[RESPONDA A ÚLTIMA MENSAGEM DO MÉDICO]`
          : message_text,
      },
    ];

    console.log(`[ia-responder] Chamando OpenAI com ${historico.length} msgs de histórico`);

    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          max_tokens: 800,
          temperature: 0.7,
          messages: aiMessages,
        }),
      }
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      throw new Error(`OpenAI error ${aiResponse.status}: ${errText.slice(0, 200)}`);
    }

    const aiResult = await aiResponse.json();
    const rawOutput = aiResult.choices?.[0]?.message?.content || "";

    // ── 7. Parsear saída JSON ──
    let parsed: any;
    try {
      const jsonStr = rawOutput
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = {
        messages: [rawOutput],
        ALERTA_LEAD: false,
        alerta_tipo: "",
        alerta_resumo: "",
        conversa_encerrada: false,
      };
    }

    const messages: string[] = parsed.messages || [rawOutput];
    const alertaLead = parsed.ALERTA_LEAD === true;
    const alertaTipo = parsed.alerta_tipo || "";
    const conversaEncerrada = parsed.conversa_encerrada === true;

    // Adicionar respostas da IA ao histórico
    for (const msg of messages) {
      historico.push({
        role: "gss",
        text: msg,
        ts: new Date().toISOString(),
      });
    }

    // ── 8. Enviar respostas via Evolution API ──
    const { data: evoConfig } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);

    const evoUrl = evoConfig
      ?.find((c: any) => c.campo_nome === "evolution_api_url")
      ?.valor?.replace(/\/+$/, "");
    const evoKey = evoConfig?.find(
      (c: any) => c.campo_nome === "evolution_api_key"
    )?.valor;

    if (evoUrl && evoKey && instance_name) {
      const sendUrl = `${evoUrl}/message/sendText/${encodeURIComponent(instance_name)}`;
      console.log(`[ia-responder] 📡 Enviando ${messages.length} msg(s) para ${phone} via ${instance_name}`);

      for (let i = 0; i < messages.length; i++) {
        if (i > 0) await sleep(2000);
        try {
          const sendResp = await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({ number: phoneDigits, text: messages[i] }),
          });

          const sendRespText = await sendResp.text();
          if (!sendResp.ok) {
            console.error(`[ia-responder] ❌ Evolution ${sendResp.status}: ${sendRespText.slice(0, 300)}`);
          } else {
            let respData: any = {};
            try { respData = JSON.parse(sendRespText); } catch {}
            console.log(`[ia-responder] ✅ Msg ${i + 1} enviada → JID: ${respData?.key?.remoteJid || "?"}`);
          }
        } catch (sendErr: any) {
          console.error(`[ia-responder] ❌ Erro fetch msg ${i + 1}:`, sendErr.message);
        }
      }
    }

    // ── 9. Atualizar status e salvar histórico ──
    let novoStatus = campLead.status;
    if (alertaLead && alertaTipo === "lead_quente") {
      novoStatus = "quente";
    } else if (conversaEncerrada) {
      novoStatus = "descartado";
    } else if (campLead.status === "contatado") {
      novoStatus = "em_conversa";
    }

    // Salvar histórico na campanha_leads
    await supabase
      .from("campanha_leads")
      .update({
        historico_conversa: historico,
        data_ultimo_contato: new Date().toISOString(),
      })
      .eq("id", campLead.id);

    // Atualizar status se mudou
    if (novoStatus !== campLead.status) {
      await supabase.rpc("atualizar_status_lead_campanha", {
        p_campanha_id: campLead.campanha_id,
        p_lead_id: lead.id,
        p_novo_status: novoStatus,
        p_canal: "whatsapp",
      });
    }

    // ── 10. Alerta de lead quente → notificar responsável ──
    if (alertaLead && alertaTipo === "lead_quente") {
      const handoffNome = briefing.handoff_nome || "Equipe GSS";
      const handoffTelefone = briefing.handoff_telefone || "";
      const resumo = parsed.alerta_resumo || "Lead demonstrou interesse real";

      console.log(`[ia-responder] 🔥 LEAD QUENTE: ${lead.nome} (${phone}) - ${resumo}`);

      // Montar resumo da conversa
      const conversaResumo = historico
        .slice(-12)
        .map((m: any) => `${m.role === "medico" ? "Médico" : "GSS"}: ${m.text}`)
        .join("\n");

      if (evoUrl && evoKey && instance_name && handoffTelefone) {
        const alertMsg =
          `🔥 *LEAD QUENTE — AÇÃO NECESSÁRIA* 🔥\n\n` +
          `*Médico:* ${lead.nome}\n` +
          `*Telefone:* ${lead.phone_e164}\n` +
          `*Especialidade:* ${lead.especialidade || "N/I"}\n` +
          `${lead.cidade ? `*Cidade:* ${lead.cidade}/${lead.uf}\n` : ""}` +
          `*Campanha:* ${campanha.nome}\n\n` +
          `*O que aconteceu:*\n${resumo}\n\n` +
          `*Resumo da conversa:*\n${conversaResumo}\n\n` +
          `*Como seguir:*\n` +
          `1. Ligue ou mande WhatsApp do SEU número para ${lead.nome}\n` +
          `2. Telefone do médico: ${lead.phone_e164}\n` +
          `3. O médico já demonstrou interesse — NÃO comece do zero\n` +
          `4. Vá direto aos detalhes: valores, escala, contrato\n` +
          `5. Se fechar, converta o lead no Sigma`;

        try {
          const sendUrl = `${evoUrl}/message/sendText/${encodeURIComponent(instance_name)}`;

          await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({
              number: handoffTelefone.replace(/\D/g, ""),
              text: alertMsg,
            }),
          });

          console.log(`[ia-responder] 📢 Alerta enviado para ${handoffNome} (${handoffTelefone})`);
        } catch (alertErr: any) {
          console.error(`[ia-responder] Falha ao alertar ${handoffNome}:`, alertErr.message);
        }
      } else {
        console.warn(`[ia-responder] ⚠️ Sem telefone de handoff configurado no briefing`);
      }
    }

    return json({
      ok: true,
      lead_id: lead.id,
      campanha_id: campLead.campanha_id,
      status: novoStatus,
      messages_sent: messages.length,
      alerta: alertaLead,
      historico_length: historico.length,
    });
  } catch (err: any) {
    console.error("[ia-responder] ERRO:", err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ── Helpers ──

function json(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function buildPrompt(briefing: any, lead: any): string {
  const b = briefing || {};
  const beneficiosText =
    (b.beneficios || []).length > 0
      ? `Benefícios inclusos: ${b.beneficios.join(", ")}.`
      : "";

  const objecoesText =
    (b.objecoes || [])
      .map((o: any) => `Se disser "${o.objecao}": responda "${o.resposta}"`)
      .join("\n  ") || "Sem objeções mapeadas.";

  return `<prompt versao="sigma-prospeccao-v2">

<contexto>
Você é um representante da GSS Gestão de Serviços de Saúde. Fala como colega de profissão: solto, direto, sem formalidade excessiva. Sem emoji. Sem promessas exageradas. Sem papo de telemarketing. Nunca mencione IA, automação, chatbot, prompt ou assistente virtual.
</contexto>

<oportunidade>
  <nome_servico>${b.nome_servico || "Serviço médico"}</nome_servico>
  <hospital>${b.hospital || "A definir"}</hospital>
  <cidade>${b.cidade || "A definir"}</cidade>
  <tipo_servico>${b.tipo_servico || "plantão"}</tipo_servico>
  <requisito_minimo>${b.requisitos || "Formação na especialidade"}</requisito_minimo>
  <estrutura>${b.estrutura || ""}</estrutura>
  <contratacao>${b.contratacao || "PJ"}</contratacao>
  <valor>R$ ${b.valor_min || "?"} a R$ ${b.valor_max || "?"} por ${b.valor_por || "plantão"}</valor>
  ${beneficiosText}
  <handoff_nome>${b.handoff_nome || "equipe GSS"}</handoff_nome>
</oportunidade>

<fluxo_conversa>
CRÍTICO: Leia TODO o histórico antes de responder. NUNCA repita uma pergunta já respondida.
Se o médico já disse a especialidade, NÃO pergunte de novo. Avance.
Um "Sim" como resposta = passo concluído. Registre e avance.

Siga essa ordem. 1 pergunta por vez. Pule o que já estiver respondido.

PASSO 1 — Confirmar perfil:
  Verificar se é da especialidade certa e tem os requisitos.
  Se já respondeu: avance.

PASSO 2 — Origem e formação:
  De onde é, onde se formou.
  Se já respondeu: avance.

PASSO 3 — Experiência relevante:
  Já trabalhou em serviço similar?
  Se já respondeu: avance.

PASSO 4 — Abertura para proposta:
  Teria interesse ou abertura?
  Se já respondeu: avance.

PASSO 5 — Handoff:
  Quando demonstrar interesse real OU perguntar valores:
  "Posso passar seu contato pra ${b.handoff_nome || "nossa equipe"}? Vai te passar todos os detalhes sobre valores e escala."
  Só após confirmação: "Ótimo, vou passar. Te chamam em breve."
</fluxo_conversa>

<regras>
  - Máximo 2 mensagens por resposta.
  - 1 pergunta por vez.
  - Tom solto, direto, como colega.
  - Não fale valores específicos. Diga que ${b.handoff_nome || "a equipe"} passa os detalhes.
  - Nunca invente informação.
  - USE O HISTÓRICO. Não pergunte de novo o que já foi respondido.
  - Se o médico fizer uma pergunta, responda PRIMEIRO, depois retome o fluxo.
  - Se não tiver o requisito mínimo: agradeça e encerre.

  Objeções conhecidas:
  ${objecoesText}
</regras>

<anti_loop>
  CRÍTICO: Antes de fazer qualquer pergunta, verifique se ela JÁ FOI FEITA no histórico.
  Se sim, NÃO repita. Avance para o próximo passo.
  Se o médico respondeu "Sim" a uma pergunta, o passo está CONCLUÍDO.
  Nunca faça a mesma pergunta duas vezes.
</anti_loop>

${b.info_extra ? `<info_adicional>${b.info_extra}</info_adicional>` : ""}

<saida_json>
Responda EXCLUSIVAMENTE com JSON válido:
{
  "messages": ["Mensagem 1", "Mensagem 2"],
  "ALERTA_LEAD": false,
  "alerta_tipo": "",
  "alerta_resumo": "",
  "conversa_encerrada": false
}

- Máximo 2 mensagens no array.
- ALERTA_LEAD: true quando lead está quente (interesse real confirmado, pediu handoff, perguntou valores).
- alerta_tipo: "lead_quente" quando ALERTA_LEAD for true.
- alerta_resumo: resumo curto do motivo quando ALERTA_LEAD for true.
- conversa_encerrada: true quando o médico não tem perfil ou recusou definitivamente.
</saida_json>

</prompt>`;
}
