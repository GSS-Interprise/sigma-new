// =====================================================================
// Plano Aquecimento + Anti-Ban v1 — Sprint 1
// Single point of send: TODA chamada `/message/sendText` deve passar por
// sendWhatsAppText(). Internamente chama pre_send_check, aplica delay,
// faz POST na Evolution, loga em chip_send_log e em caso de erro registra
// em chip_health_event com classificação.
// Doc: .claude/plano-aquecimento-anti-ban-v1.md §3.3
// =====================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type SupabaseClient = ReturnType<typeof createClient>;

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

export interface EvoConfig {
  url: string;
  apiKey: string;
}

export interface SendTextOpts {
  supabase: SupabaseClient;
  evo: EvoConfig;
  chipId: string;
  instanceName: string;
  toJid: string;        // pode ser "5511999999999" ou "5511999999999@s.whatsapp.net" — Evolution normaliza
  text: string;
  eventoOrigem: EventoOrigem;
  // opcional: respeitar delay sugerido pelo pre_send_check.
  // false = retorna { sent: false, retryInMs } pra caller agendar.
  // true (default) = await sleep(delay_ms) antes do POST.
  awaitDelay?: boolean;
  // opcional: timeout da requisição POST. Default 15s.
  timeoutMs?: number;
}

export interface SendResult {
  sent: boolean;
  reason?: string;
  evolutionResponse?: any;
  errorCode?: number;
  preSendCheck?: any;
  retryInMs?: number;
  delayApplicadoMs?: number;
}

const DEFAULT_TIMEOUT = 15_000;

function hashContent(text: string): string {
  // Hash simples FNV-1a 32 bits — não criptográfico, só pra detectar repetição
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
 * sendWhatsAppText — único caminho permitido pra mandar texto via Evolution.
 *
 * Fluxo:
 *  1. Hash do conteúdo
 *  2. Chama pre_send_check no Postgres
 *  3. Se denied → loga em chip_send_log com status apropriado, retorna { sent:false }
 *  4. Se allowed → opcionalmente aguarda delay_ms
 *  5. POST /message/sendText
 *  6. Em sucesso: loga em chip_send_log status='sent' + atualiza chip_state.last_send_at
 *  7. Em erro HTTP: classifica, loga em chip_send_log status='failed', registra
 *     chip_health_event correspondente
 */
export async function sendWhatsAppText(opts: SendTextOpts): Promise<SendResult> {
  const {
    supabase,
    evo,
    chipId,
    instanceName,
    toJid,
    text,
    eventoOrigem,
    awaitDelay = true,
    timeoutMs = DEFAULT_TIMEOUT,
  } = opts;

  const conteudoHash = hashContent(text);
  const conteudoSize = text.length;

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
    // Log da tentativa bloqueada (status = rate_limited ou blocked)
    await supabase.from("chip_send_log").insert({
      chip_id: chipId,
      to_jid: toJid,
      conteudo_tipo: "text",
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
    // Caller decide agendar — retorna info sem enviar
    return {
      sent: false,
      reason: "delay_pending",
      preSendCheck: check,
      retryInMs: delayMs,
    };
  }

  // 4. POST Evolution
  const endpoint = `${evo.url}/message/sendText/${encodeURIComponent(instanceName)}`;
  let resp: Response;
  try {
    resp = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: evo.apiKey,
        },
        body: JSON.stringify({ number: toJid, text }),
      },
      timeoutMs
    );
  } catch (e: any) {
    // Erro de rede / timeout — registra como failed_send (score baixo)
    await supabase.from("chip_send_log").insert({
      chip_id: chipId,
      to_jid: toJid,
      conteudo_tipo: "text",
      conteudo_hash: conteudoHash,
      conteudo_size: conteudoSize,
      evento_origem: eventoOrigem,
      status: "failed",
      evolution_error: e?.message || String(e),
      delay_aplicado_ms: delayMs,
      pre_send_check_result: check,
    });
    await supabase.from("chip_health_event").insert({
      chip_id: chipId,
      tipo: "failed_send",
      detalhe: { error: e?.message, endpoint },
      score_delta: 5,
    });
    return { sent: false, reason: "network_error: " + (e?.message || e), preSendCheck: check };
  }

  if (!resp.ok) {
    const errText = await resp.text();
    const errCode = resp.status;
    const errSlice = errText.slice(0, 500);

    // Classifica HTTP error
    let healthTipo: string = "failed_send";
    let scoreDelta = 5;
    if (errCode === 401) {
      healthTipo = "disconnect_401";
      scoreDelta = 60;
    } else if (errCode === 403) {
      healthTipo = "http_403";
      scoreDelta = 40;
    } else if (errCode === 429) {
      healthTipo = "http_429";
      scoreDelta = 25;
    } else if (errCode === 463) {
      healthTipo = "463_timelock";
      scoreDelta = 35;
    }

    await supabase.from("chip_send_log").insert({
      chip_id: chipId,
      to_jid: toJid,
      conteudo_tipo: "text",
      conteudo_hash: conteudoHash,
      conteudo_size: conteudoSize,
      evento_origem: eventoOrigem,
      status: "failed",
      evolution_error: errSlice,
      error_code: errCode,
      delay_aplicado_ms: delayMs,
      pre_send_check_result: check,
    });
    await supabase.from("chip_health_event").insert({
      chip_id: chipId,
      tipo: healthTipo,
      detalhe: { http_status: errCode, body: errSlice, endpoint },
      score_delta: scoreDelta,
    });

    return {
      sent: false,
      reason: `evolution_${errCode}`,
      errorCode: errCode,
      evolutionResponse: errSlice,
      preSendCheck: check,
    };
  }

  // 5. Sucesso
  let evoBody: any = null;
  try {
    evoBody = await resp.json();
  } catch {
    /* sem body json */
  }

  await supabase.from("chip_send_log").insert({
    chip_id: chipId,
    to_jid: toJid,
    conteudo_tipo: "text",
    conteudo_hash: conteudoHash,
    conteudo_size: conteudoSize,
    evento_origem: eventoOrigem,
    status: "sent",
    evolution_response: evoBody,
    delay_aplicado_ms: delayMs,
    pre_send_check_result: check,
  });

  // Atualiza chip_state.last_send_at + lifetime counter (atômico via RPC)
  await supabase.rpc("chip_state_bump_send", {
    p_chip_id: chipId,
    p_success: true,
  });

  return {
    sent: true,
    evolutionResponse: evoBody,
    preSendCheck: check,
    delayApplicadoMs: delayMs,
  };
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
