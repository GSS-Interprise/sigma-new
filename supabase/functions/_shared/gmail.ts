// Envio pelo Gmail da pessoa da equipe (conta conectada em gmail-oauth). Usado pelo email-campanha.

export class GmailErro extends Error {
  constructor(public tipo: "conexao" | "cota" | "destinatario" | "outro", mensagem: string) {
    super(mensagem);
  }
}

/** Troca o refresh token por um access token (vale ~1 hora). */
export async function gmailAccessToken(refreshToken: string): Promise<string> {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_GMAIL_CLIENT_ID") || "",
      client_secret: Deno.env.get("GOOGLE_GMAIL_CLIENT_SECRET") || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok || !corpo.access_token) {
    // invalid_grant = a pessoa revogou o acesso, trocou a senha ou a conta foi suspensa
    throw new GmailErro(corpo.error === "invalid_grant" ? "conexao" : "outro",
      String(corpo.error_description || corpo.error || `token_${r.status}`).slice(0, 200));
  }
  return corpo.access_token;
}

function base64Utf8(texto: string) {
  const bytes = new TextEncoder().encode(texto);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// Cabeçalho com acento precisa de "encoded-word" (RFC 2047); sem isso o assunto chega quebrado.
function cabecalho(texto: string) {
  const limpo = texto.replace(/[\r\n"]/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(limpo) ? `"${limpo}"` : `=?UTF-8?B?${base64Utf8(limpo)}?=`;
}
function assuntoMime(texto: string) {
  const limpo = texto.replace(/[\r\n]/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(limpo) ? limpo : `=?UTF-8?B?${base64Utf8(limpo)}?=`;
}
const quebrar = (s: string) => s.replace(/.{1,76}/g, "$&\r\n");

/** Monta a mensagem MIME (texto + HTML) no formato "raw" que a API do Gmail recebe. */
export function gmailMensagemRaw(m: {
  deNome: string; deEmail: string; para: string; assunto: string; html: string; text: string;
  headers?: Record<string, string>;
}) {
  const fronteira = "sigma_" + crypto.randomUUID().replace(/-/g, "");
  const extras = Object.entries(m.headers ?? {}).map(([k, v]) => `${k}: ${v.replace(/[\r\n]/g, " ")}`);
  const mime = [
    `From: ${cabecalho(m.deNome)} <${m.deEmail}>`,
    `To: ${m.para}`,
    `Subject: ${assuntoMime(m.assunto)}`,
    "MIME-Version: 1.0",
    ...extras,
    `Content-Type: multipart/alternative; boundary="${fronteira}"`,
    "",
    `--${fronteira}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    quebrar(base64Utf8(m.text || "")),
    `--${fronteira}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    quebrar(base64Utf8(m.html || "")),
    `--${fronteira}--`,
    "",
  ].join("\r\n");
  return base64Utf8(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Envia pela caixa da conta. Devolve o id da mensagem no Gmail. */
export async function gmailEnviar(accessToken: string, raw: string): Promise<string> {
  const r = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  const corpo = await r.json().catch(() => ({}));
  if (r.ok && corpo.id) return corpo.id;
  const msg = String(corpo?.error?.message || `gmail_${r.status}`).slice(0, 300);
  const motivo = JSON.stringify(corpo?.error?.errors ?? []);
  if (r.status === 429 || /quota|rateLimit|limit exceeded/i.test(msg + motivo)) throw new GmailErro("cota", msg);
  if (r.status === 401 || r.status === 403) throw new GmailErro("conexao", msg);
  if (r.status === 400 && /recipient|address|invalid to/i.test(msg)) throw new GmailErro("destinatario", msg);
  throw new GmailErro("outro", msg);
}
