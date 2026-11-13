import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  cabecalho401, comParametros, desafioS256, ehErro, ESCOPO, lerCorpoToken, metadadosRecurso, metadadosServidor,
  novoSegredo, pkceConfere, redirectPermitido, rota, validarAutorizacao, validarRegistro,
} from "./mcp-oauth.ts";

const BASE = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sigma-mcp";
const CB = "https://claude.ai/api/mcp/auth_callback";

Deno.test("redirect só para o Claude (web e localhost)", () => {
  assert(redirectPermitido(CB));
  assert(redirectPermitido("https://claude.com/api/mcp/auth_callback"));
  assert(redirectPermitido("http://localhost:53682/callback"));
  assert(redirectPermitido("http://127.0.0.1:8080/cb"));
  assert(!redirectPermitido("http://claude.ai/api/mcp/auth_callback")); // sem https
  assert(!redirectPermitido("https://claude.ai.golpe.com/cb"));
  assert(!redirectPermitido("https://evil.com/?x=https://claude.ai"));
  assert(!redirectPermitido("https://user:pw@claude.ai/cb"));
  assert(!redirectPermitido("https://claude.ai/cb#frag"));
  assert(!redirectPermitido("nao é url"));
});

Deno.test("rota ignora o prefixo do gateway", () => {
  assertEquals(rota("/functions/v1/sigma-mcp"), "/");
  assertEquals(rota("/sigma-mcp/"), "/");
  assertEquals(rota("/sigma-mcp/mcp"), "/");
  assertEquals(rota("/functions/v1/sigma-mcp/token"), "/token");
  assertEquals(rota("/sigma-mcp/.well-known/oauth-protected-resource"), "/.well-known/oauth-protected-resource");
});

Deno.test("metadados apontam tudo para a própria edge", () => {
  const r = metadadosRecurso(BASE);
  assertEquals(r.resource, BASE);
  assertEquals(r.authorization_servers, [BASE]);
  const s = metadadosServidor(BASE);
  assertEquals(s.issuer, BASE);
  assertEquals(s.token_endpoint, `${BASE}/token`);
  assertEquals(s.code_challenge_methods_supported, ["S256"]);
  assert(cabecalho401(BASE).includes(`resource_metadata="${BASE}/.well-known/oauth-protected-resource"`));
});

Deno.test("registro dinâmico: cliente público com redirect do Claude", () => {
  assertEquals(validarRegistro({ client_name: "Claude", redirect_uris: [CB, CB], grant_types: ["authorization_code", "refresh_token"], token_endpoint_auth_method: "none" }),
    { client_name: "Claude", redirect_uris: [CB] });
  assertEquals(validarRegistro({ redirect_uris: ["http://localhost:3000/cb"] }), { client_name: "Claude", redirect_uris: ["http://localhost:3000/cb"] });
  assertEquals((validarRegistro({}) as { error: string }).error, "invalid_redirect_uri");
  assertEquals((validarRegistro({ redirect_uris: ["https://evil.com/cb"] }) as { error: string }).error, "invalid_redirect_uri");
  assertEquals((validarRegistro({ redirect_uris: [CB], token_endpoint_auth_method: "client_secret_basic" }) as { error: string }).error, "invalid_client_metadata");
  assertEquals((validarRegistro({ redirect_uris: [CB], grant_types: ["client_credentials"] }) as { error: string }).error, "invalid_client_metadata");
});

const DESAFIO = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"; // RFC 7636, apêndice B
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";

Deno.test("PKCE S256 com o exemplo do RFC 7636", async () => {
  assertEquals(await desafioS256(VERIFIER), DESAFIO);
  assert(await pkceConfere(VERIFIER, DESAFIO));
  assert(!(await pkceConfere(VERIFIER + "x", DESAFIO)));
  assert(!(await pkceConfere("curto", DESAFIO)));
});

const pedido = (x: Record<string, string | null> = {}) => ({
  client_id: "mcpc_1", redirect_uri: CB, response_type: "code", code_challenge: DESAFIO, code_challenge_method: "S256",
  state: "abc", scope: null, resource: null, ...x,
});

Deno.test("autorização válida devolve o pedido normalizado", () => {
  const r = validarAutorizacao(pedido({ resource: BASE + "/", scope: ESCOPO }), { redirect_uris: [CB] }, BASE);
  assert(!ehErro(r));
  assertEquals(r, { client_id: "mcpc_1", redirect_uri: CB, state: "abc", code_challenge: DESAFIO, scope: ESCOPO });
});

Deno.test("erro de cliente ou redirect não volta para o redirect", () => {
  const semCliente = validarAutorizacao(pedido(), null, BASE);
  assert(ehErro(semCliente) && !semCliente.redirecionar);
  const outroRedirect = validarAutorizacao(pedido({ redirect_uri: "https://claude.ai/outro" }), { redirect_uris: [CB] }, BASE);
  assert(ehErro(outroRedirect) && !outroRedirect.redirecionar);
});

Deno.test("demais erros voltam para o Claude com o código certo", () => {
  const casos: [Record<string, string | null>, string][] = [
    [{ response_type: "token" }, "unsupported_response_type"],
    [{ code_challenge_method: "plain" }, "invalid_request"],
    [{ code_challenge: "curto" }, "invalid_request"],
    [{ resource: "https://outro.com/mcp" }, "invalid_target"],
    [{ scope: "admin" }, "invalid_scope"],
  ];
  for (const [x, codigo] of casos) {
    const r = validarAutorizacao(pedido(x), { redirect_uris: [CB] }, BASE);
    assert(ehErro(r) && r.redirecionar, JSON.stringify(x));
    assertEquals(r.error, codigo);
  }
});

Deno.test("parâmetros somam no redirect sem perder a query dele", () => {
  assertEquals(comParametros("http://localhost:3000/cb?x=1", { code: "c", state: null }), "http://localhost:3000/cb?x=1&code=c");
});

Deno.test("segredos com prefixo e aleatórios", () => {
  const a = novoSegredo("sgm_"), b = novoSegredo("sgm_");
  assert(a.startsWith("sgm_") && a.length === 52);
  assert(a !== b);
});

Deno.test("corpo do /token em form ou JSON", () => {
  assertEquals(lerCorpoToken("application/x-www-form-urlencoded", "grant_type=authorization_code&code=sgc_1"), { grant_type: "authorization_code", code: "sgc_1" });
  assertEquals(lerCorpoToken("application/json", '{"grant_type":"refresh_token","refresh_token":"sgr_1"}'), { grant_type: "refresh_token", refresh_token: "sgr_1" });
  assertEquals(lerCorpoToken("application/json", "{quebrado"), {});
});
