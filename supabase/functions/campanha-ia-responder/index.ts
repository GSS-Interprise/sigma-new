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
      msg_id,
      aggregated_texts,
    } = await req.json();

    if (!phone) throw new Error("phone obrigatório");

    const finalText = aggregated_texts || message_text || "";
    const hasMedia = (message_type === "audio" || message_type === "image") && msg_id;
    if (!finalText && !hasMedia) throw new Error("message_text ou mídia obrigatórios");

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
      .select("id, campanha_id, status, humano_assumiu, aguarda_resposta_humana, historico_conversa, campanha:campanha_id(id, nome, briefing_ia, responsaveis)")
      .eq("lead_id", lead.id).in("status", ["contatado", "em_conversa", "aquecido"])
      .order("data_ultimo_contato", { ascending: false }).limit(1).maybeSingle();

    if (!campLead) return json({ ok: false, reason: "not_in_campaign" });
    if (campLead.humano_assumiu) return json({ ok: true, reason: "humano_assumiu" });

    // Se lead está aguardando resposta do responsável, registra msg no histórico mas não responde ainda
    if (campLead.aguarda_resposta_humana) {
      const histTmp: any[] = campLead.historico_conversa || [];
      histTmp.push({ role: "medico", text: finalText, ts: new Date().toISOString(), pendente_humano: true });
      await supabase.from("campanha_leads").update({ historico_conversa: histTmp, data_ultimo_contato: new Date().toISOString() }).eq("id", campLead.id);
      console.log(`[ia] ⏸️ lead aguardando resposta humana — msg registrada mas IA não responde`);
      return json({ ok: true, reason: "aguardando_resposta_humana", msg: "IA pausada até responsável responder pergunta pendente" });
    }

    const campanha = campLead.campanha as any;
    const briefing = campanha?.briefing_ia || {};

    // ── 2b. Buscar perfil unificado (Trilha B) ──
    const { data: perfilInteresse } = await supabase
      .from("banco_interesse_leads")
      .select("*")
      .eq("lead_id", lead.id)
      .maybeSingle();

    // Timeline cross-canal (últimas 20 interações em OUTRAS campanhas ou chats manuais)
    const { data: timelineCross } = await supabase
      .from("vw_lead_timeline")
      .select("ts, origem, operador, canal, conteudo, metadados")
      .eq("lead_id", lead.id)
      .in("operador", ["lead", "ia", "humano"])
      .not("conteudo", "is", null)
      .order("ts", { ascending: false })
      .limit(30);

    // Filtra só interações de OUTROS contextos (não desta mesma campanha_lead)
    const timelineOutros = (timelineCross || []).filter((m: any) => {
      const clid = m.metadados?.campanha_lead_id;
      return !clid || clid !== campLead.id;
    }).slice(0, 15);

    // ── 3. Credenciais Evolution (precisa pra decrypt + envio) ──
    const { data: evoConfig } = await supabase.from("config_lista_items")
      .select("campo_nome, valor").in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    const evoUrl = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
    const evoKey = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;

    // ── 4. Processar multimodal ──
    let processedText = finalText;
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY não configurada");

    // Áudio: decrypt via Evolution → Whisper
    if (message_type === "audio" && msg_id && instance_name && evoUrl && evoKey) {
      console.log(`[ia] 🎙️ Decrypt áudio (msg ${msg_id})`);
      try {
        const media = await decryptMedia(evoUrl, evoKey, instance_name, msg_id, phone);
        if (media) {
          const ext = media.mimetype.includes("ogg") ? "ogg" : media.mimetype.includes("mp3") ? "mp3" : "m4a";
          const audioBlob = base64ToBlob(media.base64, media.mimetype);
          const formData = new FormData();
          formData.append("file", audioBlob, `audio.${ext}`);
          formData.append("model", "whisper-1");
          formData.append("language", "pt");

          const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
          });

          if (whisperResp.ok) {
            const transcript = ((await whisperResp.json()).text || "").trim();
            if (transcript) {
              processedText = finalText && finalText !== "[audio]"
                ? `${finalText}\n[Áudio do médico]: ${transcript}`
                : `[Áudio do médico]: ${transcript}`;
              console.log(`[ia] 🎙️ Transcrição: ${transcript.slice(0, 100)}`);
            }
          } else {
            console.warn(`[ia] ⚠️ Whisper ${whisperResp.status}: ${(await whisperResp.text()).slice(0, 200)}`);
          }
        }
      } catch (audioErr: any) {
        console.warn(`[ia] ⚠️ Erro áudio: ${audioErr.message}`);
      }
    }

    // Imagem: decrypt via Evolution → Vision (data URL)
    if (message_type === "image" && msg_id && instance_name && evoUrl && evoKey) {
      console.log(`[ia] 🖼️ Decrypt imagem (msg ${msg_id})`);
      try {
        const media = await decryptMedia(evoUrl, evoKey, instance_name, msg_id, phone);
        if (media) {
          const dataUrl = `data:${media.mimetype};base64,${media.base64}`;
          const visionResp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "gpt-4o", max_tokens: 300,
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: "Descreva esta imagem de forma objetiva em português, em 1-2 frases. Se for documento médico (CRM, RQE, diploma, comprovante), extraia números e dados visíveis." },
                  { type: "image_url", image_url: { url: dataUrl } },
                ],
              }],
            }),
          });

          if (visionResp.ok) {
            const desc = ((await visionResp.json()).choices?.[0]?.message?.content || "").trim();
            if (desc) {
              processedText = finalText && finalText !== "[imagem]"
                ? `${finalText}\n[Imagem do médico]: ${desc}`
                : `[Imagem do médico]: ${desc}`;
              console.log(`[ia] 🖼️ Análise: ${desc.slice(0, 100)}`);
            }
          } else {
            console.warn(`[ia] ⚠️ Vision ${visionResp.status}: ${(await visionResp.text()).slice(0, 200)}`);
          }
        }
      } catch (imgErr: any) {
        console.warn(`[ia] ⚠️ Erro imagem: ${imgErr.message}`);
      }
    }

    // ── 4. Histórico ──
    const historico: Array<{ role: string; text: string; ts: string }> = campLead.historico_conversa || [];
    historico.push({ role: "medico", text: processedText, ts: new Date().toISOString() });

    const historicoTexto = historico
      .map((m: any) => `${m.role === "medico" ? "Médico" : "GSS"}: ${m.text}`)
      .join("\n");

    // ── 5. Prompt + IA ──
    const prompt = buildPrompt(briefing, lead, perfilInteresse, timelineOutros);

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
    const maturidade = String(parsed.maturidade_lead || "").toLowerCase();
    // ALERTA_LEAD só conta se maturidade explícita é "quente" (safety net contra modelo marcar errado)
    const alertaLead = parsed.ALERTA_LEAD === true && maturidade === "quente";
    const conversaEncerrada = parsed.conversa_encerrada === true;
    const aguardaHumano = parsed.AGUARDA_RESPOSTA_HUMANA === true;
    const perguntaResumo = String(parsed.pergunta_para_responsavel || "").trim();

    // Salvar respostas no histórico
    for (const msg of messages) {
      historico.push({ role: "gss", text: msg, ts: new Date().toISOString() });
    }

    // ── 7. Enviar via Evolution (creds já buscadas no passo 3) ──
    if (evoUrl && evoKey && instance_name) {
      const sendUrl = `${evoUrl}/message/sendText/${encodeURIComponent(instance_name)}`;
      const presenceUrl = `${evoUrl}/chat/sendPresence/${encodeURIComponent(instance_name)}`;
      for (let i = 0; i < messages.length; i++) {
        if (i > 0) await sleep(1500 + Math.random() * 1500);
        // Typing indicator humanizado: ~50ms/char, mín 1.5s, máx 6s
        const typingDelay = Math.max(1500, Math.min(6000, messages[i].length * 50));
        try {
          await fetch(presenceUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({ number: phoneDigits, presence: "composing", delay: typingDelay }),
          });
        } catch (_) { /* presence é best-effort */ }
        await sleep(typingDelay);
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

    // ── 10. Q&A handoff humano (pergunta pra responsável) ──
    if (aguardaHumano && perguntaResumo) {
      try {
        const contextoConversa = historico.slice(-8).map((m: any) => `${m.role === "medico" ? "Médico" : m.role === "gss" ? "IA" : m.role}: ${m.text}`).join("\n");
        const qaResp = await fetch("https://zupsbgtoeoixfokzkjro.functions.supabase.co/campanha-qa-handoff-handler", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            campanha_lead_id: campLead.id,
            lead_id: lead.id,
            campanha_id: campLead.campanha_id,
            pergunta_medico: finalText.slice(0, 500),
            pergunta_resumo: perguntaResumo.slice(0, 500),
            contexto_conversa: contextoConversa.slice(0, 2000),
            lead_nome: lead.nome,
            campanha_nome: campanha.nome,
          }),
        });
        const qaData = await qaResp.json();
        console.log(`[ia] 🧑‍💼 Q&A handoff: ${qaData.ok ? "alerta enviado" : `falhou: ${qaData.error}`}`);
      } catch (e: any) {
        console.error(`[ia] Q&A handoff erro: ${e.message}`);
      }
    }

    return json({
      ok: true, lead_id: lead.id, campanha_id: campLead.campanha_id,
      status: novoStatus, messages_sent: messages.length, alerta: alertaLead,
      maturidade_lead: maturidade || null,
      aguarda_humano: aguardaHumano,
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

async function decryptMedia(
  evoUrl: string,
  evoKey: string,
  instance: string,
  msgId: string,
  phone: string,
): Promise<{ base64: string; mimetype: string } | null> {
  const phoneDigits = phone.replace(/\D/g, "");
  const remoteJid = phone.includes("@") ? phone : `${phoneDigits}@s.whatsapp.net`;
  const url = `${evoUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(instance)}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: evoKey },
    body: JSON.stringify({
      message: { key: { id: msgId, remoteJid, fromMe: false } },
      convertToMp4: false,
    }),
  });
  if (!resp.ok) {
    console.warn(`[ia] decrypt ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    return null;
  }
  const data = await resp.json();
  if (!data.base64) return null;
  return { base64: data.base64, mimetype: data.mimetype || "application/octet-stream" };
}

function base64ToBlob(base64: string, mimetype: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimetype });
}

function buildPrompt(b: any, lead: any, perfil?: any, timelineOutros?: any[]): string {
  const beneficios =
    (b.beneficios || []).length > 0 ? `Benefícios: ${b.beneficios.join(", ")}.` : "";
  const objecoes =
    (b.objecoes || [])
      .map((o: any) => `"${o.objecao}" → "${o.resposta}"`)
      .join("\n  ") || "Nenhuma mapeada.";

  // Fluxo personalizado do briefing (array de strings) ou fluxo default
  const fluxoPassos: string[] =
    Array.isArray(b.fluxo_passos) && b.fluxo_passos.length > 0
      ? b.fluxo_passos
      : [
          "Confirmar perfil (especialidade/RQE conforme requisito)",
          "Origem e formação",
          "Experiência na área",
          "Abertura/interesse",
        ];
  const fluxoTxt = fluxoPassos
    .map((p, i) => `${i + 1}. ${p} — se já respondeu, AVANCE`)
    .join("\n");

  const handoffNome = b.handoff_nome || "equipe";

  // Palavras proibidas: default + customizadas por campanha
  const palavrasProibidasDefault = [
    "moderno",
    "moderna",
    "tecnologia de ponta",
    "de ponta",
    "estruturar algo",
    "estruturar algo grande",
    "oportunidade única",
    "ambiente incrível",
    "projeto revolucionário",
    "não é só plantão",
  ];
  const palavrasCustom =
    typeof b.palavras_proibidas === "string"
      ? b.palavras_proibidas.split(/[,;\n]/).map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(b.palavras_proibidas)
      ? b.palavras_proibidas
      : [];
  const todasProibidas = [...new Set([...palavrasProibidasDefault, ...palavrasCustom])];

  // Gatilho de handoff — default restritivo
  const handoffGatilho =
    b.handoff_gatilhos ||
    `APENAS 2 casos disparam handoff:
  (1) médico perguntou valor, remuneração, salário, quanto paga
  (2) médico fez pergunta que você NÃO consegue responder com o briefing
Em qualquer outro cenário: continue a conversa. NÃO empurre handoff proativo.`;

  return `<prompt versao="sigma-v9">
<contexto>
${b.persona_contexto || `Você é da equipe GSS Saúde — trabalha direto com os médicos que pegam escala. Fala como colega de profissão: direto, sem formalidade. Já conversou com centenas deles, então não tem pressa, não tem nervosismo.`} Nunca mencione IA, bot, automação ou assistente. Sem promessas exageradas. Sem papo de telemarketing.
</contexto>

<primeira_resposta>
Quando o médico responde a primeira msg da IA com algo GENÉRICO/CURTO ("oi", "sim", "tudo bem", "lembro", "pode mandar", "bom dia", emoji solto): NÃO salte direto pra pergunta técnica de RQE. Isso parece bot apressado e afasta.

Em vez disso: abra com 1 frase de contexto quente (serviço + cidade + gancho curto) + UMA pergunta aberta, NÃO necessariamente técnica. Deixe o médico respirar.

Exemplos bons (adapte ao briefing):
- "Fala dr, tranquilo. Então, abriu uma vaga nova de ${b.nome_servico || "UTI"} em ${b.cidade || "cidade"}. Antes de entrar em detalhe — tu tá atuando nessa área hoje ou em outra frente?"
- "Opa, show. Queria te passar essa de ${b.nome_servico || "serviço"} no ${b.hospital || "hospital"}, em ${b.cidade || "cidade"}. Qual tua área hoje?"
- "Boa, então bora. Tem uma nova de ${b.nome_servico || "serviço"} que talvez encaixe com teu perfil — tu tá mais em que região hoje?"

Só pergunte RQE/requisito técnico específico DEPOIS que o médico der sinal de interesse ou confirmar a área.
</primeira_resposta>

<engajamento_proativo>
CRÍTICO — o médico não conhece o serviço. Você conhece. Use esse conhecimento PROATIVAMENTE.

Quando for natural na conversa (ex: ele perguntou "onde é mesmo?", "como funciona?", "me conta mais", ou deu qualquer sinal de seguir): ENTREGUE fatos concretos do briefing. Não espere ele puxar tudo.

Use desde a SEGUNDA resposta em diante, sempre que o médico der abertura:
- **Cidade** (seção <cidade_info> se tiver) — infra, aeroporto, vida, segurança, tamanho
- **Hospital e estrutura** — leitos, equipe, suporte de especialidades, rotina
- **Vídeo da cidade** (seção <video_cidade> se tiver) — ofereça ATIVAMENTE
- **Cronograma** — quando começa, forma de pagamento, tipo de contratação
- **Fatos verificáveis** do briefing, não adjetivos vazios

Regra de ouro: **quando há abertura**, responda com 1-2 fatos concretos + 1 pergunta de aprofundamento. Evite resposta seca estilo "é em Chapecó" quando pode ser "é em Chapecó — 282k habitantes, aeroporto com voos diários pra SP. Tu conhece a região?".

Mas sem floreio. FATO + PERGUNTA.
</engajamento_proativo>

<naturalidade>
REGRAS DE FALA HUMANA — segue à risca, médicos identificam bot na hora:
- Aberturas variam: "oi", "opa", "e aí dr", "boa", "fala dr". NUNCA "Olá!" nem "Olá, doutor!".
- SEM emoji estruturado, SEM markdown (negrito, itálico), SEM listas/bullets, SEM numeração.
- Pontuação humana e descontraída: vírgulas opcionais omitidas, abreviações naturais ok (vc, tb, qq, pq, blz).
- Comprimento variado: ora 1 frase curta, ora 2 frases. Evite uniformidade. Evite parágrafos longos.
- Não comece toda msg com saudação. Conversa fluida não cumprimenta a cada mensagem.
- Sem "espero ter ajudado", "fico à disposição", "qualquer dúvida estou aqui" — clichês de bot.
- Se médico fala curto, responda curto. Se elaborou, pode elaborar mais.
- Pode reagir com "show", "bacana", "que legal" — com moderação, só quando fizer sentido.
</naturalidade>

<oportunidade>
  Serviço: ${b.nome_servico || "?"} | Hospital: ${b.hospital || "?"} | Cidade: ${b.cidade || "?"}
  Tipo: ${b.tipo_servico || "plantão"} | Contratação: ${b.contratacao || "PJ"}
  Requisito: ${b.requisitos || "Formação na área"}
  ${b.estrutura ? `Estrutura: ${b.estrutura}` : ""}
  ${b.inicio_servico ? `Início: ${b.inicio_servico}` : ""}
  ${b.pagamento ? `Pagamento: ${b.pagamento}` : ""}
  Valor: R$ ${b.valor_min || "?"} a R$ ${b.valor_max || "?"} por ${b.valor_por || "plantão"}
  ${beneficios}
  Handoff: ${handoffNome}
</oportunidade>

${b.cidade_info ? `<cidade_info>\n${b.cidade_info}\n</cidade_info>` : ""}

${b.link_video ? `<video_cidade>
Você tem um vídeo curto da cidade: ${b.link_video}

GATILHO — ofereça o vídeo sempre que acontecer UM destes:
  (a) médico perguntar algo sobre a cidade ("onde é", "me fala da cidade", "como é a região")
  (b) médico disser que não conhece a região ("não conheço", "nunca fui", "sou de outro estado")
  (c) você tiver acabado de falar da cidade e o médico demonstrar interesse em seguir
  (d) o médico parecer indeciso sobre aceitar/explorar a vaga (um vídeo ajuda muito aqui)

COMO oferecer (varie as palavras):
- "Se quiser um contexto rápido da cidade, tem um video curtinho — quer que mande?"
- "Tenho um vídeo de 1min da cidade, ajuda a visualizar. Topa ver?"
- "Se quiser ver como é a cidade, tem um vídeo — mando?"

SÓ envie o link ${b.link_video} DEPOIS que o médico aceitar ("pode mandar", "manda sim", "ok", "quero ver"). Nunca envie o link proativamente sem perguntar antes.
</video_cidade>` : ""}

<precisao_tecnica>
CRÍTICO: ao perguntar sobre perfil, use EXATAMENTE os termos do <Requisito> acima.
- Se o requisito menciona "RQE", pergunte sobre RQE, não "ou experiência".
- Se menciona "intensivista", diga "intensivista", não "pediatra".
- Não suavize nem amplie. Copie os requisitos cirurgicamente.
- Exemplo bom: "Você é intensivista pediátrico com RQE?"
- Exemplo ruim: "Você é pediatra ou tem experiência?"
</precisao_tecnica>

<fluxo>
REGRA ABSOLUTA: Leia TODO o histórico. NUNCA repita pergunta já respondida.
"Sim" = passo concluído. Avance. 1 pergunta por vez.

${fluxoTxt}
</fluxo>

<handoff>
${handoffGatilho}

COMO fazer handoff (quando disparar):
- "Posso passar seu contato pra ${handoffNome}? ${b.handoff_frase || "Ela vai te passar todos os detalhes sobre valores e escala."}"
- Após confirmar: "Ótimo, vou passar pra ${handoffNome}. Te chamam em breve."

REGRAS DE REPETIÇÃO:
- Se médico não respondeu sobre handoff, não repita na msg seguinte.
- Nunca mandar "vou passar pra ${handoffNome}" 2 vezes em menos de 5 msgs.
- Se médico IGNORAR o pedido de handoff e continuar conversando sobre o serviço, VOLTE pro fluxo natural da conversa. Ele tá explorando, deixe.
- Quem dirige a conversa é o médico. Se ele quer saber detalhes do serviço, ENTREGUE.
</handoff>

<antes_de_handoff>
🛑 REGRA DURA — NÃO mencione ${handoffNome}, "passar contato" ou qualquer handoff ANTES de ter explicado o serviço de verdade pro médico.

CHECKLIST mínimo a entregar ANTES de qualquer menção a ${handoffNome}:
  □ Hospital identificado (nome + cidade)
  □ Estrutura mínima do serviço (leitos, equipe, suporte)
  □ Tipo de escala/contratação
  □ Cronograma (quando começa, periodicidade)
  □ Algo da cidade (se o médico não conhece)
  □ Confirmou perfil técnico do médico (RQE / experiência / especialidade)

Se MENOS DE 4 desses 6 itens foram trocados na conversa, NÃO ofereça handoff. Continue explicando, perguntando, engajando.

Médico que recebe "posso passar pra ${handoffNome}?" sem ter sentido o contexto do serviço → percebe que você só queria empurrar pra alguém. Ele se afasta.

EXCEÇÃO ÚNICA: se o médico disser literalmente "me liga", "me passa pro responsável", "quero fechar", "manda pra alguém me explicar" → handoff imediato é apropriado. Caso contrário, EXPLIQUE primeiro.

Quanto mais o médico souber do serviço quando o handoff acontecer, maior a chance de ${handoffNome} fechar.
</antes_de_handoff>

<regras>
- 1 a 3 msgs por resposta, conforme o contexto: se o médico perguntou 1 coisa curta, responde em 1. Se há 2 pontos a tratar (responder pergunta dele + avançar 1 passo), use 2. Máx 3 em casos com fato + vídeo + pergunta.
- Não fale valores. ${handoffNome} passa detalhes.
- Nunca invente. Use o histórico. Responda perguntas do médico primeiro, depois retoma fluxo.
- Sem perfil ou recusou: agradeça curto e encerre.
  Objeções: ${objecoes}
${b.ajuda_custo_regra ? `- Ajuda de custo: ${b.ajuda_custo_regra}` : ""}
</regras>

<anti_promessa>
PALAVRAS E EXPRESSÕES PROIBIDAS (nunca usar):
${todasProibidas.map(p => `  - "${p}"`).join("\n")}

SUBSTITUA por fatos verificáveis:
- "moderno" / "de ponta" → "organizado", "estruturado", ou apenas omita adjetivo
- "oportunidade única" → só descreva o serviço
- "estruturar algo grande" → descreva equipe e rotina real

Fale SÓ dos fatos do briefing: estrutura real, cidade real, equipe real, cronograma real.
Se você se pegar usando adjetivo vendedor, CORTE.
</anti_promessa>

<anti_loop>
Antes de responder, leia TODO o histórico. Se o médico já informou algo (especialidade, RQE, cidade, formação, etc.), NÃO pergunte de novo. Avance.
Um "Sim" ou "Sim, [contexto]" como resposta a pergunta sua = passo concluído. Registre e avance.
Se o médico mandou 2+ msgs ou uma msg com resposta + pergunta: extraia TUDO antes de responder. Não ignore a resposta embutida.
</anti_loop>

<medico_dirige>
O MÉDICO dirige a conversa. Seu fluxo é um guia, não um script fechado.
- Se ele quer saber mais da estrutura: responda em profundidade antes de voltar ao fluxo.
- Se ele quer saber da cidade: use <cidade_info>, aprofunde.
- Se ele faz pergunta técnica que você tem resposta no briefing: RESPONDA direto, não jogue pro handoff.
- Empurrar handoff cedo demais OU repetidamente → médico percebe pressa/medo → lead perdido.
- Pressa é bot. Calma é humano.
</medico_dirige>

${b.info_extra ? `<info_adicional>\n${b.info_extra}\n</info_adicional>` : ""}

${perfil ? `<perfil_conhecido>
O que já sabemos sobre este médico (extraído de conversas anteriores pela IA):
${perfil.observacoes_ia ? `Resumo: ${perfil.observacoes_ia}` : ""}
${perfil.modalidade_preferida?.length ? `Modalidade preferida: ${perfil.modalidade_preferida.join(", ")}` : ""}
${perfil.tipo_contratacao_preferida?.length ? `Contratação preferida: ${perfil.tipo_contratacao_preferida.join(", ")}` : ""}
${perfil.valor_minimo_aceitavel ? `Valor mínimo aceitável: R$ ${perfil.valor_minimo_aceitavel} por ${perfil.valor_minimo_unidade || "plantão"}` : ""}
${perfil.ufs?.length ? `UFs de interesse: ${perfil.ufs.join(", ")}` : ""}
${perfil.cidades?.length ? `Cidades mencionadas: ${perfil.cidades.join(", ")}` : ""}
${perfil.periodo_preferido ? `Período preferido: ${perfil.periodo_preferido}` : ""}
${perfil.dias_preferidos?.length ? `Dias preferidos: ${perfil.dias_preferidos.join(", ")}` : ""}
${perfil.disponibilidade_plantoes_mes ? `Disponibilidade: ~${perfil.disponibilidade_plantoes_mes} plantões/mês` : ""}
Confiança desse perfil: ${perfil.confianca_score || "?"}% — se baixa, confirme antes de afirmar.

<regra_escopo_campanha>
⚠️ CRÍTICO — o perfil é APENAS pra personalizar TOM e ABORDAGEM desta conversa.

VOCÊ NÃO PODE:
- Oferecer modalidade diferente da campanha atual. Se lead prefere produção e esta campanha é plantão, NÃO ofereça "eu tenho uma de produção também, quer ver?". A oferta é SÓ o que está em <oportunidade> desta campanha.
- Sugerir outra vaga, outra cidade, outra especialidade. Escopo é esta vaga específica.
- Mencionar que tem contato com ele em outras campanhas — isso expõe lógica interna.

VOCÊ PODE e DEVE:
- Reconhecer naturalmente preferências conhecidas: "sei que tu tá mais focado em produção, mas abriu essa de plantão que talvez encaixe — se não der, tranquilo".
- Não repetir pergunta que ele já respondeu em outro contexto (tipo "já trabalhou em UTI?" se ele já respondeu).
- Ajustar o tom (mais direto com quem é direto, mais contextual com quem é curioso).
- Oferecer honestamente: se o lead prefere só Floripa e a vaga é Chapecó, reconheça e ofereça a vaga mesmo assim SEM pressão ("abriu uma em Chapecó, talvez não case com o que tu procura mas quis te passar").

Se o lead pedir "me manda outra vaga", "tem algo em X", "tem produção?" — responda: "agora só essa que te passei. Se quiser, registro teu interesse pra te avisar quando surgir outra."
</regra_escopo_campanha>
</perfil_conhecido>` : ""}

${timelineOutros && timelineOutros.length > 0 ? `<interacoes_outros_canais>
Este lead já teve ${timelineOutros.length} interações em outros contextos (outras campanhas ou conversas manuais com a equipe GSS). As mais recentes:
${timelineOutros.slice(0, 10).reverse().map((m: any) => {
  const quem = m.operador === "lead" ? "Médico" : m.operador === "humano" ? "GSS (humano)" : "IA";
  const ctx = m.origem === "conversa_manual" ? "[outra conversa manual]" : "[outra campanha]";
  return `  ${ctx} ${quem}: ${(m.conteudo || "").slice(0, 200)}`;
}).join("\n")}

REGRA: se o médico já respondeu algo aqui, NÃO pergunte de novo. Use o que ele disse como contexto. Ele percebe quando está sendo tratado como "lead novo" e se afasta.
</interacoes_outros_canais>` : ""}

<maturidade>
Classifique SEMPRE o lead em uma de 3 maturidades e retorne no JSON como "maturidade_lead":
- "frio" — só respondeu coisas curtas ou genéricas. AINDA CONVERSE.
- "morno" — fez 1 pergunta sobre serviço/cidade/escala. APROFUNDE, explique mais.
- "quente" — confirmou perfil + fez 2+ perguntas específicas OU disse explicitamente "me liga", "manda detalhes pra fechar", "pode me passar pra alguém", "quero fechar".

HANDOFF (ALERTA_LEAD=true) SÓ quando maturidade_lead = "quente".
NUNCA marque ALERTA_LEAD=true se maturidade for frio/morno.
</maturidade>

<regra_valor>
⚠️ A IA NÃO passa valores. Nunca. Mesmo se o médico insistir.

IMPORTANTE SOBRE GÊNERO: "${handoffNome}" pode ser homem ou mulher. Flexione o pronome corretamente na resposta (ele/ela, o/a). Na dúvida, não use pronome — mencione o nome direto ou omita.

Resposta padrão (varie as palavras mas mantenha o significado):
"o valor e detalhes quem passa é ${handoffNome} — monta a escala que encaixa contigo"
ou
"${handoffNome} fecha os números certinho, depende de como vai encaixar na escala"
ou
"não tenho o valor exato aqui — ${handoffNome} te passa e ajusta conforme o que der pra fazer"

NUNCA abra faixa ("entre X e Y"). NUNCA dê número. ${handoffNome} é quem passa.

CRÍTICO: pergunta de valor NÃO dispara handoff automático. Siga a frase padrão e SEMPRE EMENDE com 1 pergunta que avança o contexto (perfil, estrutura, cidade, escala) pra manter a conversa viva. Exemplos:
- "valor quem passa é ${handoffNome} certinho. Antes — tu tá atuando em UTI pediátrica hoje ou pensando em abrir nisso?"
- "${handoffNome} fecha os números depende da escala. Me conta rapidinho: tu tá mais em Floripa ou abre pra outras cidades?"
- "número mesmo é com ${handoffNome}. Tu já conhece Chapecó ou seria vir a primeira vez?"

Só mande pra ${handoffNome} quando o checklist <antes_de_handoff> estiver cumprido E a maturidade_lead="quente".
</regra_valor>

<q_and_a_humano>
Se o médico fizer pergunta que você NÃO consegue responder com o briefing disponível — tipo detalhe operacional específico, procedimento exato, equipamento, escala X semana específica — NÃO jogue pro handoff final (não é handoff de conversão). Marque AGUARDA_RESPOSTA_HUMANA=true no JSON e formule uma pergunta clara que o gestor da campanha possa responder.

Responda ao médico enquanto isso com uma frase de espera curta — sem comprometer prazo. Ex:
"deixa eu confirmar esse detalhe com a equipe e já te volto aqui"
"essa especificidade vou confirmar com quem coordena a unidade — já te respondo"

NÃO use AGUARDA_RESPOSTA_HUMANA pra perguntas cobertas pelo briefing.
NÃO use pra valores (usa <regra_valor>).
</q_and_a_humano>

<saida>
JSON válido apenas:
{
  "messages": ["msg1","msg2"],
  "maturidade_lead": "frio|morno|quente",
  "ALERTA_LEAD": false,
  "alerta_tipo": "",
  "alerta_resumo": "",
  "conversa_encerrada": false,
  "AGUARDA_RESPOSTA_HUMANA": false,
  "pergunta_para_responsavel": ""
}

Regras:
- maturidade_lead: SEMPRE preencha
- ALERTA_LEAD=true SÓ com maturidade_lead="quente" E sinais explícitos de fechamento
- conversa_encerrada=true quando: sem perfil OU recusou explicitamente
- AGUARDA_RESPOSTA_HUMANA=true quando pergunta escapa do briefing
- pergunta_para_responsavel: texto curto (1-2 frases) do que precisa confirmar. Ex: "Médico perguntou se a UTI tem ECMO disponível"
</saida>
</prompt>`;
}
