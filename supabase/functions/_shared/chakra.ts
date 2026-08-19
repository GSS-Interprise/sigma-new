export type ChakraApiResult = Record<string, any>;

function parsePayload(raw: string): ChakraApiResult {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
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
    throw new Error(`chakra_${response.status}:${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return payload;
}
