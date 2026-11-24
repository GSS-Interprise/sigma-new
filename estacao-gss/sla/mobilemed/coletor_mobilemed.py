# Coletor do SLA de laudos do Mobilemed (laudos.mobilemed.com.br, web). Roda a cada 3 min no PC da baia do Wagner
# (usuario heron), no mesmo Chrome do robo do Tijucas (perfil SigmaSLA\chrome-tijucas, depuracao so em 127.0.0.1:9333).
#
# Nao usa OCR nem mouse: le a lista pela mesma API que a tela usa (POST gateway-sa.../portal-api/exame/lista), de
# dentro da aba logada pela Brenda, com o token OIDC que a propria pagina guarda no localStorage.
# O access_token do Mobilemed vence em poucos minutos e a pagina parada NAO renova sozinha (visto em 24/11): quando
# falta menos de 90 s, o coletor recarrega a aba e a pagina troca o token pelo refresh_token (sem senha).
# Fila = exames nao liberados da lista padrao da Brenda (tipo_listagem 1). Cada exame ja vem com o prazo que o
# Mobilemed calcula (sla_expiration_date -> "vence"). Ainda a confirmar com a GSS (24/11): quais empresas entram
# (24/11: Forquilhinha 5725, Tijucas 5750, Mostardas 5835, Urubici 5845) e se "digitado" (status 6, laudo feito sem liberar) conta como pendente. Ate la: tudo entra.
#
# Uso: pythonw coletor_mobilemed.py   (config em %LOCALAPPDATA%\SigmaSLA: sla_key.txt)
# Log curto em %LOCALAPPDATA%\SigmaSLA\coletor_mobilemed.log (sem nome de paciente).
import json, os, sys, time, traceback, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE = Path(os.environ.get("LOCALAPPDATA", ".")) / "SigmaSLA"
URL_SIGMA = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-coletor"
CDP = "http://127.0.0.1:9333/json"
HOST = "laudos.mobilemed.com.br"
URL_LISTA = "https://laudos.mobilemed.com.br/exames"
MAX = 200
USUARIO_ID = 64788  # usuario da Brenda no Mobilemed (pesquisapadrao/64788); so entra no filtro de contagem
# prioridade_id do Mobilemed: 1 = rotina (eletivo, origem "externo"); qualquer outra e urgencia (origem "ps").
PRIORIDADE_ROTINA = 1
# Prazo por cidade (Brenda, 24/11), em horas (urgencia, eletivo), contado da chegada no Mobilemed. O prazo que o
# proprio Mobilemed calcula (sla_expiration_date) nao bate com o contrato (Urubici 48 h, Mostardas 120 h): so vale
# para cidade fora desta lista (Forquilhinha, em 24/11, ainda sem prazo informado).
PRAZOS_H = {"URUBICI": (72, 72), "MOSTARDAS": (2, 24), "TIJUCAS": (72, 72), "VILA VELHA": (2, 48)}
EMPRESAS = None  # None = todas; ex.: {5725} quando a GSS disser quais unidades entram
STATUS_FORA = set()  # ex.: {6} se "digitado" nao contar como pendente
BRT = timezone(timedelta(hours=-3))
LOG = BASE / "coletor_mobilemed.log"


def log(msg):
    try:
        if LOG.exists() and LOG.stat().st_size > 512_000:
            LOG.replace(LOG.with_suffix(".log.1"))
        with LOG.open("a", encoding="utf-8") as f:
            f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n")
    except Exception:
        pass


def enviar(payload):
    chave = (BASE / "sla_key.txt").read_text(encoding="utf-8-sig").strip()
    req = urllib.request.Request(URL_SIGMA, data=json.dumps(payload).encode("utf-8"), method="POST",
                                 headers={"x-sla-key": chave, "Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")[:300]


def aba_mobilemed():
    try:
        abas = json.load(urllib.request.urlopen(CDP, timeout=5))
    except Exception:
        return None, "chrome_fechado"  # o coletor do Tijucas reabre o Chrome do robo
    for a in abas:
        if a.get("type") == "page" and HOST in a.get("url", ""):
            return a, None
    # Aba fechada: abre de novo no mesmo Chrome (a sessao fica no perfil; se pedir login, precisa da Brenda).
    try:
        urllib.request.urlopen(urllib.request.Request(CDP + "/new?" + URL_LISTA, method="PUT"), timeout=10).read()
    except Exception:
        pass
    return None, "sem_aba_mobilemed"


def avaliar(aba, expr, espera=40):
    import websocket  # pip install --user websocket-client
    ws = websocket.create_connection(aba["webSocketDebuggerUrl"], timeout=espera, suppress_origin=True)
    try:
        ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                            "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
        while True:
            r = json.loads(ws.recv())
            if r.get("id") == 1:
                return (r.get("result") or {}).get("result", {}).get("value")
    finally:
        ws.close()


def recarregar(aba):
    import websocket
    ws = websocket.create_connection(aba["webSocketDebuggerUrl"], timeout=10, suppress_origin=True)
    try:
        ws.send(json.dumps({"id": 1, "method": "Page.reload", "params": {}}))
    finally:
        ws.close()
    time.sleep(15)


# Segundos ate o token vencer (negativo = vencido; None = sem sessao OIDC, ou seja, deslogado).
EXPR_TOKEN = """(() => { const k = Object.keys(localStorage).find(x => x.startsWith("oidc.user"));
  if (!k) return null; const u = JSON.parse(localStorage.getItem(k) || "{}");
  return u.access_token ? u.expires_at - Math.floor(Date.now() / 1000) : null; })()"""


def ler_pagina(aba, pagina):
    filtro = {
        "is_excluido": False, "medicos": [], "empresas": [], "pesquisa": "", "nome_paciente": "", "codigo_paciente": "",
        "estudo_descricao": "", "is_no_audio": False, "is_comentario": False, "is_interessante": False,
        "is_imagem_chave": False, "is_anexo": False, "is_anexo_exame": False, "is_imagens_capturadas": False,
        "is_duplicado": False, "is_original": False, "is_anterior": False, "is_achado_critico": False,
        "is_suspeita_tecnica": False, "sexo_paciente_id": None, "exibirExamesPendentes": True,
        "exibirExamesAPreparar": True, "exibirExamesReconvocados": True, "exibirPaginacao": False,
        "periodo": {"data_inicial": "", "data_final": ""},
        "transferencia": {"data_inicial_transferencia": "", "data_final_transferencia": ""},
        "tipo_tempo": 4, "tipo_exame": 1, "is_listagem_preparacao": False, "is_listagem_transferencia": True,
        "is_crescente": False, "pacs_accession_no": None, "listagem_id": 2, "identidade_paciente": "",
        "isSolicitante": False, "email_usuario": "", "tipo_listagem": 1, "array_prioridade": [],
        "array_status_id": None, "limpar_data": False, "is_equipe_medica": False, "pesquisa_geral": "",
        "pesquisa_id_exame": None, "is_liberado": 0, "exibir_contadores": True, "meus_assinados": False,
        "reassinados": False, "listagem_audio": 1,
    }
    contagem = {
        "usuario_id": USUARIO_ID, "intervalo": 4, "periodo": {},
        "transferencia": {"data_inicial_transferencia": "", "data_final_transferencia": ""}, "is_excluido": False,
        "exibirExamesPendentes": True, "exibirExamesReconvocados": True, "exibirExamesAPreparar": True,
        "modalidades": [1, 12, 10, 11, 13, 14, 2, 3, 4, 5, 6, 7, 8, 9], "estudo_descricao": "", "medicos": [],
        "indications_level": "", "limpar_data": False, "exibirContagemAudio": 1, "status_id": 0, "pesquisa_geral": "",
        "pesquisa_id_exame": "", "achado": 0, "is_achado_critico": "", "is_suspeita_tecnica": "", "periodo_id": "",
        "nome_paciente": "", "is_listagem_transferencia": True, "is_listagem_preparacao": False, "listagem_audio": 1,
        "is_meus_exames_residente": False,
    }
    corpo = {"exames": {"filtro": filtro, "paginacao": {"pagina": pagina, "total_registros": MAX}},
             "filtroContagem": contagem}
    # O e-mail do filtro vem da pesquisa salva na propria aba (e o da pessoa logada), para nao fixar no codigo.
    expr = """new Promise(ok => { setTimeout(() => ok(JSON.stringify({s: 0, t: "timeout"})), 30000);
      const k = Object.keys(localStorage).find(x => x.startsWith("oidc.user"));
      const u = JSON.parse(localStorage.getItem(k) || "{}");
      const corpo = %s;
      try { corpo.exames.filtro.email_usuario = JSON.parse(sessionStorage.getItem("pesquisa") || "{}").email_usuario || ""; } catch (e) {}
      fetch("https://gateway-sa.mobilemed.com.br/portal-api/exame/lista", {method: "POST",
        headers: {"Content-Type": "application/json", "Authorization": "Bearer " + u.access_token}, body: JSON.stringify(corpo)})
        .then(x => x.text().then(t => ok(JSON.stringify({s: x.status, t: t}))))
        .catch(e => ok(JSON.stringify({s: 0, t: String(e)})));
    })""" % json.dumps(corpo)
    return json.loads(avaliar(aba, expr) or '{"s":0,"t":"sem_resposta"}')


def iso(txt):
    return datetime.fromisoformat(txt.replace("Z", "+00:00")).astimezone(BRT)


def main():
    agora = datetime.now(timezone.utc)
    base = {"unidade": "mobilemed", "lida_em": agora.isoformat(), "cheia": False, "linhas": []}
    aba, problema = aba_mobilemed()
    if problema:
        log(problema)
        return enviar({**base, "status": "erro", "detalhe": {"motivo": problema}})
    resto = avaliar(aba, EXPR_TOKEN, 15)
    if resto is not None and resto < 90:
        recarregar(aba)
        resto = avaliar(aba, EXPR_TOKEN, 15)
    if resto is None or resto < 0 or "/login" in aba.get("url", "") or "signin" in aba.get("url", ""):
        log(f"sessao_expirada ({resto})")
        return enviar({**base, "status": "sem_grade", "detalhe": {"motivo": "sessao_expirada"}})
    regs, pagina, cheia = [], 1, False
    while True:
        resp = ler_pagina(aba, pagina)
        if resp.get("s") != 200 or not str(resp.get("t", "")).lstrip().startswith("{"):
            log(f"api status {resp.get('s')}")
            return enviar({**base, "status": "sem_grade", "detalhe": {"motivo": "api", "http": resp.get("s")}})
        j = json.loads(resp["t"])
        regs += j.get("lista") or []
        pag = j.get("paginacao") or {}
        if pagina >= int(pag.get("last_page") or 1):
            break
        pagina += 1
        if pagina > 10:  # trava de seguranca: a fila normal tem dezenas
            cheia = True
            break
    total = len(regs)
    linhas, antigos, fora, cidades = [], 0, 0, {}
    for e in regs:
        if e.get("is_liberado") or e.get("is_excluido") or e.get("status_id") in STATUS_FORA \
                or (EMPRESAS is not None and e.get("empresa_id") not in EMPRESAS):
            fora += 1
            continue
        # Inicio do prazo = chegada no Mobilemed (o proprio SLA dele conta daqui: transferencia + 48 h).
        quando_txt = e.get("data_transferencia_final") or e.get("data_realizacao")
        if not quando_txt:
            continue
        quando = iso(quando_txt)
        if (agora - quando).days >= 10:  # a edge so aceita data de ate 10 dias; mais velho fica so na contagem
            antigos += 1
            continue
        cidade = (e.get("nome_fantasia") or (e.get("empresa") or {}).get("nome_fantasia") or "").strip().upper()
        urgente = e.get("prioridade_id") != PRIORIDADE_ROTINA
        if cidade in PRAZOS_H:
            vence = (quando + timedelta(hours=PRAZOS_H[cidade][0 if urgente else 1])).isoformat()
        else:
            vence = iso(e["sla_expiration_date"]).isoformat() if e.get("sla_expiration_date") else None
        cidades[cidade or "?"] = cidades.get(cidade or "?", 0) + 1
        # A cidade vai na frente do estudo: a fila do Mobilemed mistura varias cidades na mesma unidade do Sigma.
        estudo = " - ".join(x for x in [cidade.title(), (e.get("estudo_descricao") or "").strip()] if x)
        linhas.append({
            "data": quando.strftime("%d/%m/%Y"), "hora": quando.strftime("%H:%M:%S"),
            "origem": "ps" if urgente else "externo",
            "paciente": (e.get("nome_paciente") or "").strip()[:120], "estudo": estudo[:120], "vence": vence,
        })
    detalhe = {"fonte": "mobilemed_api", "lista_completa": not cheia and antigos == 0, "total": total,
               "antigos": antigos, "fora_do_filtro": fora, "cidades": cidades}
    r = enviar({**base, "status": "ok", "cheia": cheia, "linhas": linhas, "detalhe": detalhe})
    log(f"ok {len(linhas)} linhas, total {total}, fora {fora}, antigos {antigos}, cidades {cidades}: {r}")
    return r


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log("falha " + traceback.format_exc().replace("\n", " | ")[-600:])
        try:
            enviar({"unidade": "mobilemed", "lida_em": datetime.now(timezone.utc).isoformat(), "status": "erro",
                    "cheia": False, "linhas": [], "detalhe": {"motivo": "excecao"}})
        except Exception:
            pass
        sys.exit(1)
