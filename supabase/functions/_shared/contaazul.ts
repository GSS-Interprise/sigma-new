// Conexão com o Conta Azul (API v2, OAuth 2.0 Authorization Code).
//
// Credencial do aplicativo: segredo CONTAAZUL_BASIC = base64(client_id:client_secret), o mesmo
// valor que o portal do desenvolvedor mostra no cabeçalho "Authorization: Basic ...".
// Tokens da conta da GSS: integracao_segredos.contaazul_tokens (só service role lê).
//
// ⚠ O refresh_token é ROTATIVO: cada renovação invalida o anterior. Por isso a troca é
// gravada com trava otimista — duas funções renovando ao mesmo tempo derrubariam a conexão.

export const CA_API = "https://api-v2.contaazul.com";
export const CA_AUTORIZAR = "https://login.contaazul.com/#/oauth/authorize";
export const CA_ESCOPO = "openid+profile+aws.cognito.signin.user.admin";
const SEGREDO_TOKENS = "contaazul_tokens";

type Tokens = { access_token: string; refresh_token: string; expira_em: string; conectado_em?: string; conectado_por?: string | null };

export function credencial() {
  const basic = (Deno.env.get("CONTAAZUL_BASIC") || "").trim();
  if (!basic) throw new Error("contaazul_nao_configurado");
  const clientId = atob(basic).split(":")[0];
  return { basic, clientId };
}

async function pedirToken(corpo: Record<string, string>) {
  const { basic } = credencial();
  const r = await fetch(`${CA_API}/oauth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(corpo).toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    throw new Error(`contaazul_token_${r.status}:${String(j.error_description || j.error || j.message || "").slice(0, 200)}`);
  }
  return j as { access_token: string; refresh_token: string; expires_in: number };
}

const montar = (t: { access_token: string; refresh_token: string; expires_in: number }, extra: Partial<Tokens> = {}): Tokens => ({
  access_token: t.access_token,
  refresh_token: t.refresh_token,
  expira_em: new Date(Date.now() + (Number(t.expires_in) || 3600) * 1000).toISOString(),
  ...extra,
});

/** Troca o código de autorização (válido por 3 minutos) pelos tokens e guarda. */
export async function conectar(svc: any, code: string, redirectUri: string, usuario: string | null) {
  const t = await pedirToken({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  const tokens = montar(t, { conectado_em: new Date().toISOString(), conectado_por: usuario });
  const { error } = await svc.from("integracao_segredos")
    .upsert({ nome: SEGREDO_TOKENS, valor: JSON.stringify(tokens), atualizado_em: new Date().toISOString() });
  if (error) throw error;
  return tokens;
}

export async function lerTokens(svc: any): Promise<{ tokens: Tokens; bruto: string } | null> {
  const { data } = await svc.from("integracao_segredos").select("valor").eq("nome", SEGREDO_TOKENS).maybeSingle();
  if (!data?.valor) return null;
  try { return { tokens: JSON.parse(data.valor) as Tokens, bruto: data.valor }; } catch { return null; }
}

/** Access token válido; renova quando faltam menos de 5 minutos. */
export async function tokenDeAcesso(svc: any): Promise<string> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const atual = await lerTokens(svc);
    if (!atual) throw new Error("contaazul_nao_conectado");
    if (new Date(atual.tokens.expira_em).getTime() - Date.now() > 5 * 60_000) return atual.tokens.access_token;

    const t = await pedirToken({ grant_type: "refresh_token", refresh_token: atual.tokens.refresh_token });
    const novos = montar(t, { conectado_em: atual.tokens.conectado_em, conectado_por: atual.tokens.conectado_por });
    // só grava se ninguém renovou no meio; se perdeu a corrida, relê e usa o token do outro
    const { data: gravou } = await svc.from("integracao_segredos")
      .update({ valor: JSON.stringify(novos), atualizado_em: new Date().toISOString() })
      .eq("nome", SEGREDO_TOKENS).eq("valor", atual.bruto).select("nome");
    if (gravou?.length) return novos.access_token;
  }
  throw new Error("contaazul_renovacao_concorrente");
}

/** Chamada autenticada à API. Limite do Conta Azul: 600/min e 10/s por conta conectada. */
export async function ca(svc: any, caminho: string, init: RequestInit = {}) {
  const token = await tokenDeAcesso(svc);
  const r = await fetch(`${CA_API}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const texto = await r.text();
  let corpo: any = {};
  try { corpo = texto ? JSON.parse(texto) : {}; } catch { corpo = { bruto: texto.slice(0, 300) }; }
  if (!r.ok) throw new Error(`contaazul_${r.status}:${String(corpo?.message || corpo?.error || corpo?.bruto || "").slice(0, 200)}`);
  return corpo;
}

/** A API devolve listas em formatos diferentes por recurso; acha o array onde ele estiver. */
export function itensDe(resposta: any): any[] {
  if (Array.isArray(resposta)) return resposta;
  for (const k of ["itens", "items", "content", "data", "dados", "resultados"]) {
    if (Array.isArray(resposta?.[k])) return resposta[k];
  }
  return [];
}

/** Lê todas as páginas de um recurso de consulta (pagina / tamanho_pagina). */
export async function listarTudo(svc: any, caminho: string, filtros: Record<string, string> = {}, maxPaginas = 40, tamanho = 100) {
  const tudo: any[] = [];
  const vistos = new Set<string>();
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const qs = new URLSearchParams({ pagina: String(pagina), tamanho_pagina: String(tamanho), ...filtros }).toString();
    const itens = itensDe(await ca(svc, `${caminho}?${qs}`));
    // recurso que ignora a paginação devolve sempre a mesma página: para quando nada é novo
    const novos = itens.filter((i: any) => {
      const id = String(i?.id ?? i?.uuid ?? i?.codigo ?? "");
      if (!id) return true;
      if (vistos.has(id)) return false;
      vistos.add(id);
      return true;
    });
    tudo.push(...novos);
    if (itens.length < tamanho || novos.length === 0) break;
  }
  return tudo;
}
