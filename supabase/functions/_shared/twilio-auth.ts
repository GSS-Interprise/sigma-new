/**
 * Resolve credenciais Twilio por conta sem armazenar tokens no banco.
 * O banco guarda apenas um alias seguro (ex.: `principal`, `subconta_2`);
 * os valores continuam exclusivamente nas secrets da Edge Function.
 */
export function normalizeTwilioAccountKey(value: unknown): string {
  const raw = String(value || "principal").trim().toLowerCase();
  if (!raw || raw === "primary" || raw === "principal") return "principal";
  const normalized = raw.replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "");
  if (!normalized) return "principal";
  return normalized;
}

export function twilioCredentials(accountKey?: unknown) {
  const key = normalizeTwilioAccountKey(accountKey);
  const suffix = key === "principal" ? "" : `_${key.toUpperCase()}`;
  const sid = Deno.env.get(`TWILIO_ACCOUNT_SID${suffix}`);
  const token = Deno.env.get(`TWILIO_AUTH_TOKEN${suffix}`);
  if (!sid || !token) throw new Error(`twilio_credentials_not_configured:${key}`);
  return { key, sid, token, header: `Basic ${btoa(`${sid}:${token}`)}` };
}

export function twilioAuthorization(accountKey?: unknown) {
  return twilioCredentials(accountKey).header;
}
