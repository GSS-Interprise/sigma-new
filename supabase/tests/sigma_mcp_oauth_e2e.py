"""Teste ponta a ponta do OAuth do sigma-mcp (T7 de docs/arquitetura/claude-socios-gss.md), contra a edge no ar.

A aprovação na tela /conectar-claude é simulada gravando o código no banco (é o que /oauth/aprovar grava), para
não precisar de senha. Usa como dono da conexão o usuário de um token MCP manual existente (MCP_TESTE_PREFIXO).
No fim apaga o cliente de teste, os códigos, as conexões e as chamadas criadas.

Rodar na raiz do repo: python supabase/tests/sigma_mcp_oauth_e2e.py   (precisa de SUPABASE_ACCESS_TOKEN no .env.local)
"""
import base64, hashlib, json, os, secrets, sys, urllib.error, urllib.parse, urllib.request
sys.stdout.reconfigure(encoding="utf-8")
RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
env = dict(l.strip().split("=", 1) for l in open(os.path.join(RAIZ, ".env.local"), encoding="utf-8") if "=" in l and not l.startswith("#"))
TOK = env["SUPABASE_ACCESS_TOKEN"].strip('"')
B = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sigma-mcp"
CB = "https://claude.ai/api/mcp/auth_callback"
falhas = []


def sql(q):
    r = urllib.request.Request("https://api.supabase.com/v1/projects/zupsbgtoeoixfokzkjro/database/query",
                               data=json.dumps({"query": q}).encode(), method="POST",
                               headers={"Authorization": "Bearer " + TOK, "Content-Type": "application/json; charset=utf-8", "User-Agent": "cli"})
    return json.loads(urllib.request.urlopen(r, timeout=60).read())


class SemRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


op = urllib.request.build_opener(SemRedirect)


def http(metodo, caminho, corpo=None, headers=None, form=False):
    h = dict(headers or {})
    dados = None
    if corpo is not None:
        if form:
            dados = urllib.parse.urlencode(corpo).encode(); h["Content-Type"] = "application/x-www-form-urlencoded"
        else:
            dados = json.dumps(corpo).encode(); h["Content-Type"] = "application/json"
    req = urllib.request.Request(B + caminho, data=dados, headers=h, method=metodo)
    try:
        r = op.open(req, timeout=60); st, hd, tx = r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        st, hd, tx = e.code, e.headers, e.read()
    try:
        j = json.loads(tx) if tx else None
    except Exception:
        j = tx.decode(errors="replace")
    return st, hd, j


def confere(nome, cond, extra=""):
    print(("OK   " if cond else "FALHA") + " " + nome + (f"  [{extra}]" if extra and not cond else ""))
    if not cond:
        falhas.append(nome)


def mcp(access):
    return http("POST", "", {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, {"Authorization": "Bearer " + access, "Accept": "application/json, text/event-stream"})


st, hd, j = http("POST", "", {"jsonrpc": "2.0", "id": 1, "method": "ping"})
confere("sem token: 401 com resource_metadata", st == 401 and "resource_metadata=" in (hd.get("WWW-Authenticate") or ""), f"{st} {hd.get('WWW-Authenticate')}")
st, _, j = http("GET", "/.well-known/oauth-protected-resource")
confere("metadados do recurso", st == 200 and j["authorization_servers"] == [B], j)
for c in ("/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"):
    st, _, j = http("GET", c)
    confere("metadados do servidor " + c, st == 200 and j["token_endpoint"] == B + "/token", j)

st, _, j = http("POST", "/register", {"client_name": "TESTE AUTOMATICO", "redirect_uris": ["https://evil.com/cb"]})
confere("registro com redirect de fora: 400", st == 400 and j["error"] == "invalid_redirect_uri", j)
st, _, j = http("POST", "/register", {"client_name": "TESTE AUTOMATICO", "redirect_uris": [CB], "token_endpoint_auth_method": "none"})
confere("registro do Claude: 201", st == 201 and j["client_id"].startswith("mcpc_"), j)
cid = j["client_id"]

verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
desafio = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
q = {"response_type": "code", "client_id": cid, "redirect_uri": CB, "code_challenge": desafio, "code_challenge_method": "S256", "state": "xyz", "resource": B}
st, hd, j = http("GET", "/authorize?" + urllib.parse.urlencode(q))
confere("authorize manda para a tela do Sigma", st == 302 and "/conectar-claude?" in hd.get("Location", ""), f"{st} {hd.get('Location')} {j}")
st, hd, j = http("GET", "/authorize?" + urllib.parse.urlencode({**q, "redirect_uri": "https://claude.ai/outro"}))
confere("authorize com redirect trocado: 400 sem redirecionar", st == 400, f"{st} {hd.get('Location')}")
st, hd, j = http("GET", "/authorize?" + urllib.parse.urlencode({**q, "code_challenge_method": "plain"}))
confere("authorize sem S256 volta erro ao Claude", st == 302 and "error=invalid_request" in hd.get("Location", ""), f"{st} {hd.get('Location')}")
st, _, j = http("GET", "/oauth/pedido?" + urllib.parse.urlencode(q))
confere("tela sabe quem pede", st == 200 and j["cliente"] == "TESTE AUTOMATICO" and j["destino"] == "claude.ai", j)
st, _, j = http("POST", "/oauth/aprovar", {"params": q, "aprovar": True})
confere("aprovar sem login no Sigma: 401", st == 401, j)

# Dono da conexão de teste: o usuário de um token manual ativo (padrão: o token de teste do Raul, 13/11).
PREFIXO = os.environ.get("MCP_TESTE_PREFIXO", "sgm_f3d325ad")
uid = sql(f"select user_id from mcp_tokens where prefixo like '{PREFIXO}%' and origem = 'manual' limit 1")[0]["user_id"]


def codigo():
    c = "sgc_" + secrets.token_hex(24)
    h = hashlib.sha256(c.encode()).hexdigest()
    sql(f"insert into mcp_oauth_codigos (code_hash, client_id, user_id, redirect_uri, code_challenge, scope, expira_em) "
        f"values ('{h}', '{cid}', '{uid}', '{CB}', '{desafio}', 'sigma:ler', now() + interval '10 minutes')")
    return c


try:
    c1 = codigo()
    st, _, j = http("POST", "/token", {"grant_type": "authorization_code", "code": c1, "redirect_uri": CB, "client_id": cid, "code_verifier": "x" * 43}, form=True)
    confere("token com verifier errado: invalid_grant", st == 400 and j["error"] == "invalid_grant", j)
    st, hd, j = http("POST", "/token", {"grant_type": "authorization_code", "code": c1, "redirect_uri": CB, "client_id": cid, "code_verifier": verifier}, form=True)
    confere("troca do código por token", st == 200 and j["access_token"].startswith("sgm_") and j["refresh_token"].startswith("sgr_") and j["expires_in"] == 3600, j)
    confere("resposta do token sem cache", (hd.get("Cache-Control") or "") == "no-store")
    acesso, refresh = j["access_token"], j["refresh_token"]
    st, _, j = mcp(acesso)
    confere("MCP aceita o token OAuth", st == 200 and len(j["result"]["tools"]) == 4, j)
    st, _, j = http("POST", "/token", {"grant_type": "refresh_token", "refresh_token": refresh, "client_id": cid}, form=True)
    confere("refresh devolve par novo", st == 200 and j["refresh_token"] != refresh, j)
    acesso2, refresh2 = j["access_token"], j["refresh_token"]
    confere("acesso antigo cai depois do refresh", mcp(acesso)[0] == 401)
    st, _, j = http("POST", "/token", {"grant_type": "refresh_token", "refresh_token": refresh}, form=True)
    confere("refresh antigo não vale mais", st == 400 and j["error"] == "invalid_grant", j)
    confere("acesso novo vale", mcp(acesso2)[0] == 200)
    st, _, j = http("POST", "", {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "plantoes_descobertos", "arguments": {}}},
                    {"Authorization": "Bearer " + acesso2})
    confere("ferramenta responde pelo OAuth", st == 200 and "descoberto" in j["result"]["content"][0]["text"], j)
    sql(f"update mcp_tokens set expira_em = now() - interval '1 second' where client_id = '{cid}'")
    confere("acesso vencido: 401", mcp(acesso2)[0] == 401)
    st, _, j = http("POST", "/token", {"grant_type": "refresh_token", "refresh_token": refresh2}, form=True)
    confere("refresh renova acesso vencido", st == 200, j)
    acesso3 = j["access_token"]
    st, _, _ = http("POST", "/revoke", {"token": j["refresh_token"]}, form=True)
    confere("revoke responde 200", st == 200)
    confere("depois do revoke o acesso cai", mcp(acesso3)[0] == 401)

    c2 = codigo()
    st, _, j = http("POST", "/token", {"grant_type": "authorization_code", "code": c2, "redirect_uri": CB, "client_id": cid, "code_verifier": verifier}, form=True)
    acesso4 = j["access_token"]
    st, _, j = http("POST", "/token", {"grant_type": "authorization_code", "code": c2, "redirect_uri": CB, "client_id": cid, "code_verifier": verifier}, form=True)
    confere("código repetido: recusado", st == 400 and j["error"] == "invalid_grant", j)
    confere("código repetido derruba a conexão criada com ele", mcp(acesso4)[0] == 401)
    r = sql(f"select count(*) as n from mcp_chamadas c join mcp_tokens t on t.id = c.token_id where t.client_id = '{cid}'")
    confere("chamadas pelo OAuth auditadas", r[0]["n"] >= 1, r)
finally:
    sql(f"delete from mcp_chamadas where token_id in (select id from mcp_tokens where client_id = '{cid}'); "
        f"delete from mcp_tokens where client_id = '{cid}'; delete from mcp_oauth_clientes where client_id = '{cid}';")

print("\n" + ("TUDO OK" if not falhas else f"{len(falhas)} FALHA(S): {falhas}"))
