"""Rotina drescala_escalas: traz do Dr. Escala os hospitais, setores e plantões de um período para o Sigma.

Arquitetura: docs/arquitetura/claude-socios-gss.md (§3a). Mapeado em 13/11/2026:
  - App web da GSS em https://gss.drescala.com.br (Angular). API interna em https://api-gateway.drescala.com/api.
  - Login: POST /auth/login {"email","senha"} -> {"token": JWT}. Sem captcha e sem cifra no navegador, por isso
    aqui não há Playwright (diferente do Life's Hub). O JWT vale 4 h e traz o tenant ("subdomain": "gss").
  - GET /locais/findAllListagem -> locais com a lista de setores; GET /locais/habilitados -> cidade/UF.
  - GET /plantoes/mensal-setor?setor_id=<id>&mes=AAAA-MM -> grade do mês (semanas x dias) com os plantões do setor,
    incluindo furo, situação, tipo e o nome do profissional. É a mesma chamada da tela "escala mensal".
    /plantoes/busca e /plantoes/relatorio responderam vazio com a conta da diretoria; não usar.
  - A API devolve 429 se apertar: chamadas em série, com pausa curta e nova tentativa com espera crescente.

O que NÃO vai para o Sigma: valores do plantão (valor_estimado, valor_real...). Escala não precisa de dinheiro.

Credenciais em /opt/sigma-rotinas/.env: DRESCALA_EMAIL e DRESCALA_SENHA (nunca no repositório).
"""
import json
import os
import time
import urllib.error
import urllib.request
from datetime import date, timedelta

API = "https://api-gateway.drescala.com/api"
ORIGEM = "https://gss.drescala.com.br"
PAUSA = 0.35       # segundos entre chamadas (abaixo disso a API começa a devolver 429)
LOTE = 500         # plantões por envio ao Sigma


class DrEscala:
    def __init__(self):
        email, senha = os.environ.get("DRESCALA_EMAIL", ""), os.environ.get("DRESCALA_SENHA", "")
        if not email or not senha:
            raise RuntimeError("faltam DRESCALA_EMAIL e DRESCALA_SENHA no .env da VPS")
        r = self._req("POST", "/auth/login", {"email": email, "senha": senha}, token=None)
        if not r.get("token"):
            raise RuntimeError("login no Dr. Escala não devolveu token")
        self.token = r["token"]
        self.chamadas = 0

    def _req(self, metodo, caminho, corpo=None, token="__self__"):
        tok = self.token if token == "__self__" else token
        headers = {"Accept": "application/json", "Origin": ORIGEM, "Referer": ORIGEM + "/"}
        if tok:
            headers["Authorization"] = "Bearer " + tok
        dados = None
        if corpo is not None:
            dados = json.dumps(corpo).encode("utf-8")
            headers["Content-Type"] = "application/json"
        espera = 10
        for tentativa in range(5):
            req = urllib.request.Request(API + caminho, data=dados, headers=headers, method=metodo)
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 429 and tentativa < 4:
                    time.sleep(espera)
                    espera *= 2
                    continue
                if e.code in (401, 403) and caminho == "/auth/login":
                    raise RuntimeError("login no Dr. Escala recusado: senha mudou ou a conta foi bloqueada") from None
                raise RuntimeError(f"{caminho} respondeu {e.code}: {e.read()[:200]!r}") from None
        raise RuntimeError(f"{caminho}: limite de chamadas (429) não liberou")

    def get(self, caminho):
        time.sleep(PAUSA)
        self.chamadas += 1
        return self._req("GET", caminho)


def _meses(inicio, fim):
    m, out = date(inicio.year, inicio.month, 1), []
    while m <= fim:
        out.append(m.strftime("%Y-%m"))
        m = date(m.year + (m.month == 12), m.month % 12 + 1, 1)
    return out


def _texto(v):
    v = (v or "").strip() if isinstance(v, str) else v
    return v or None


def _plantao(p):
    """Plantão da grade mensal -> linha de drescala_plantoes (formato de drescala_gravar_lote)."""
    if "inicio_plantao" not in p or "id" not in p:
        raise RuntimeError(f"formato de /plantoes/mensal-setor mudou: chaves {sorted(p)[:20]}")
    # Furo no Dr. Escala = plantão sem médico: vem com furo=true, profissional 0 e nome "Sem Profissional Alocado".
    # Conferido em 13/11/2026; o profissional 0 também conta, caso a flag venha falsa.
    furo = bool(p.get("furo")) or (p.get("profissional_real") or p.get("profissional_alocado") or 0) == 0
    nome = _texto((p.get("profissionalGlobal") or {}).get("nome")) or _texto(
        ((p.get("profissional") or {}).get("profissionalGlobal") or {}).get("nome"))
    return {
        "id": p["id"],
        "local_id": p.get("local_id"),
        "setor_id": p.get("setor_id"),
        "inicio": p["inicio_plantao"],
        "fim": p.get("fim_plantao"),
        "profissional_id": None if furo else (p.get("profissional_real") or p.get("profissional_alocado")),
        "profissional_nome": None if furo else nome,
        "profissional_crm": None,  # a grade não traz CRM
        "situacao": _texto((p.get("situacao") or {}).get("situacao")),
        "tipo": _texto((p.get("tipo_do_plantao") or {}).get("tipo")),
        "furo": furo,
        "anunciado": bool(p.get("plantao_anunciado")),
        # Só o que ajuda a entender a escala; sem valores.
        "raw": {k: p.get(k) for k in ("situacao_id", "tipo_plantao", "duracao", "confirmado", "troca_liberada",
                                      "hora_extra", "assalariado", "profissao_profissional", "dateKey")},
    }


def sincronizar(payload, enviar):
    """payload: {inicio?: "AAAA-MM-DD" (padrão: hoje-7), dias?: 38, local_ids?: [ids]}.

    Cada setor custa uma chamada por mês do período. A fila devolve o pedido parado há mais de 10 min
    (rotina_pegar), então o padrão é curto (hoje-7 a hoje+30, ~2 meses, ~3 min) e o máximo é 62 dias.

    enviar(action, corpo) fala com a edge rotinas-fila (drescala_abrir / drescala_gravar / drescala_fechar).
    Devolve um resumo para o resultado do pedido.
    """
    hoje = date.today()
    inicio = date.fromisoformat(payload["inicio"]) if payload.get("inicio") else hoje - timedelta(days=7)
    dias = max(1, min(int(payload.get("dias") or 38), 62))
    fim = inicio + timedelta(days=dias - 1)
    so_locais = {int(x) for x in (payload.get("local_ids") or [])}

    t0 = time.time()
    de = DrEscala()
    locais = de.get("/locais/findAllListagem")
    if not isinstance(locais, list) or (locais and "setores" not in locais[0]):
        raise RuntimeError("formato de /locais/findAllListagem mudou")
    extra = {l["id"]: l for l in (de.get("/locais/habilitados") or []) if isinstance(l, dict) and "id" in l}
    if so_locais:
        locais = [l for l in locais if l["id"] in so_locais]

    linhas_locais, linhas_setores = [], []
    for l in locais:
        e = extra.get(l["id"], {})
        linhas_locais.append({"id": l["id"], "nome": (l.get("nome") or "").strip(), "cidade": _texto(e.get("cidade")),
                              "uf": _texto(e.get("uf")), "habilitado": bool(l.get("habilitado", True)) and not l.get("arquivado"),
                              "raw": {"nome_abreviado": _texto(l.get("nome_abreviado"))}})
        for s in l.get("setores") or []:
            if s.get("habilitado") is False or s.get("arquivado_em") or l.get("arquivado"):
                continue  # setor desativado não tem escala nova; poupa chamadas
            linhas_setores.append({"id": s["id"], "local_id": l["id"], "nome": (s.get("nome_setor") or "").strip(),
                                   "raw": {"habilitado": s.get("habilitado"), "arquivado_em": s.get("arquivado_em")}})

    sync = enviar("drescala_abrir", {"inicio": inicio.isoformat(), "fim": fim.isoformat(), "local_ids": sorted(so_locais)})
    sync_id = sync["sync_id"]
    try:
        enviar("drescala_gravar", {"sync_id": sync_id, "locais": linhas_locais, "setores": linhas_setores, "plantoes": []})
        vistos, buffer, furos = set(), [], 0
        ini_s, fim_s = inicio.isoformat(), fim.isoformat()
        for s in linhas_setores:
            for mes in _meses(inicio, fim):
                grade = de.get(f"/plantoes/mensal-setor?setor_id={s['id']}&mes={mes}")
                if not isinstance(grade, list):
                    raise RuntimeError(f"formato de /plantoes/mensal-setor mudou (setor {s['id']})")
                for semana in grade:
                    for dia in semana:
                        for p in dia.get("plantoes") or []:
                            # A grade repete dias do mês vizinho; o filtro por dateKey + id evita duplicar.
                            chave = p.get("dateKey") or (p.get("inicio_plantao") or "")[:10]
                            if p.get("id") in vistos or not (ini_s <= chave <= fim_s):
                                continue
                            vistos.add(p["id"])
                            linha = _plantao(p)
                            furos += linha["furo"]
                            buffer.append(linha)
                if len(buffer) >= LOTE:
                    enviar("drescala_gravar", {"sync_id": sync_id, "plantoes": buffer})
                    buffer = []
        if buffer:
            enviar("drescala_gravar", {"sync_id": sync_id, "plantoes": buffer})
        fechado = enviar("drescala_fechar", {"sync_id": sync_id, "ok": True})
    except Exception as e:
        try:
            enviar("drescala_fechar", {"sync_id": sync_id, "ok": False, "erro": f"{type(e).__name__}: {e}"})
        finally:
            raise

    return {"sync_id": sync_id, "inicio": ini_s, "fim": fim_s, "locais": len(linhas_locais),
            "setores": len(linhas_setores), "plantoes": len(vistos), "furos": furos,
            "removidos": fechado.get("removidos"), "chamadas_drescala": de.chamadas,
            "segundos": round(time.time() - t0, 1)}
