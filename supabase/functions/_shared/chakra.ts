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
