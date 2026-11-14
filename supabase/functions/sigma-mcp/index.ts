// Servidor MCP remoto do Sigma para o Claude dos sócios da GSS (docs/arquitetura/claude-socios-gss.md §3c).
// Transporte: MCP Streamable HTTP sem sessão (JSON-RPC 2.0 em POST, resposta JSON). Só leitura nesta fase.
// Ferramentas, guia e prompts: registro de domínios em _shared/agente/ (docs/arquitetura/protocolo-agente-sigma.md).
// Login, dois jeitos, os dois na tabela mcp_tokens (só o hash sha256) e cada chamada auditada em mcp_chamadas:
//   - token pessoal "sgm_..." gerado na tela /conectar-claude (T5), colado no Claude Code;
//   - OAuth 2.1 (T7) para Claude.ai, celular e Desktop: esta mesma edge serve os metadados, o registro dinâmico,
//     /authorize (manda para a tela de aprovação do Sigma), /token e /revoke. Regras em _shared/mcp-oauth.ts.
// Deploy com verify_jwt = false (o token não é JWT do Supabase; a checagem é feita aqui).
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { constituicao, guiaTexto, hashResultado, PROTOCOLO_VERSAO, renderizar } from "../_shared/agente/protocolo.ts";
import { acessosDoUsuario, DOMINIOS, dominioBloqueado, exposto, validarRegistro as validarDominios } from "../_shared/agente/registro.ts";
import { ErroFerramenta } from "../_shared/agente/tipos.ts";
import {
  cabecalho401, comParametros, ehErro, lerCorpoToken, metadadosRecurso, metadadosServidor, novoSegredo,
  pkceConfere, rota, sha256Hex, validarAutorizacao, validarRegistro, VIDA_ACESSO_S, VIDA_CODIGO_S, VIDA_REFRESH_DIAS,
} from "../_shared/mcp-oauth.ts";

const PAPEIS_LIBERADOS = ["admin", "diretoria"];
const VERSOES = ["2025-06-18", "2025-03-26", "2024-11-05"];
const BASE = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sigma-mcp`;
// Tela de aprovação do OAuth (src/pages/ConectarClaude.tsx), no front publicado pelo Lovable.
const APP = (Deno.env.get("APP_URL") || "https://sigma-gss.lovable.app").replace(/\/+$/, "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, mcp-protocol-version, mcp-session-id, apikey, x-client-info",
  "Access-Control-Expose-Headers": "WWW-Authenticate",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const resp = (b: unknown, s = 200, extra: Record<string, string> = {}) =>
  new Response(b === null ? null : JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", ...extra } });

// ---- protocolo do agente ------------------------------------------------------------------------------
// As ferramentas, o guia e os prompts vêm do registro de domínios (_shared/agente/, docs/arquitetura/
// protocolo-agente-sigma.md). Esta edge só cuida de transporte, login, permissão e auditoria.

// Registro quebrado não sobe: melhor a edge falhar no deploy do que um sócio receber resposta de domínio errado.
validarDominios(DOMINIOS);

/**
 * Domínios que o usuário vê: união dos papéis dele em agente_dominio_acessos (T3). Lido a cada requisição, para a
 * chave da aba de admin valer na hora. Falha de leitura = nenhum domínio (nunca abrir tudo por erro).
 */
async function acessos(svc: SupabaseClient, s: Sessao) {
  const { data, error } = await svc.rpc("agente_dominios_do_usuario", { p_user: s.userId });
  if (error) console.error("agente_dominios_do_usuario", error.message);
  return acessosDoUsuario(DOMINIOS, new Set<string>(error ? [] : (data as string[] | null) ?? []));
}

// ---- autenticação --------------------------------------------------------------------------------------

type Sessao = { userId: string; tokenId: string };

const negar = (s: number, msg: string) =>
  resp({ error: s === 401 ? "invalid_token" : "insufficient_scope", error_description: msg }, s,
    s === 401 ? { "WWW-Authenticate": cabecalho401(BASE) } : {});

async function papelLiberado(svc: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await svc.from("user_roles").select("role").eq("user_id", userId);
  return (data || []).some((p: { role: string }) => PAPEIS_LIBERADOS.includes(p.role));
}

async function autenticar(svc: SupabaseClient, req: Request): Promise<Sessao | Response> {
  const tok = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  // Sem token: 401 com resource_metadata, que é o que faz o Claude.ai abrir o fluxo de login.
  if (!tok.startsWith("sgm_")) return negar(401, "token ausente ou inválido");
  const { data: t } = await svc.from("mcp_tokens").select("id,user_id,revogado_em,expira_em")
    .eq("token_hash", await sha256Hex(tok)).maybeSingle();
  if (!t || t.revogado_em) return negar(401, "token inválido ou revogado");
  if (t.expira_em && new Date(t.expira_em) <= new Date()) return negar(401, "token expirado");
  if (!(await papelLiberado(svc, t.user_id))) return negar(403, "usuário sem papel liberado para o MCP");
  await svc.from("mcp_tokens").update({ ultimo_uso_em: new Date().toISOString() }).eq("id", t.id);
  return { userId: t.user_id, tokenId: t.id };
}

// ---- OAuth 2.1 (T7) --------------------------------------------------------------------------------------

const oauthErro = (error: string, error_description: string, s = 400) =>
  resp({ error, error_description }, s, { "Cache-Control": "no-store" });

type Cliente = { client_id: string; nome: string; redirect_uris: string[] };

async function cliente(svc: SupabaseClient, id: string | null | undefined): Promise<Cliente | null> {
  if (!id) return null;
  const { data } = await svc.from("mcp_oauth_clientes").select("client_id,nome,redirect_uris").eq("client_id", id).maybeSingle();
  return data as Cliente | null;
}

async function registrar(svc: SupabaseClient, req: Request): Promise<Response> {
  const v = validarRegistro(await req.json().catch(() => null));
  if ("error" in v) return resp(v, 400);
  const client_id = novoSegredo("mcpc_", 16);
  const { error } = await svc.from("mcp_oauth_clientes").insert({ client_id, nome: v.client_name, redirect_uris: v.redirect_uris });
  if (error) return oauthErro("server_error", error.message, 500);
  return resp({
    client_id, client_id_issued_at: Math.floor(Date.now() / 1000), client_name: v.client_name, redirect_uris: v.redirect_uris,
    grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none",
  }, 201);
}

const voltar = (uri: string, params: Record<string, string | null | undefined>) =>
  new Response(null, { status: 302, headers: { ...cors, Location: comParametros(uri, params) } });

// GET /authorize: confere e manda o sócio para a tela do Sigma, onde ele já está logado e aprova.
async function autorizar(svc: SupabaseClient, url: URL): Promise<Response> {
  const p = Object.fromEntries(url.searchParams);
  const v = validarAutorizacao(p, await cliente(svc, p.client_id), BASE);
  if (ehErro(v)) {
    if (!v.redirecionar) return oauthErro(v.error, v.error_description);
    return voltar(p.redirect_uri, { error: v.error, error_description: v.error_description, state: p.state });
  }
  return new Response(null, { status: 302, headers: { ...cors, Location: `${APP}/conectar-claude?${url.searchParams.toString()}` } });
}

// GET /oauth/pedido: a tela pergunta "quem está pedindo?" antes de mostrar o botão.
async function pedido(svc: SupabaseClient, url: URL): Promise<Response> {
  const p = Object.fromEntries(url.searchParams);
  const c = await cliente(svc, p.client_id);
  const v = validarAutorizacao(p, c, BASE);
  if (ehErro(v)) return oauthErro(v.error, v.error_description);
  return resp({ cliente: c!.nome, destino: new URL(v.redirect_uri).host, escopo: v.scope });
}

// POST /oauth/aprovar: o sócio clicou. Vem com o JWT do Sigma e os mesmos parâmetros do /authorize.
async function aprovar(svc: SupabaseClient, req: Request): Promise<Response> {
  const jwt = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = await svc.auth.getUser(jwt);
  if (!u?.user) return oauthErro("login_required", "entre no Sigma de novo", 401);
  const corpo = await req.json().catch(() => ({})) as { params?: Record<string, string>; aprovar?: boolean };
  const p = corpo.params || {};
  const v = validarAutorizacao(p, await cliente(svc, p.client_id), BASE);
  if (ehErro(v)) {
    if (!v.redirecionar) return oauthErro(v.error, v.error_description);
    return resp({ redirect: comParametros(p.redirect_uri, { error: v.error, error_description: v.error_description, state: p.state }) });
  }
  if (!corpo.aprovar) return resp({ redirect: comParametros(v.redirect_uri, { error: "access_denied", state: v.state }) });
  if (!(await papelLiberado(svc, u.user.id))) return oauthErro("access_denied", "seu usuário não tem acesso ao Claude dos sócios", 403);
  const code = novoSegredo("sgc_");
  const { error } = await svc.from("mcp_oauth_codigos").insert({
    code_hash: await sha256Hex(code), client_id: v.client_id, user_id: u.user.id, redirect_uri: v.redirect_uri,
    code_challenge: v.code_challenge, scope: v.scope, expira_em: new Date(Date.now() + VIDA_CODIGO_S * 1000).toISOString(),
  });
  if (error) return oauthErro("server_error", error.message, 500);
  return resp({ redirect: comParametros(v.redirect_uri, { code, state: v.state, iss: BASE }) });
}

/** Grava (ou rotaciona, com tokenId) o par acesso + refresh de uma conexão e devolve o corpo do /token. */
async function emitir(svc: SupabaseClient, tokenId: string | null, base: Record<string, unknown>) {
  const acesso = novoSegredo("sgm_"), refresh = novoSegredo("sgr_");
  const linha = {
    ...base, token_hash: await sha256Hex(acesso), prefixo: acesso.slice(0, 12), refresh_hash: await sha256Hex(refresh),
    expira_em: new Date(Date.now() + VIDA_ACESSO_S * 1000).toISOString(),
    refresh_expira_em: new Date(Date.now() + VIDA_REFRESH_DIAS * 86400_000).toISOString(),
  };
  const { data, error } = tokenId
    ? await svc.from("mcp_tokens").update(linha).eq("id", tokenId).is("revogado_em", null).select("id").maybeSingle()
    : await svc.from("mcp_tokens").insert(linha).select("id").single();
  if (error || !data) throw new Error(error?.message || "conexão revogada");
  return { id: data.id as string, corpo: { access_token: acesso, token_type: "Bearer", expires_in: VIDA_ACESSO_S, refresh_token: refresh } };
}

async function token(svc: SupabaseClient, req: Request): Promise<Response> {
  const b = lerCorpoToken(req.headers.get("content-type"), await req.text());
  const ok = (corpo: unknown) => resp(corpo, 200, { "Cache-Control": "no-store", Pragma: "no-cache" });

  if (b.grant_type === "authorization_code") {
    const hash = await sha256Hex(b.code || "");
    const { data: c } = await svc.from("mcp_oauth_codigos").select("*").eq("code_hash", hash).maybeSingle();
    if (!c || c.client_id !== b.client_id || c.redirect_uri !== b.redirect_uri) return oauthErro("invalid_grant", "código inválido");
    if (c.usado_em) {
      // Código repetido: alguém o interceptou (RFC 6749 §4.1.2). Derruba a conexão criada com ele.
      if (c.token_id) await svc.from("mcp_tokens").update({ revogado_em: new Date().toISOString() }).eq("id", c.token_id);
      return oauthErro("invalid_grant", "código já usado");
    }
    if (new Date(c.expira_em) <= new Date()) return oauthErro("invalid_grant", "código vencido");
    if (!(await pkceConfere(b.code_verifier || "", c.code_challenge))) return oauthErro("invalid_grant", "code_verifier não confere");
    // Marca o uso antes de emitir: duas trocas ao mesmo tempo, só uma passa.
    const { data: marcado } = await svc.from("mcp_oauth_codigos").update({ usado_em: new Date().toISOString() })
      .eq("code_hash", hash).is("usado_em", null).select("code_hash").maybeSingle();
    if (!marcado) return oauthErro("invalid_grant", "código já usado");
    if (!(await papelLiberado(svc, c.user_id))) return oauthErro("invalid_grant", "usuário sem papel liberado");
    const cli = await cliente(svc, c.client_id);
    const e = await emitir(svc, null, { user_id: c.user_id, nome: cli?.nome || "Claude", origem: "oauth", client_id: c.client_id });
    await svc.from("mcp_oauth_codigos").update({ token_id: e.id }).eq("code_hash", hash);
    await svc.from("mcp_oauth_clientes").update({ ultimo_uso_em: new Date().toISOString() }).eq("client_id", c.client_id);
    return ok({ ...e.corpo, scope: c.scope });
  }

  if (b.grant_type === "refresh_token") {
    const { data: t } = await svc.from("mcp_tokens").select("id,user_id,client_id,revogado_em,refresh_expira_em")
      .eq("refresh_hash", await sha256Hex(b.refresh_token || "")).maybeSingle();
    if (!t || t.revogado_em || (b.client_id && b.client_id !== t.client_id)) return oauthErro("invalid_grant", "refresh inválido ou revogado");
    if (!t.refresh_expira_em || new Date(t.refresh_expira_em) <= new Date()) return oauthErro("invalid_grant", "refresh vencido: conecte de novo");
    if (!(await papelLiberado(svc, t.user_id))) return oauthErro("invalid_grant", "usuário sem papel liberado");
    // Rotaciona: o refresh antigo deixa de valer na hora.
    try {
      return ok((await emitir(svc, t.id, {})).corpo);
    } catch {
      return oauthErro("invalid_grant", "conexão revogada");
    }
  }

  return oauthErro("unsupported_grant_type", "use authorization_code ou refresh_token");
}

// POST /revoke (RFC 7009): sempre 200, mesmo se o token não existir.
async function revogar(svc: SupabaseClient, req: Request): Promise<Response> {
  const b = lerCorpoToken(req.headers.get("content-type"), await req.text());
  const h = await sha256Hex(b.token || "");
  await svc.from("mcp_tokens").update({ revogado_em: new Date().toISOString() })
    .or(`token_hash.eq.${h},refresh_hash.eq.${h}`).is("revogado_em", null);
  return new Response(null, { status: 200, headers: cors });
}

// ---- JSON-RPC ------------------------------------------------------------------------------------------

type Msg = { jsonrpc: "2.0"; id?: string | number | null; method?: string; params?: Record<string, unknown> };

async function tratar(svc: SupabaseClient, s: Sessao, m: Msg): Promise<unknown | null> {
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id: m.id, result });
  const falha = (code: number, message: string) => ({ jsonrpc: "2.0", id: m.id ?? null, error: { code, message } });
  if (m.id === undefined || m.id === null) return null; // notificação (ex.: notifications/initialized): sem resposta

  const ac = await acessos(svc, s);
  const exp = exposto(ac);
  // Auditoria (§3f): toda leitura de guia ou dado fica em mcp_chamadas com a versão do protocolo.
  const auditar = (linha: Record<string, unknown>) =>
    svc.from("mcp_chamadas").insert({ user_id: s.userId, token_id: s.tokenId, protocolo_versao: PROTOCOLO_VERSAO, ...linha });

  switch (m.method) {
    case "initialize": {
      const pedida = String(m.params?.protocolVersion || "");
      return ok({
        protocolVersion: VERSOES.includes(pedida) ? pedida : VERSOES[0],
        capabilities: { tools: { listChanged: false }, prompts: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: { name: "sigma-gss", title: "Sigma GSS", version: PROTOCOLO_VERSAO },
        // O guia mínimo que todo cliente lê sem pedir; o detalhe de cada domínio vem do sigma_guia.
        instructions: constituicao(ac),
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({
        tools: exp.ferramentas.map((f) => ({
          name: f.nome, title: f.titulo, description: f.descricao, inputSchema: f.inputSchema,
          annotations: { readOnlyHint: true, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const nome = String(m.params?.name || "");
      const args = (m.params?.arguments || {}) as Record<string, unknown>;
      const t0 = Date.now();
      const bloq = dominioBloqueado(ac, nome);
      const registrar = (extra: Record<string, unknown>) =>
        auditar({ metodo: "tools/call", ferramenta: nome, argumentos: args, duracao_ms: Date.now() - t0,
          dominio: exp.dominioDe.get(nome) ?? bloq?.id ?? null, ...extra });
      try {
        const f = exp.ferramentas.find((x) => x.nome === nome);
        if (!f) {
          throw new ErroFerramenta(bloq ? `seu usuário não tem acesso a ${bloq.titulo}; peça ao administrador do Sigma` : `ferramenta desconhecida: ${nome}`);
        }
        const r = await f.executar({ svc, userId: s.userId, agora: new Date() }, args);
        const hash = await hashResultado(nome, r.dados);
        // sigma_guia grava o domínio pedido (mostra o que as pessoas procuram, inclusive o "em breve").
        const dominioGuia = nome === "sigma_guia" ? String(args.dominio ?? "").trim().toLowerCase() || null : null;
        await registrar({ ok: true, resultado_hash: hash, fonte_atualizada_em: r.fonte.atualizado_em,
          ...(dominioGuia ? { dominio: dominioGuia } : {}) });
        // structuredContent pequeno de propósito: há cliente que mostra só ele ao modelo, então leva o resumo e os
        // totais; a lista completa vai no texto. O hash prova que dois sócios receberam o mesmo fato.
        return ok({
          content: [{ type: "text", text: renderizar(r) }],
          structuredContent: {
            resumo: r.resumo, totais: r.totais ?? {}, fonte: r.fonte, cortado: r.cortado ?? null,
            protocolo: PROTOCOLO_VERSAO, dominio: exp.dominioDe.get(nome), hash,
          },
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
        await registrar({ ok: false, erro: msg });
        // Erro de ferramenta volta como resultado com isError, para o Claude ler e corrigir o argumento.
        return ok({ content: [{ type: "text", text: `Erro: ${msg}` }], isError: true });
      }
    }
    case "prompts/list":
      return ok({ prompts: exp.prompts.map((p) => ({ name: p.nome, title: p.titulo, description: p.descricao, arguments: p.argumentos ?? [] })) });
    case "prompts/get": {
      const p = exp.prompts.find((x) => x.nome === String(m.params?.name || ""));
      if (!p) return falha(-32602, `prompt desconhecido: ${m.params?.name}`);
      const args = (m.params?.arguments || {}) as Record<string, string>;
      const falta = (p.argumentos ?? []).filter((x) => x.required && !String(args[x.name] ?? "").trim()).map((x) => x.name);
      if (falta.length) return falha(-32602, `faltam argumentos: ${falta.join(", ")}`);
      await auditar({ metodo: "prompts/get", ferramenta: p.nome, argumentos: args, dominio: p.nome.split("_")[0] });
      return ok({ description: p.descricao, messages: [{ role: "user", content: { type: "text", text: p.texto(args) } }] });
    }
    case "resources/list":
      return ok({
        resources: ac.filter((a) => a.liberado || a.dominio.status === "em_breve").map((a) => ({
          uri: `sigma://guia/${a.dominio.id}`, name: `guia-${a.dominio.id}`, title: `Guia: ${a.dominio.titulo}`,
          description: a.dominio.resumo, mimeType: "text/markdown",
        })),
      });
    case "resources/templates/list":
      return ok({ resourceTemplates: [] });
    case "resources/read": {
      const uri = String(m.params?.uri || "");
      const a = ac.find((x) => `sigma://guia/${x.dominio.id}` === uri && (x.liberado || x.dominio.status === "em_breve"));
      if (!a) return falha(-32002, `recurso não encontrado: ${uri}`);
      await auditar({ metodo: "resources/read", ferramenta: uri, dominio: a.dominio.id });
      return ok({ contents: [{ uri, mimeType: "text/markdown", text: guiaTexto(a.dominio) }] });
    }
    default:
      return falha(-32601, `método não suportado: ${m.method}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const url = new URL(req.url);
  const r = rota(url.pathname);
  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Metadados: o Claude acha o do recurso pelo WWW-Authenticate do 401 e o do servidor pelo issuer + caminho.
  if (req.method === "GET" && r.startsWith("/.well-known/oauth-protected-resource")) return resp(metadadosRecurso(BASE));
  if (req.method === "GET" && (r.startsWith("/.well-known/oauth-authorization-server") || r.startsWith("/.well-known/openid-configuration"))) {
    return resp(metadadosServidor(BASE));
  }
  if (req.method === "POST" && r === "/register") return registrar(svc, req);
  if (req.method === "GET" && r === "/authorize") return autorizar(svc, url);
  if (req.method === "GET" && r === "/oauth/pedido") return pedido(svc, url);
  if (req.method === "POST" && r === "/oauth/aprovar") return aprovar(svc, req);
  if (req.method === "POST" && r === "/token") return token(svc, req);
  if (req.method === "POST" && r === "/revoke") return revogar(svc, req);
  if (r !== "/") return resp({ error: "not_found" }, 404);

  // Sem stream SSE do servidor: GET responde 405, como a especificação permite.
  if (req.method !== "POST") return resp({ error: "use POST" }, 405, { Allow: "POST" });

  const sessao = await autenticar(svc, req);
  if (sessao instanceof Response) return sessao;

  let corpo: Msg | Msg[];
  try {
    corpo = await req.json();
  } catch {
    return resp({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON inválido" } }, 400);
  }
  if (Array.isArray(corpo)) {
    const rs = (await Promise.all(corpo.map((m) => tratar(svc, sessao, m)))).filter((x) => x !== null);
    return rs.length ? resp(rs) : new Response(null, { status: 202, headers: cors });
  }
  const res = await tratar(svc, sessao, corpo);
  return res === null ? new Response(null, { status: 202, headers: cors }) : resp(res);
});
