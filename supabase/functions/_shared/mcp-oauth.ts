// Regras puras do login OAuth 2.1 do sigma-mcp (T7 de docs/arquitetura/claude-socios-gss.md).
// O Claude.ai, o app do celular e o Claude Desktop só conectam MCP remoto por OAuth: descobrem o servidor de login
// pelos metadados (RFC 9728 e RFC 8414), registram-se sozinhos (RFC 7591, cliente público, sem segredo) e trocam
// código por token com PKCE S256. Sem import: só Web Crypto, que existe no Deno e no navegador.
// Testes: mcp-oauth_test.ts (deno test).

export const ESCOPO = "sigma:ler";
export const VIDA_ACESSO_S = 60 * 60;            // access token: 1 h (o Claude renova sozinho pelo refresh)
export const VIDA_REFRESH_DIAS = 90;             // refresh: 90 dias, renovado a cada uso (rotaciona)
export const VIDA_CODIGO_S = 10 * 60;            // código de autorização: 10 min, uso único

/**
 * Para onde o código pode voltar. Só os clientes Claude: o callback do Claude.ai/claude.com e o localhost do
 * Claude Code/Desktop. Fechado de propósito: com registro dinâmico aberto, qualquer site poderia se registrar e
 * pedir a um sócio para "autorizar"; com a lista, o código nunca sai para um domínio que não é da Anthropic.
 */
const HOSTS_CLAUDE = new Set(["claude.ai", "claude.com"]);
export function redirectPermitido(uri: string): boolean {
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (u.protocol === "https:" && HOSTS_CLAUDE.has(u.hostname)) return true;
  if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]")) return true;
  return false;
}

/** Caminho da edge sem o prefixo do gateway: "/functions/v1/sigma-mcp/token" e "/sigma-mcp/token" viram "/token". */
export function rota(pathname: string): string {
  const i = pathname.indexOf("/sigma-mcp");
  const resto = i >= 0 ? pathname.slice(i + "/sigma-mcp".length) : pathname;
  const r = resto.replace(/\/+$/, "");
  return r === "" || r === "/mcp" ? "/" : r;
}

export function metadadosRecurso(base: string) {
  return {
    resource: base,
    authorization_servers: [base],
    scopes_supported: [ESCOPO],
    bearer_methods_supported: ["header"],
    resource_name: "Sigma GSS",
  };
}

export function metadadosServidor(base: string) {
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    revocation_endpoint: `${base}/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [ESCOPO],
    // Alguns clientes só procuram /.well-known/openid-configuration; os campos abaixo deixam esse documento válido.
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["none"],
  };
}

export function cabecalho401(base: string): string {
  return `Bearer realm="sigma-mcp", resource_metadata="${base}/.well-known/oauth-protected-resource"`;
}

// ---- registro dinâmico ------------------------------------------------------------------------------------

export type Registro = { client_name: string; redirect_uris: string[] };

/** Corpo do POST /register → cliente válido ou o erro no formato do RFC 7591. */
export function validarRegistro(corpo: unknown): Registro | { error: string; error_description: string } {
  const c = (corpo && typeof corpo === "object" ? corpo : {}) as Record<string, unknown>;
  const uris = Array.isArray(c.redirect_uris) ? c.redirect_uris.map(String) : [];
  if (!uris.length) return { error: "invalid_redirect_uri", error_description: "redirect_uris obrigatório" };
  const ruim = uris.find((u) => !redirectPermitido(u));
  if (ruim) return { error: "invalid_redirect_uri", error_description: `redirect não permitido: ${ruim}` };
  const auth = String(c.token_endpoint_auth_method ?? "none");
  if (auth !== "none") return { error: "invalid_client_metadata", error_description: "só cliente público (token_endpoint_auth_method=none)" };
  const tipos = Array.isArray(c.grant_types) ? c.grant_types.map(String) : ["authorization_code"];
  if (tipos.some((t) => t !== "authorization_code" && t !== "refresh_token")) {
    return { error: "invalid_client_metadata", error_description: "grant_types aceitos: authorization_code, refresh_token" };
  }
  const nome = String(c.client_name ?? "").trim().slice(0, 80) || "Claude";
  return { client_name: nome, redirect_uris: [...new Set(uris)] };
}

// ---- autorização ------------------------------------------------------------------------------------------

export type PedidoAutorizacao = {
  client_id: string; redirect_uri: string; state: string | null; code_challenge: string; scope: string;
};
export type ErroAutorizacao = { error: string; error_description: string; redirecionar: boolean };

/**
 * Confere o GET /authorize (e de novo o POST de aprovação, que recebe os mesmos parâmetros da tela).
 * Erro em client_id ou redirect_uri NÃO volta para o redirect (RFC 6749 §4.1.2.1): o site seria de terceiro.
 */
export function validarAutorizacao(
  p: Record<string, string | null | undefined>,
  cliente: { redirect_uris: string[] } | null,
  base: string,
): PedidoAutorizacao | ErroAutorizacao {
  const client_id = String(p.client_id ?? "");
  const redirect_uri = String(p.redirect_uri ?? "");
  if (!cliente) return { error: "invalid_client", error_description: "cliente não registrado", redirecionar: false };
  if (!redirect_uri || !cliente.redirect_uris.includes(redirect_uri) || !redirectPermitido(redirect_uri)) {
    return { error: "invalid_request", error_description: "redirect_uri diferente do registrado", redirecionar: false };
  }
  if (p.response_type !== "code") return { error: "unsupported_response_type", error_description: "só response_type=code", redirecionar: true };
  if (p.code_challenge_method !== "S256") return { error: "invalid_request", error_description: "PKCE S256 obrigatório", redirecionar: true };
  if (!/^[A-Za-z0-9_-]{43}$/.test(String(p.code_challenge ?? ""))) {
    return { error: "invalid_request", error_description: "code_challenge inválido", redirecionar: true };
  }
  // RFC 8707: se o cliente disser para qual recurso quer o token, tem que ser este servidor.
  if (p.resource && p.resource.replace(/\/+$/, "") !== base) {
    return { error: "invalid_target", error_description: "resource não é este servidor", redirecionar: true };
  }
  const pedidos = String(p.scope ?? "").split(/\s+/).filter(Boolean);
  if (pedidos.some((s) => s !== ESCOPO)) return { error: "invalid_scope", error_description: `escopo aceito: ${ESCOPO}`, redirecionar: true };
  return { client_id, redirect_uri, state: p.state ?? null, code_challenge: String(p.code_challenge), scope: ESCOPO };
}

export function ehErro(x: PedidoAutorizacao | ErroAutorizacao): x is ErroAutorizacao {
  return "error" in x;
}

/** redirect_uri + parâmetros (mantém query que o cliente já tenha no redirect). */
export function comParametros(uri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

// ---- segredos e PKCE --------------------------------------------------------------------------------------

export function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function desafioS256(verifier: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(b));
}

/** RFC 7636: verifier de 43 a 128 caracteres "unreserved"; o desafio é base64url(sha256(verifier)). */
export async function pkceConfere(verifier: string, desafio: string): Promise<boolean> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  return (await desafioS256(verifier)) === desafio;
}

/** Segredo aleatório com prefixo legível: sgm_ (acesso), sgr_ (refresh), sgc_ (código), mcpc_ (cliente). */
export function novoSegredo(prefixo: string, bytes = 24): string {
  const b = crypto.getRandomValues(new Uint8Array(bytes));
  return prefixo + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Corpo do /token: aceita form-urlencoded (o padrão) e JSON (alguns clientes mandam assim). */
export function lerCorpoToken(tipo: string | null, texto: string): Record<string, string> {
  if ((tipo || "").includes("application/json")) {
    try {
      const j = JSON.parse(texto);
      return Object.fromEntries(Object.entries(j ?? {}).map(([k, v]) => [k, String(v)]));
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(texto));
}
