// Compartilhado do SLA de laudos (sla-alertas e sla-voz).
// Token da URL de roteiro da ligação: HMAC-SHA256 do alerta_id com SLA_COLETOR_KEY (o Twilio chama sla-voz sem login).
export async function tokenAlerta(alertaId: string) {
  const chave = Deno.env.get("SLA_COLETOR_KEY") ?? "";
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`sla-voz:${alertaId}`)));
  return Array.from(sig.slice(0, 16)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
export const SLA_VOZ_URL = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-voz";
