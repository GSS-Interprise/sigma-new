import { sendWhatsAppMedia, sendWhatsAppText, type EvoConfig } from "./evo-sender.ts";

export interface SigzapOutboxRow {
  id: string;
  client_message_id: string;
  conversation_id: string;
  chip_id: string;
  instance_name: string;
  contact_jid: string;
  message_text: string | null;
  message_type: string;
  media_url: string | null;
  media_mime_type: string | null;
  media_caption: string | null;
  media_filename: string | null;
  quoted_message_id: string | null;
  wa_message_id?: string | null;
  evolution_response?: Record<string, unknown> | null;
  attempts: number;
  max_attempts: number;
  created_by: string | null;
}

export interface SigzapOutboxProcessResult {
  sent: boolean;
  queued: boolean;
  failed?: boolean;
  code?: string;
  waMessageId?: string;
  messageId?: string;
}

const retryDelaySeconds = (attempts: number) => Math.min(300, 15 * Math.pow(2, Math.max(0, attempts - 1)));

async function queueAgain(supabase: any, row: SigzapOutboxRow, code: string, detail?: string) {
  // Desconexao depende de QR/infra e nao e falha definitiva da mensagem. Preservar
  // a tentativa evita que uma fila valida expire enquanto a equipe reconecta o chip.
  const waitsForConnection = code === "INSTANCE_DISCONNECTED" || code === "CONNECTION_CHECK_FAILED";
  const exhausted = !waitsForConnection && row.attempts >= row.max_attempts;
  await supabase.from("sigzap_outbox").update({
    status: exhausted ? "failed" : "queued",
    attempts: waitsForConnection ? Math.max(0, row.attempts - 1) : row.attempts,
    next_retry_at: new Date(Date.now() + (waitsForConnection ? 300 : retryDelaySeconds(row.attempts)) * 1000).toISOString(),
    last_error_code: code,
    last_error_detail: (detail || "").slice(0, 1000),
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  return { sent: false, queued: !exhausted, failed: exhausted, code };
}

async function failPermanently(supabase: any, row: SigzapOutboxRow, code: string, detail?: string) {
  await supabase.from("sigzap_outbox").update({
    status: "failed",
    last_error_code: code,
    last_error_detail: (detail || "").slice(0, 1000),
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  return { sent: false, queued: false, failed: true, code };
}

export async function processSigzapOutboxRow(args: {
  supabase: any;
  evo: EvoConfig;
  row: SigzapOutboxRow;
}): Promise<SigzapOutboxProcessResult> {
  const { supabase, evo, row } = args;

  const { data: chip } = await supabase.from("chips").select("provedor").eq("id", row.chip_id).maybeSingle();

  // A consulta real reduz o intervalo em que o banco diz open mas o socket ja caiu.
  // uazapi gerencia a propria sessao e nao possui este endpoint da Evolution.
  if (!row.wa_message_id && (chip?.provedor || "evolution") !== "uazapi") try {
    const stateResponse = await fetch(
      `${evo.url}/instance/connectionState/${encodeURIComponent(row.instance_name)}`,
      { headers: { apikey: evo.apiKey } },
    );
    const stateBody = stateResponse.ok ? await stateResponse.json() : null;
    const state = stateBody?.instance?.state || stateBody?.state;
    if (!stateResponse.ok || state !== "open") {
      await Promise.all([
        supabase.from("chips").update({ connection_state: state || "close" }).eq("id", row.chip_id),
        supabase.from("sigzap_instances").update({ status: "disconnected" }).eq("name", row.instance_name),
      ]);
      return queueAgain(supabase, row, "INSTANCE_DISCONNECTED", `Evolution state: ${state || stateResponse.status}`);
    }
  } catch (error) {
    return queueAgain(supabase, row, "CONNECTION_CHECK_FAILED", error instanceof Error ? error.message : String(error));
  }

  const target = row.contact_jid.replace(/@.*$/, "").replace(/\D/g, "");
  const isMedia = row.message_type !== "text" && !!row.media_url;
  const result = row.wa_message_id
    ? { sent: true, evolutionResponse: row.evolution_response || { key: { id: row.wa_message_id } } }
    : isMedia
    ? await sendWhatsAppMedia({
        supabase, evo, chipId: row.chip_id, instanceName: row.instance_name,
        toJid: target, mediaType: row.message_type as "image" | "video" | "audio" | "document",
        mediaUrl: row.media_url!, mediaMimeType: row.media_mime_type || undefined,
        mediaCaption: row.media_caption || undefined, mediaFilename: row.media_filename || undefined,
        quotedMessageId: row.quoted_message_id || undefined, eventoOrigem: "manual", awaitDelay: true,
      })
    : await sendWhatsAppText({
        supabase, evo, chipId: row.chip_id, instanceName: row.instance_name,
        toJid: target, text: row.message_text || "",
        quotedMessageId: row.quoted_message_id || undefined, eventoOrigem: "manual", awaitDelay: true,
      });

  if (!result.sent) {
    const responseDetail = typeof result.evolutionResponse === "string"
      ? result.evolutionResponse
      : JSON.stringify(result.evolutionResponse || {});
    if (responseDetail.includes('"exists":false')) {
      return failPermanently(supabase, row, "PHONE_NOT_ON_WHATSAPP", responseDetail);
    }
    const disconnected = result.reason === "connection_closed" ||
      responseDetail.toLowerCase().includes("connection closed");
    return queueAgain(
      supabase,
      row,
      disconnected ? "INSTANCE_DISCONNECTED" : String(result.reason || "SEND_FAILED").toUpperCase(),
      responseDetail,
    );
  }

  const evolutionResult = result.evolutionResponse || {};
  const waMessageId = evolutionResult.key?.id || evolutionResult.id || `sent_${Date.now()}`;
  const now = new Date().toISOString();
  if (!row.wa_message_id) {
    const { error: receiptError } = await supabase.from("sigzap_outbox").update({
      wa_message_id: waMessageId,
      evolution_response: evolutionResult,
      updated_at: now,
    }).eq("id", row.id);
    if (receiptError) throw receiptError;
  }
  const messageText = row.message_text || row.media_caption || `[${row.message_type}]`;
  const { data: saved, error: saveError } = await supabase.from("sigzap_messages").upsert({
    conversation_id: row.conversation_id,
    client_message_id: row.client_message_id,
    wa_message_id: waMessageId,
    from_me: true,
    message_text: messageText,
    message_type: row.message_type,
    message_status: "sent",
    raw_payload: evolutionResult,
    media_url: row.media_url,
    media_mime_type: row.media_mime_type,
    media_caption: row.media_caption,
    media_filename: row.media_filename,
    quoted_message_id: row.quoted_message_id,
    sent_at: now,
    sent_by_user_id: row.created_by,
    sent_via_instance_name: row.instance_name,
  }, { onConflict: "client_message_id" }).select("id").single();
  if (saveError) throw saveError;

  await Promise.all([
    supabase.from("sigzap_conversations").update({
      last_message_text: messageText, last_message_at: now, unread_count: 0,
    }).eq("id", row.conversation_id),
    supabase.from("sigzap_outbox").update({
      status: "sent", wa_message_id: waMessageId, sigzap_message_id: saved.id,
      sent_at: now, updated_at: now, last_error_code: null, last_error_detail: null,
    }).eq("id", row.id),
    supabase.from("chips").update({ connection_state: "open" }).eq("id", row.chip_id),
    supabase.from("sigzap_instances").update({ status: "connected" }).eq("name", row.instance_name),
  ]);

  return { sent: true, queued: false, waMessageId, messageId: saved.id };
}
