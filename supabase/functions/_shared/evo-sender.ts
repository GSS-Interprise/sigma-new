// =====================================================================
// Plano Aquecimento + Anti-Ban v1 — Sprint 1 (refatorado em 2026-05-05)
// Single point of send: TODA chamada Evolution `/message/*` deve passar
// por sendWhatsAppText() ou sendWhatsAppMedia().
//
// Internamente:
//  - Chama pre_send_check no Postgres (warm-up + rate limit + health + reply)
//  - Aplica delay sugerido (gaussian)
//  - POST na Evolution com retry exponencial pra erros transitórios (P5)
//  - Loga em chip_send_log e em chip_health_event quando relevante
//
// Doc: .claude/plano-aquecimento-anti-ban-v1.md §3.3
//      .claude/plano-melhorias-whatsapp-sigma-v1.md §1 P3 P5
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Edge Functions compartilham tabelas que ainda nao estao no schema generico
// inferido pelo SDK; manter o client estrutural evita o tipo `never` enganoso.
type SupabaseClient = any;

export type EventoOrigem =
  | "aquecimento"
  | "cold_disparo"
  | "cadencia"
  | "resposta_ia"
  | "manual"
  | "qa_relay"
  | "opt_out"
  | "handoff"
  | "healthcheck";

export type ConteudoTipo = "text" | "audio" | "image" | "sticker" | "reaction" | "status" | "forward";

export interface EvoConfig {
  url: string;
  apiKey: string;
}

interface BaseOpts {
  supabase: SupabaseClient;
  evo: EvoConfig;
  chipId: string;
  instanceName: string;
  toJid: string;
  eventoOrigem: EventoOrigem;
  awaitDelay?: boolean;
  timeoutMs?: number;
  maxRetries?: number;        // default 3 pra códigos transitórios
  quotedMessageId?: string;
}

export interface SendTextOpts extends BaseOpts {
  text: string;
}

export interface SendMediaOpts extends BaseOpts {
  mediaType: "image" | "video" | "audio" | "document";
  mediaUrl: string;           // URL pública (não base64)
  mediaMimeType?: string;
  mediaCaption?: string;
  mediaFilename?: string;
}

export interface SendResult {
  sent: boolean;
  reason?: string;
  evolutionResponse?: any;
  errorCode?: number;
  preSendCheck?: any;
  retryInMs?: number;
  delayApplicadoMs?: number;
  retriesAttempted?: number;
}

const DEFAULT_TIMEOUT = 15_000;
const DEFAULT_MAX_RETRIES = 3;
const TRANSIENT_CODES = new Set([429, 500, 502, 503, 504]);
const SIGZAP_BUSINESS_EVENTS = new Set<EventoOrigem>([
  "cold_disparo",
  "cadencia",
  "resposta_ia",
  "opt_out",
]);

async function persistBusinessOutbound(
  opts: SendTextOpts,
  result: SendResult,
): Promise<void> {
  if (!result.sent || !SIGZAP_BUSINESS_EVENTS.has(opts.eventoOrigem)) return;

  const waMessageId = result.evolutionResponse?.key?.id || result.evolutionResponse?.id;
  if (!waMessageId) {
    console.error("[evo-sender] envio comercial sem wa_message_id; historico nao persistido");
    return;
  }

  try {
    const digits = opts.toJid.replace(/@.*$/, "").replace(/\D/g, "");
    if (!digits) throw new Error("destinatario sem digitos");
    const contactJid = `${digits}@s.whatsapp.net`;
    const now = new Date().toISOString();

    const { data: instance, error: instanceError } = await opts.supabase
      .from("sigzap_instances")
      .select("id")
      .eq("name", opts.instanceName)
      .maybeSingle();
    if (instanceError || !instance) throw instanceError || new Error("instancia SigZap ausente");

    const { data: contact, error: contactError } = await opts.supabase
      .from("sigzap_contacts")
      .upsert({
        instance_id: instance.id,
        contact_jid: contactJid,
        contact_phone: digits,
        updated_at: now,
      }, { onConflict: "contact_jid,instance_id" })
      .select("id")
      .single();
    if (contactError) throw contactError;

    const { data: conversation, error: conversationError } = await opts.supabase
      .from("sigzap_conversations")
      .upsert({
        instance_id: instance.id,
        contact_id: contact.id,
        status: "open",
        last_message_text: opts.text,
        last_message_at: now,
        unread_count: 0,
        updated_at: now,
      }, { onConflict: "contact_id,instance_id" })
      .select("id")
      .single();
    if (conversationError) throw conversationError;

    const { data: existing, error: existingError } = await opts.supabase
      .from("sigzap_messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("wa_message_id", waMessageId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) {
      const { error: messageError } = await opts.supabase.from("sigzap_messages").insert({
        conversation_id: conversation.id,
        wa_message_id: waMessageId,
        from_me: true,
        sender_jid: contactJid,
        message_text: opts.text,
        message_type: "text",
        message_status: "sent",
        raw_payload: result.evolutionResponse,
        quoted_message_id: opts.quotedMessageId || null,
        sent_at: now,
        sent_via_instance_name: opts.instanceName,
      });
      if (messageError) throw messageError;
    }
  } catch (error) {
    // O WhatsApp ja aceitou a mensagem: falha de historico nao pode provocar
    // reenvio e duplicar o contato. O erro fica observavel para reconciliacao.
    console.error(
      `[evo-sender] falha ao persistir historico comercial (${opts.instanceName}):`,
      error instanceof Error ? error.message : String(error),
    );
  }
}

// uazapi (piloto 11/06): provider alternativo. A orquestração anti-ban (pre_send_check,
// delay, retry, log) é a MESMA — muda só o transporte (endpoint + header de auth).
const UZAPI_URL = (Deno.env.get("UAZAPI_SERVER_URL") || "").replace(/\/+$/, "");

interface Transporte {
  endpoint: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

// Decide endpoint/header/body por provedor do chip. Evolution = default.
async function resolveTransporte(
  supabase: SupabaseClient,
  evo: EvoConfig,
  chipId: string,
  instanceName: string,
  kind: "text" | "media",
  payload: Record<string, unknown>,
): Promise<Transporte> {
  const { data: chip } = await supabase.from("chips").select("provedor").eq("id", chipId).maybeSingle();
  const provedor = (chip?.provedor as string) || "evolution";

  if (provedor === "uazapi" && UZAPI_URL) {
    const { data: sec } = await supabase
      .from("chip_provider_secrets").select("uazapi_token").eq("chip_id", chipId).maybeSingle();
    const token = sec?.uazapi_token as string | undefined;
    if (token) {
      const headers = { "Content-Type": "application/json", token };
      if (kind === "text") {
        return { endpoint: `${UZAPI_URL}/send/text`, headers, body: { number: payload.number, text: payload.text } };
      }
      // mídia: uazapi /send/media (number, type, file=url, text=caption)
      return {
        endpoint: `${UZAPI_URL}/send/media`,
        headers,
        body: { number: payload.number, type: payload.mediatype, file: payload.media, text: payload.caption || "", docName: payload.fileName },
      };
    }
  }

  // Evolution (default)
  const headers = { "Content-Type": "application/json", apikey: evo.apiKey };
  const path = kind === "text" ? "sendText" : "sendMedia";
  return { endpoint: `${evo.url}/message/${path}/${encodeURIComponent(instanceName)}`, headers, body: payload };
}

function hashContent(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Internal: executa pre_send_check + delay + POST com retry + log.
 * Usado pelos wrappers públicos sendWhatsAppText e sendWhatsAppMedia.
 */
async function executeEvolutionSend(args: {
  base: BaseOpts;
  conteudoTipo: ConteudoTipo;
  conteudoHash: string;
  conteudoSize: number;
  endpoint: string;            // já com instance encoded
  body: Record<string, unknown>;
  transportHeaders?: Record<string, string>; // header de auth por provedor (uazapi: token / evolution: apikey)
}): Promise<SendResult> {
  const {
    base: {
      supabase,
      evo,
      chipId,
      instanceName,
      toJid,
      eventoOrigem,
      awaitDelay = true,
      timeoutMs = DEFAULT_TIMEOUT,
      maxRetries = DEFAULT_MAX_RETRIES,
    },
    conteudoTipo,
    conteudoHash,
    conteudoSize,
    endpoint,
    body,
    transportHeaders,
  } = args;
  const postHeaders = transportHeaders || { "Content-Type": "application/json", apikey: evo.apiKey };

  // 1. pre_send_check
  const { data: checkData, error: checkErr } = await supabase.rpc("pre_send_check", {
    p_chip_id: chipId,
    p_to_jid: toJid,
    p_conteudo_hash: conteudoHash,
    p_evento_origem: eventoOrigem,
  });

  if (checkErr) {
    console.error("[evo-sender] pre_send_check error:", checkErr);
    return { sent: false, reason: "pre_send_check_error: " + checkErr.message };
  }

  const check = checkData as any;

  // 2. Denied
  if (!check?.allow) {
    await supabase.from("chip_send_log").insert({
      chip_id: chipId,
      to_jid: toJid,
      conteudo_tipo: conteudoTipo,
      conteudo_hash: conteudoHash,
      conteudo_size: conteudoSize,
      evento_origem: eventoOrigem,
      status: "rate_limited",
      pre_send_check_result: check,
    });
    return {
      sent: false,
      reason: check?.reason || "denied",
      preSendCheck: check,
      retryInMs: check?.retry_in_ms,
    };
  }

  // 3. Delay
  const delayMs: number = check?.delay_ms ?? 0;
  if (awaitDelay && delayMs > 0) {
    await sleep(delayMs);
  } else if (!awaitDelay && delayMs > 0) {
    return {
      sent: false,
      reason: "delay_pending",
      preSendCheck: check,
      retryInMs: delayMs,
    };
  }

  // 4. POST com retry exponencial pra erros transitórios
  let lastErrCode: number | undefined;
  let lastErrSlice: string | undefined;
  let lastNetworkErr: any;
  let evoBody: any = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    let resp: Response;
    try {
      resp = await fetchWithTimeout(
        endpoint,
        {
          method: "POST",
          headers: postHeaders,
          body: JSON.stringify(body),
        },
        timeoutMs
      );
    } catch (e: any) {
      lastNetworkErr = e;
      // Network error é tratado como transitório
      if (attempt < maxRetries) {
        const backoff = Math.min(8000, 1000 * Math.pow(2, attempt));
        console.warn(`[evo-sender] network error attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${backoff}ms:`, e?.message);
        await sleep(backoff);
        attempt++;
        continue;
      }
      break;
    }

    if (resp.ok) {
      try {
        evoBody = await resp.json();
      } catch { /* sem body json */ }
      break; // sucesso
    }

    const errText = await resp.text();
    lastErrCode = resp.status;
    lastErrSlice = errText.slice(0, 500);

    // Transitório → retry
    // Evolution responde HTTP 400 quando o socket fecha temporariamente.
    // O corpo, e nao apenas o status, define se vale tentar de novo.
    const connectionClosed = errText.toLowerCase().includes("connection closed");
    if ((TRANSIENT_CODES.has(resp.status) || connectionClosed) && attempt < maxRetries) {
      const backoff = Math.min(8000, 1000 * Math.pow(2, attempt));
      console.warn(`[evo-sender] HTTP ${resp.status}${connectionClosed ? " Connection Closed" : ""} attempt ${attempt + 1}/${maxRetries + 1}, retrying in ${backoff}ms`);
      await sleep(backoff);
      attempt++;
      continue;
    }

    // Fatal ou esgotou retries → break
    break;
  }

  // 5a. Sucesso
  if (evoBody !== null || (lastErrCode === undefined && !lastNetworkErr)) {
    await supabase.from("chip_send_log").insert({
      chip_id: chipId,
      to_jid: toJid,
      conteudo_tipo: conteudoTipo,
      conteudo_hash: conteudoHash,
      conteudo_size: conteudoSize,
      evento_origem: eventoOrigem,
      status: "sent",
      evolution_response: evoBody,
      delay_aplicado_ms: delayMs,
      pre_send_check_result: check,
    });
    await supabase.rpc("chip_state_bump_send", {
      p_chip_id: chipId,
      p_success: true,
    });
    return {
      sent: true,
      evolutionResponse: evoBody,
      preSendCheck: check,
      delayApplicadoMs: delayMs,
      retriesAttempted: attempt,
    };
  }

  // 5b. Erro de rede (todos retries esgotados)
  if (lastNetworkErr && lastErrCode === undefined) {
    await supabase.from("chip_send_log").insert({
      chip_id: chipId,
      to_jid: toJid,
      conteudo_tipo: conteudoTipo,
      conteudo_hash: conteudoHash,
      conteudo_size: conteudoSize,
      evento_origem: eventoOrigem,
      status: "failed",
      evolution_error: lastNetworkErr?.message || String(lastNetworkErr),
      delay_aplicado_ms: delayMs,
      pre_send_check_result: check,
    });
    await supabase.from("chip_health_event").insert({
      chip_id: chipId,
      tipo: "failed_send",
      detalhe: { error: lastNetworkErr?.message, endpoint, retries: attempt },
      score_delta: 5,
    });
    return {
      sent: false,
      reason: "network_error: " + (lastNetworkErr?.message || lastNetworkErr),
      preSendCheck: check,
      retriesAttempted: attempt,
    };
  }

  // 5c. Erro HTTP
  let healthTipo: string = "failed_send";
  let scoreDelta = 5;
  if (lastErrCode === 401) {
    healthTipo = "disconnect_401";
    scoreDelta = 60;
  } else if (lastErrCode === 403) {
    healthTipo = "http_403";
    scoreDelta = 40;
  } else if (lastErrCode === 429) {
    healthTipo = "http_429";
    scoreDelta = 25;
  } else if (lastErrCode === 463) {
    healthTipo = "463_timelock";
    scoreDelta = 35;
  }

  await supabase.from("chip_send_log").insert({
    chip_id: chipId,
    to_jid: toJid,
    conteudo_tipo: conteudoTipo,
    conteudo_hash: conteudoHash,
    conteudo_size: conteudoSize,
    evento_origem: eventoOrigem,
    status: "failed",
    evolution_error: lastErrSlice,
    error_code: lastErrCode,
    delay_aplicado_ms: delayMs,
    pre_send_check_result: check,
  });
  await supabase.from("chip_health_event").insert({
    chip_id: chipId,
    tipo: healthTipo,
    detalhe: { http_status: lastErrCode, body: lastErrSlice, endpoint, retries: attempt },
    score_delta: scoreDelta,
  });

  return {
    sent: false,
    reason: lastErrSlice?.toLowerCase().includes("connection closed")
      ? "connection_closed"
      : `evolution_${lastErrCode}`,
    errorCode: lastErrCode,
    evolutionResponse: lastErrSlice,
    preSendCheck: check,
    retriesAttempted: attempt,
  };
}

/**
 * sendWhatsAppText — único caminho permitido pra mandar texto via Evolution.
 */
export async function sendWhatsAppText(opts: SendTextOpts): Promise<SendResult> {
  const { supabase, evo, chipId, instanceName, toJid, text, quotedMessageId } = opts;
  const conteudoHash = hashContent(text);
  const conteudoSize = text.length;
  const payload: Record<string, unknown> = { number: toJid, text };
  if (quotedMessageId) payload.quoted = { key: { id: quotedMessageId } };

  const t = await resolveTransporte(supabase, evo, chipId, instanceName, "text", payload);
  const result = await executeEvolutionSend({
    base: opts,
    conteudoTipo: "text",
    conteudoHash,
    conteudoSize,
    endpoint: t.endpoint,
    body: t.body,
    transportHeaders: t.headers,
  });
  await persistBusinessOutbound(opts, result);
  return result;
}

/**
 * sendWhatsAppMedia — caminho pra mandar imagem/vídeo/áudio/documento.
 * Espera URL pública da mídia (não base64). Caller faz upload pra Storage antes.
 */
export async function sendWhatsAppMedia(opts: SendMediaOpts): Promise<SendResult> {
  const {
    evo,
    instanceName,
    toJid,
    mediaType,
    mediaUrl,
    mediaMimeType,
    mediaCaption,
    mediaFilename,
    quotedMessageId,
  } = opts;

  const hashSeed = mediaUrl + (mediaCaption || "") + (mediaFilename || "");
  const conteudoHash = hashContent(hashSeed);
  const conteudoSize = (mediaCaption?.length || 0) + (mediaFilename?.length || 0);
  const payload: Record<string, unknown> = {
    number: toJid,
    mediatype: mediaType,
    mimetype: mediaMimeType,
    caption: mediaCaption || "",
    fileName: mediaFilename,
    media: mediaUrl,
  };
  if (quotedMessageId) payload.quoted = { key: { id: quotedMessageId } };

  // Mapeia tipo Evolution → conteudoTipo do log
  const conteudoTipo: ConteudoTipo = mediaType === "video" ? "image" : (mediaType as ConteudoTipo);

  const t = await resolveTransporte(opts.supabase, evo, opts.chipId, instanceName, "media", payload);
  return executeEvolutionSend({
    base: opts,
    conteudoTipo,
    conteudoHash,
    conteudoSize,
    endpoint: t.endpoint,
    body: t.body,
    transportHeaders: t.headers,
  });
}

/**
 * Helper utilitário: busca config Evolution de config_lista_items.
 * Cacheia em memória do worker pra evitar query repetida.
 */
let _evoCache: EvoConfig | null = null;
export async function getEvoConfig(supabase: SupabaseClient): Promise<EvoConfig> {
  if (_evoCache) return _evoCache;
  const { data } = await supabase
    .from("config_lista_items")
    .select("campo_nome, valor")
    .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
  const url = data?.find((c: any) => c.campo_nome === "evolution_api_url")?.valor as string | undefined;
  const apiKey = data?.find((c: any) => c.campo_nome === "evolution_api_key")?.valor as string | undefined;
  if (!url || !apiKey) throw new Error("Evolution API config missing in config_lista_items");
  _evoCache = { url: url.replace(/\/$/, ""), apiKey };
  return _evoCache;
}

/**
 * Helper: busca chip_id, instance_name pelo número (telefone) ou pelo id direto.
 * Reutilizado pelas edges quando só têm o número e não o uuid.
 */
export async function resolveChip(
  supabase: SupabaseClient,
  args: { chipId?: string; instanceName?: string; numero?: string }
): Promise<{ chipId: string; instanceName: string } | null> {
  let q = supabase.from("chips").select("id, instance_name").limit(1);
  if (args.chipId) q = q.eq("id", args.chipId);
  else if (args.instanceName) q = q.eq("instance_name", args.instanceName);
  else if (args.numero) q = q.eq("numero", args.numero);
  else return null;
  const { data } = await q.maybeSingle();
  if (!data) return null;
  return { chipId: data.id as string, instanceName: data.instance_name as string };
}
