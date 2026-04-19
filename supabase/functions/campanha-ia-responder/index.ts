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
    const normalizedPhone = "+" + phone.replace(/\D/g, "");
    const { data: lead } = await supabase
      .from("leads")
      .select("id, nome, phone_e164, especialidade, uf, cidade")
      .or(`phone_e164.eq.${normalizedPhone},phone_e164.eq.${phone}`)
      .is("merged_into_id", null)
      .limit(1)
      .single();

    if (!lead) {
      console.log(`[ia-responder] Lead não encontrado para ${phone}`);
      return json({ ok: false, reason: "lead_not_found" });
    }

    // ── 2. Buscar campanha ativa desse lead ──
    const { data: campLead } = await supabase
      .from("campanha_leads")
      .select("id, campanha_id, status, tentativas, campanha:campanha_id(id, nome, briefing_ia, mensagem_inicial, responsaveis)")
      .eq("lead_id", lead.id)
      .in("status", ["contatado", "em_conversa", "aquecido"])
      .order("data_ultimo_contato", { ascending: false })
      .limit(1)
      .single();

    if (!campLead) {
      console.log(`[ia-responder] Lead ${lead.nome} não está em nenhuma campanha ativa`);
      return json({ ok: false, reason: "not_in_campaign" });
    }

    const campanha = campLead.campanha as any;
    const briefing = campanha?.briefing_ia || {};

    // ── 3. Buscar histórico de mensagens ──
    const { data: historico } = await supabase
      .from("sigzap_messages")
      .select("message_text, from_me, sent_at")
      .eq("conversation_id", campLead.id) // may need adjustment
      .order("sent_at", { ascending: true })
      .limit(20);

    // Fallback: buscar por phone no lead_historico
    const historicoTexto = (historico || [])
      .map((m: any) => `${m.from_me ? "GSS" : "Médico"}: ${m.message_text}`)
      .join("\n");

    // ── 4. Montar prompt dinâmico a partir do briefing ──
    const prompt = buildPrompt(briefing, lead);

    // ── 5. Chamar IA (OpenAI/Claude) ──
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

    const aiMessages = [
      { role: "system", content: prompt },
    ];

    if (historicoTexto) {
      aiMessages.push({
        role: "user",
        content: `[HISTÓRICO DA CONVERSA]\n${historicoTexto}\n\n[NOVA MENSAGEM DO MÉDICO]\n${message_text}`,
      });
    } else {
      aiMessages.push({
        role: "user",
        content: message_text,
      });
    }

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

    // ── 6. Parsear saída JSON ──
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

    // ── 7. Enviar respostas via Evolution API ──
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
      const phoneNumber = phone.replace(/\D/g, "");
      for (let i = 0; i < messages.length; i++) {
        if (i > 0) await sleep(2000); // 2s entre msgs
        try {
          await fetch(
            `${evoUrl}/message/sendText/${encodeURIComponent(instance_name)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", apikey: evoKey },
              body: JSON.stringify({ number: phoneNumber, text: messages[i] }),
            }
          );
          console.log(`[ia-responder] ✅ Msg ${i + 1} enviada`);
        } catch (sendErr: any) {
          console.error(`[ia-responder] ❌ Erro envio msg ${i + 1}:`, sendErr.message);
        }
      }
    }

    // ── 8. Atualizar status do lead na campanha ──
    let novoStatus = "em_conversa";
    if (alertaLead && alertaTipo === "lead_quente") {
      novoStatus = "quente";
    } else if (conversaEncerrada) {
      novoStatus = "descartado";
    } else if (campLead.status === "contatado") {
      novoStatus = "em_conversa";
    }

    // Só atualiza se mudou
    if (novoStatus !== campLead.status) {
      await supabase.rpc("atualizar_status_lead_campanha", {
        p_campanha_id: campLead.campanha_id,
        p_lead_id: lead.id,
        p_novo_status: novoStatus,
        p_canal: "whatsapp",
      });
    } else {
      // Atualiza data_ultimo_contato
      await supabase
        .from("campanha_leads")
        .update({ data_ultimo_contato: new Date().toISOString() })
        .eq("id", campLead.id);
    }

    // ── 9. Alerta de lead quente → notificar responsáveis ──
    if (alertaLead && alertaTipo === "lead_quente") {
      const responsaveis = campanha?.responsaveis || [];
      const resumo = parsed.alerta_resumo || "Lead demonstrou interesse real";

      console.log(
        `[ia-responder] 🔥 LEAD QUENTE: ${lead.nome} (${phone}) - ${resumo}`
      );

      // Notificar cada responsável via WhatsApp
      if (evoUrl && evoKey && instance_name && responsaveis.length > 0) {
        // Buscar telefones dos responsáveis
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, nome_completo, telefone")
          .in("id", responsaveis);

        for (const p of profiles || []) {
          if (p.telefone) {
            const alertMsg =
              `🔥 *LEAD QUENTE* 🔥\n\n` +
              `Médico: ${lead.nome}\n` +
              `Telefone: ${lead.phone_e164}\n` +
              `Especialidade: ${lead.especialidade || "N/I"}\n` +
              `${lead.cidade ? `Cidade: ${lead.cidade}/${lead.uf}` : ""}\n\n` +
              `${resumo}\n\n` +
              `Campanha: ${campanha.nome}\n` +
              `Assuma a conversa no SigZap.`;

            try {
              await fetch(
                `${evoUrl}/message/sendText/${encodeURIComponent(instance_name)}`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json", apikey: evoKey },
                  body: JSON.stringify({
                    number: p.telefone.replace(/\D/g, ""),
                    text: alertMsg,
                  }),
                }
              );
              console.log(`[ia-responder] 📢 Alerta enviado para ${p.nome_completo}`);
            } catch {
              console.error(`[ia-responder] Falha ao alertar ${p.nome_completo}`);
            }
          }
        }
      }
    }

    return json({
      ok: true,
      lead_id: lead.id,
      campanha_id: campLead.campanha_id,
      status: novoStatus,
      messages_sent: messages.length,
      alerta: alertaLead,
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

  return `<prompt versao="sigma-prospeccao-dinamica">

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
  <handoff_telefone>${b.handoff_telefone || ""}</handoff_telefone>
</oportunidade>

<fluxo_conversa>
Siga essa ordem. 1 pergunta por vez. Pule o que já estiver respondido.

PASSO 1 — Confirmar perfil:
  Verificar se é da especialidade certa e tem os requisitos.

PASSO 2 — Origem e formação:
  De onde é, onde se formou.

PASSO 3 — Experiência relevante:
  Já trabalhou em serviço similar?

PASSO 4 — Abertura para proposta:
  Teria interesse ou abertura?

PASSO 5 — Handoff:
  Quando demonstrar interesse real OU perguntar valores:
  "Posso passar seu contato pra ${b.handoff_nome || "nossa equipe"}? Vai te passar todos os detalhes."
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
- ALERTA_LEAD: true quando lead está quente (interesse real, perguntou valores, quer conversar com responsável).
- alerta_tipo: "lead_quente" quando ALERTA_LEAD for true.
- conversa_encerrada: true quando o médico não tem perfil ou recusou definitivamente.
</saida_json>

</prompt>`;
}
