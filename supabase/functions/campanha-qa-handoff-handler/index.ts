// Recebe alerta da IA quando ela não sabe responder. Envia WhatsApp pro responsável
// da campanha com a pergunta + contexto, captura wa_message_id e salva em
// campanha_perguntas_pendentes. Responsável responderá quotando a msg.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendWhatsAppText } from "../_shared/evo-sender.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const {
      campanha_lead_id,
      lead_id,
      campanha_id,
      pergunta_medico,
      pergunta_resumo,
      contexto_conversa,
      lead_nome,
      campanha_nome,
    } = await req.json();

    if (!campanha_lead_id || !lead_id || !campanha_id) throw new Error("campos obrigatórios ausentes");

    console.log(`[qa] 🆘 ${lead_nome || lead_id}: ${pergunta_resumo?.slice(0, 100)}`);

    // Busca briefing + responsável + chip da campanha
    const { data: campanha } = await supabase
      .from("campanhas")
      .select("nome, briefing_ia, chip_id, chip_ids")
      .eq("id", campanha_id)
      .maybeSingle();

    if (!campanha) throw new Error("campanha não encontrada");
    const briefing = campanha.briefing_ia || {};
    const handoffNome = briefing.handoff_nome || "Responsável";
    const handoffTel = (briefing.handoff_telefone || "").replace(/\D/g, "");

    if (!handoffTel) throw new Error("briefing.handoff_telefone não configurado");

    // Chip usado: primeiro da campanha ativo
    const chipId = campanha.chip_id || (campanha.chip_ids || [])[0];
    const { data: chip } = await supabase
      .from("chips")
      .select("id, instance_name, nome")
      .eq("id", chipId)
      .maybeSingle();

    if (!chip) throw new Error("chip da campanha não encontrado");

    // Credenciais Evolution
    const { data: evoConfig } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    const evoUrl = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor?.replace(/\/+$/, "");
    const evoKey = evoConfig?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor;
    if (!evoUrl || !evoKey) throw new Error("Evolution API não configurada");

    // Busca dados do lead
    const { data: lead } = await supabase
      .from("leads")
      .select("nome, phone_e164, especialidade, uf, cidade")
      .eq("id", lead_id)
      .maybeSingle();

    // Monta mensagem pro responsável
    const nomeLead = lead_nome || lead?.nome || "médico";
    const foneLead = lead?.phone_e164 || "?";
    const espec = lead?.especialidade ? `${lead.especialidade}` : "";
    const cidadeLead = lead?.cidade ? `${lead.cidade}/${lead.uf || ""}` : "";

    const alertMsg =
      `❓ *PERGUNTA PENDENTE — Campanha ${campanha.nome}*\n\n` +
      `*Médico:* ${nomeLead}${espec ? ` (${espec})` : ""}\n` +
      (cidadeLead ? `*Onde atua:* ${cidadeLead}\n` : "") +
      `*Telefone:* ${foneLead}\n\n` +
      `*O que ele perguntou:*\n"${pergunta_medico}"\n\n` +
      `*Resumo da IA:* ${pergunta_resumo || "—"}\n\n` +
      `*Últimas mensagens da conversa:*\n${contexto_conversa || "—"}\n\n` +
      `────────────────\n` +
      `👉 *Responda ESTA mensagem (toque e "Responder") com a resposta.*\n` +
      `A IA vai encaminhar a resposta pro médico automaticamente e continuar a conversa.`;

    // Envia pro responsável via helper anti-ban
    const sendResult = await sendWhatsAppText({
      supabase,
      evo: { url: evoUrl, apiKey: evoKey },
      chipId: chip.id,
      instanceName: chip.instance_name,
      toJid: handoffTel,
      text: alertMsg,
      eventoOrigem: "qa_relay",
      awaitDelay: true,
    });
    if (!sendResult.sent) {
      throw new Error(`qa_handoff_send_failed: ${sendResult.reason}`);
    }
    const evoData = (sendResult.evolutionResponse as any) || {};
    const waMsgId = evoData?.key?.id || evoData?.messageId || evoData?.id || "";
    if (!waMsgId) {
      console.warn(`[qa] ⚠️ wa_message_id não veio na resposta — quote não vai funcionar! Resp: ${JSON.stringify(evoData).slice(0, 300)}`);
    }

    // INSERT na tabela de pendentes
    const { data: pend, error: pendErr } = await supabase
      .from("campanha_perguntas_pendentes")
      .insert({
        campanha_lead_id,
        lead_id,
        campanha_id,
        pergunta_medico: pergunta_medico || "",
        pergunta_resumo: pergunta_resumo || "",
        contexto_conversa: contexto_conversa || "",
        alerta_msg_id: waMsgId || `fallback-${crypto.randomUUID()}`,
        alerta_phone: handoffTel,
        alerta_instance: chip.instance_name,
      })
      .select()
      .maybeSingle();

    if (pendErr) throw new Error(`insert pendente: ${pendErr.message}`);

    // Marca lead como aguardando
    await supabase
      .from("campanha_leads")
      .update({ aguarda_resposta_humana: true })
      .eq("id", campanha_lead_id);

    // Log
    await supabase.from("lead_historico").insert({
      lead_id,
      tipo_evento: "qa_pergunta_enviada",
      descricao_resumida: `Pergunta pendente enviada pra ${handoffNome}: ${(pergunta_resumo || "").slice(0, 200)}`,
      metadados: {
        campanha_id,
        campanha_lead_id,
        alerta_msg_id: waMsgId,
        handoff_tel: handoffTel,
        pergunta_pendente_id: pend?.id,
      },
    });

    console.log(`[qa] ✅ alerta enviado pra ${handoffNome} (${handoffTel}), wa_id=${waMsgId}`);

    return jsonResp({
      ok: true,
      pergunta_pendente_id: pend?.id,
      alerta_msg_id: waMsgId,
      responsavel: handoffNome,
    });
  } catch (err: any) {
    console.error("[qa] ERRO:", err.message);
    return jsonResp({ ok: false, error: err.message }, 500);
  }
});

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
