// Unipile (API v2): LinkedIn e Instagram das pessoas da GSS. Desenho: docs/arquitetura/linkedin-instagram-campanha.md.
// A credencial da conta (senha, cookie) fica só na Unipile; o Sigma guarda só o account_id (linkedin_contas).

export const UNIPILE_URL = (Deno.env.get("UNIPILE_BASE_URL") || "https://api.unipile.com/v2").replace(/\/+$/, "");

export async function unipile(path: string, init: RequestInit = {}) {
  const chave = Deno.env.get("UNIPILE_API_KEY");
  if (!chave) throw new Error("UNIPILE_API_KEY ausente");
  const r = await fetch(`${UNIPILE_URL}${path}`, {
    ...init,
    headers: { "X-API-KEY": chave, accept: "application/json", "content-type": "application/json", ...(init.headers || {}) },
  });
  const texto = await r.text();
  let dados: any = null;
  try { dados = texto ? JSON.parse(texto) : null; } catch { dados = { bruto: texto.slice(0, 500) }; }
  if (!r.ok) {
    const e: any = new Error(`unipile ${r.status}: ${dados?.type || ""} ${dados?.title || dados?.detail || ""}`.trim());
    e.status = r.status; e.dados = dados;
    throw e;
  }
  return dados;
}

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmac(chave: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}

// O "state" volta da Unipile no redirect e no webhook account.add; é ele que diz de quem é a conta no Sigma.
// Assinado com a chave da API (que nunca sai das edges) para ninguém forjar "conta do usuário X".
export async function criarState(usuarioId: string, provedor: string, validadeMin: number) {
  const corpo = `${usuarioId}.${provedor}.${Math.floor(Date.now() / 1000) + validadeMin * 60}`;
  return `${corpo}.${(await hmac(Deno.env.get("UNIPILE_API_KEY")!, corpo)).slice(0, 32)}`;
}

export async function lerState(state: string | null | undefined): Promise<{ usuarioId: string; provedor: string } | null> {
  const p = String(state || "").split(".");
  if (p.length !== 4) return null;
  const [usuarioId, provedor, exp, assinatura] = p;
  const esperado = (await hmac(Deno.env.get("UNIPILE_API_KEY")!, `${usuarioId}.${provedor}.${exp}`)).slice(0, 32);
  if (esperado !== assinatura) return null;
  // validade do link + 1 dia de folga: o webhook pode chegar depois do fim do link (retentativas)
  if (Number(exp) + 86_400 < Date.now() / 1000) return null;
  return { usuarioId, provedor };
}

// Assinatura do webhook: cabeçalho unipile-signature "t=<ts>,v0=<hex hmac(secret, `${t}.${corpo}`)>".
export async function webhookValido(corpoBruto: string, cabecalho: string | null) {
  const segredo = Deno.env.get("UNIPILE_WEBHOOK_SECRET");
  if (!segredo || !cabecalho) return false;
  const partes = Object.fromEntries(cabecalho.split(",").map((x) => x.split("=", 2) as [string, string]));
  if (!partes.t || !partes.v0) return false;
  if (Math.abs(Date.now() / 1000 - Number(partes.t)) > 300) return false;
  const esperado = await hmac(segredo, `${partes.t}.${corpoBruto}`);
  if (esperado.length !== partes.v0.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ partes.v0.charCodeAt(i);
  return dif === 0;
}

// Situação da conta no Sigma a partir do status da Unipile.
export function situacaoDe(status: string | null | undefined) {
  switch (status) {
    case "running": case "partial": case "degraded": return "conectada";
    case "disconnected": return "reconectar";
    case "errored": return "pausada";
    default: return "pendente";
  }
}

export async function salvarConta(admin: any, conta: any, usuarioId: string, conectadaPor: string | null, provedor: string) {
  const agora = new Date().toISOString();
  const situacao = situacaoDe(conta?.status);
  const linha: Record<string, unknown> = {
    usuario_id: usuarioId,
    provedor,
    gateway_account_id: conta.id,
    nome_perfil: conta.name ?? null,
    status_unipile: conta.status ?? null,
    situacao,
    motivo: situacao === "conectada" ? null : `status ${conta.status}`,
    atualizado_em: agora,
    ultimo_evento_em: agora,
  };
  if (conectadaPor) linha.conectada_por = conectadaPor;
  if (situacao === "conectada") linha.conectada_em = agora;
  const { data, error } = await admin.from("linkedin_contas").upsert(linha, { onConflict: "gateway_account_id" }).select().single();
  if (error) throw error;
  return data;
}
