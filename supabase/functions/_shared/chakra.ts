export type ChakraApiResult = Record<string, any>;

export class ChakraApiError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;
  readonly providerMessage: string;

  constructor(
    status: number,
    providerMessage: string,
    retryAfterMs: number | null,
  ) {
    super(`chakra_${status}:${providerMessage}`);
    this.name = "ChakraApiError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.providerMessage = providerMessage;
  }
}

function parsePayload(raw: string): ChakraApiResult {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

function numericRetryAfter(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Normalizes Chakra's throttling hints so callers can pause instead of
 * immediately repeating the same request. Retry-After is seconds per HTTP
 * convention; Chakra payloads may expose milliseconds or seconds explicitly.
 */
export function parseRetryAfterMs(
  headers: Headers,
  payload: ChakraApiResult,
  nowMs = Date.now(),
) {
  const header = headers.get("retry-after");
  if (header) {
    const seconds = numericRetryAfter(header);
    if (seconds !== null) return Math.round(seconds * 1000);

    const retryAt = Date.parse(header);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - nowMs);
  }

  const candidates = [
    payload,
    payload?.data,
    payload?._data,
  ].filter((value): value is Record<string, any> =>
    Boolean(value && typeof value === "object")
  );
  for (const candidate of candidates) {
    const milliseconds = numericRetryAfter(
      candidate.retry_after_ms ?? candidate.retryAfterMs,
    );
    if (milliseconds !== null) return Math.round(milliseconds);

    const seconds = numericRetryAfter(
      candidate.retry_after ?? candidate.retryAfter,
    );
    if (seconds !== null) return Math.round(seconds * 1000);

    const message = String(candidate.message || candidate.error || "");
    const match = message.match(/retry\s+after\s+(\d+)\s*ms/i);
    if (match) return Number(match[1]);
  }

  return null;
}

export function unwrapChakraPayload(payload: ChakraApiResult): ChakraApiResult {
  const nested = payload?._data ?? payload?.data;
  return nested && typeof nested === "object" ? nested : payload;
}

export function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizePhone(value: unknown) {
  const normalized = digits(value);
  return normalized ? `+${normalized}` : "";
}

export function templateLanguage(value: unknown) {
  return String(value || "pt_BR").replace("-", "_");
}

function providerId(value: unknown): string | null {
  const raw = value && typeof value === "object"
    ? (value as Record<string, unknown>).id ?? (value as Record<string, unknown>).wabaId
    : value;
  const id = String(raw ?? "").trim();
  return id || null;
}

/** A conexão pode conter vários WABAs; o vínculo do telefone prevalece. */
export function resolvePhoneWabaId(
  phone: Record<string, unknown>,
  wabas: unknown[],
  fallback?: unknown,
): string | null {
  const explicit = providerId(
    phone.waba ?? phone.wabaId ?? phone.whatsappBusinessAccountId,
  );
  if (explicit) return explicit;
  if (wabas.length === 1) return providerId(wabas[0]);
  if (wabas.length === 0) return providerId(fallback);
  return null;
}

type ChakraTarget = {
  phone_number_id: string;
  plugin_id: string;
  waba_id: string;
};

export function selectChakraTargets(
  connections: ChakraTarget[],
  selectedPhoneId = "",
): ChakraTarget[] {
  const matching = selectedPhoneId
    ? connections.filter((connection) => connection.phone_number_id === selectedPhoneId)
    : connections;
  return [...new Map(matching.map((connection) => [
    `${connection.plugin_id}:${connection.waba_id}`,
    connection,
  ])).values()];
}

export function chakraTemplateMatchesSender(
  sender: { chakra_plugin_id: string | null; chakra_waba_id: string | null },
  template: { twilio_payload: Record<string, unknown> | null },
): boolean {
  const payload = template.twilio_payload;
  return Boolean(
    sender.chakra_plugin_id && sender.chakra_waba_id &&
      payload?.plugin_id === sender.chakra_plugin_id &&
      payload?.waba_id === sender.chakra_waba_id,
  );
}

export function isExplicitChakraOptOut(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLowerCase();
  return /^(sair|sair da lista|stop|parar|pare|descadastrar)[.!]?$/.test(normalized) ||
    /^nao quero (receber )?(mais )?mensagens[.!]?$/.test(normalized);
}

export function chakraCampaignTemplateDefinition() {
  return {
    name: "gss_oportunidade_sair_20260930",
    body: "Ola, Dr(a). {{1}}. A GSS Saude tem uma oportunidade para {{2}} em {{3}}. Posso enviar os detalhes? Caso nao deseje receber mensagens como esta, responda SAIR.",
    variables: { "1": "Marina", "2": "Anestesiologia", "3": "Sao Miguel do Oeste SC" },
  };
}

export function extractBodyText(template: Record<string, any>) {
  const body = Array.isArray(template.components)
    ? template.components.find((component: any) => String(component?.type).toUpperCase() === "BODY")
    : null;
  return String(body?.text || "").trim();
}

export function extractTemplateVariables(body: string) {
  const positions = [...body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((match) => match[1]);
  return Object.fromEntries([...new Set(positions)].map((position) => [position, `Variável ${position}`]));
}

export async function chakraApi(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("CHAKRA_API_KEY")?.trim();
  if (!key) throw new Error("chakra_not_configured");
  const response = await fetch(`https://api.chakrahq.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const payload = parsePayload(await response.text());
  if (!response.ok) {
    const detail = payload?.message || payload?.error || payload?.raw || "request_failed";
    const providerMessage = typeof detail === "string"
      ? detail
      : JSON.stringify(detail);
    throw new ChakraApiError(
      response.status,
      providerMessage,
      parseRetryAfterMs(response.headers, payload),
    );
  }
  return payload;
}

// ── Botões de resposta rápida (06/10) ────────────────────────────────────────
// Template com "Tenho interesse" / "Sem interesse". O clique chega como mensagem do
// tipo `button` (template) ou `interactive.button_reply` (mensagem com botões enviada
// dentro da janela de 24h). Nos dois casos o texto do botão vira o texto da mensagem,
// para o histórico e a IA lerem como uma resposta normal.

export type ChakraButtonReply = { id: string; text: string };

export function chakraButtonReply(item: Record<string, any>): ChakraButtonReply | null {
  const button = item?.button;
  if (button && typeof button === "object") {
    const text = String(button.text ?? button.title ?? "").trim();
    if (text) return { id: String(button.payload ?? text).trim(), text };
  }
  const reply = item?.interactive?.button_reply ?? item?.interactive?.list_reply;
  if (reply && typeof reply === "object") {
    const text = String(reply.title ?? "").trim();
    if (text) return { id: String(reply.id ?? text).trim(), text };
  }
  return null;
}

export const CHAKRA_OUTRAS_SIM = "gss_outras_sim";
export const CHAKRA_OUTRAS_NAO = "gss_outras_nao";

export type ChakraButtonIntent = "interesse" | "sem_interesse" | "outras_sim" | "outras_nao";

/** O que o clique significa. Só classifica CLIQUE em botão — texto digitado segue para a IA. */
export function classifyChakraButton(reply: ChakraButtonReply | null): ChakraButtonIntent | null {
  if (!reply) return null;
  if (reply.id === CHAKRA_OUTRAS_SIM) return "outras_sim";
  if (reply.id === CHAKRA_OUTRAS_NAO) return "outras_nao";
  const t = reply.text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.!?]/g, "").trim();
  if (/^(nao tenho interesse|sem interesse|nao me interessa)$/.test(t)) return "sem_interesse";
  if (/^(tenho interesse|quero saber mais|tenho interesse sim)$/.test(t)) return "interesse";
  return null;
}

/** Pergunta enviada depois do "Sem interesse": a recusa vale para a vaga, não para a GSS. */
export function chakraOutrasOportunidadesMessage(toPhone: string) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: digits(toPhone),
    type: "interactive",
    interactive: {
      type: "button",
      body: {
        text: "Tudo bem, obrigado pelo retorno! Não vamos mais te chamar sobre esta vaga.\n\nQuer continuar recebendo outras oportunidades da GSS?",
      },
      action: {
        buttons: [
          { type: "reply", reply: { id: CHAKRA_OUTRAS_SIM, title: "Sim, pode mandar" } },
          { type: "reply", reply: { id: CHAKRA_OUTRAS_NAO, title: "Não quero mais" } },
        ],
      },
    },
  };
}

export function chakraTextMessage(toPhone: string, body: string) {
  return { messaging_product: "whatsapp", recipient_type: "individual", to: digits(toPhone), type: "text", text: { body } };
}

/** Componentes de um template com corpo e botões de resposta rápida (até 3, 25 caracteres cada). */
export function chakraQuickReplyComponents(body: string, examples: string[], buttons: string[]) {
  const limpos = buttons.map((b) => String(b || "").trim()).filter(Boolean).slice(0, 3);
  if (limpos.some((b) => b.length > 25)) throw new Error("button_text_too_long");
  const components: Record<string, unknown>[] = [{
    type: "BODY",
    text: body,
    ...(examples.length ? { example: { body_text: [examples] } } : {}),
  }];
  if (limpos.length) {
    components.push({ type: "BUTTONS", buttons: limpos.map((text) => ({ type: "QUICK_REPLY", text })) });
  }
  return components;
}
