# Coletor do SLA de laudos do Tijucas (Animati PACS, web). Roda a cada 3 min no PC da baia do Wagner (usuario heron).
#
# Nao usa OCR nem mouse: le a fila pela mesma API que a tela do Animati usa (POST /studies/find/all), de dentro do
# Chrome separado do robo (perfil SigmaSLA\chrome-tijucas, porta de depuracao 9333 so em 127.0.0.1), com a sessao
# que a Brenda logou. A propria chamada mantem a sessao viva.
# Fila da GSS = prioridade "GSS LAUDOS - ..." (ids abaixo) + filtro de laudo "Sem laudo" (report = "NO"). A fila
# geral "sem laudo" do Animati (3.000+ exames desde outubro, US local etc.) NAO e da GSS (conferido em 23/11).
# Manda ao Sigma (edge sla-coletor) data, hora, origem, paciente, estudo e o prazo que o Animati ja calcula por
# exame (campo deadline -> "vence"). A API devolve maxResults+1 quando ha mais: por isso pagina ate esgotar.
#
# Uso: pythonw coletor_tijucas.py   (config em %LOCALAPPDATA%\SigmaSLA: sla_key.txt e abrir-tijucas.vbs)
# Log curto em %LOCALAPPDATA%\SigmaSLA\coletor_tijucas.log (sem nome de paciente).
import json, os, subprocess, sys, time, traceback, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE = Path(os.environ.get("LOCALAPPDATA", ".")) / "SigmaSLA"
URL_SIGMA = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-coletor"
CDP = "http://127.0.0.1:9333/json"
HOST = "cdi.tijucas.rangsaude.com.br"
MAX = 200
# id da prioridade no Animati -> origem do SLA no Sigma (prazo padrao da origem so vale se o exame vier sem deadline)
PRIORIDADES_GSS = {"22": "ps", "21": "externo", "23": "internado", "20": "externo"}  # EMERG., AMBUL., INTERNADO, OIT
BRT = timezone(timedelta(hours=-3))  # Brasil sem horario de verao desde 2019
LOG = BASE / "coletor_tijucas.log"


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


def pagina_animati():
    """Aba do Animati no Chrome do robo; abre o Chrome se nao estiver rodando (cai no login: precisa da Brenda)."""
    try:
        abas = json.load(urllib.request.urlopen(CDP, timeout=5))
    except Exception:
        vbs = BASE / "abrir-tijucas.vbs"
        if vbs.exists():
            subprocess.Popen(["wscript.exe", str(vbs)], creationflags=0x08000000)
        return None, "chrome_fechado"
    for a in abas:
        if a.get("type") == "page" and HOST in a.get("url", ""):
            return a, None
    return None, "sem_aba_animati"


def ler_fila(aba, prioridade, inicio):
    import websocket  # pip install --user websocket-client
    ws = websocket.create_connection(aba["webSocketDebuggerUrl"], timeout=40, suppress_origin=True)
    try:
        # Mesma chamada da lista, com o filtro "Exames sem laudo". Restricoes em branco = sem outros filtros.
        expr = """new Promise(ok => {
          const r = {patientIdName:"", studyDescription:"", referringPhysicianName:"", modality:"", "source.name":"",
            physicianPerforming:"", studiesWithoutReport:false, studiesWithoutReleasedReports:false,
            studiesWithoutTypedReports:false, accessionNumber:"", technicianName:"", typist:"", priority:"%s",
            healthInsurance:"", report:"NO", patientBirthdate:"", firstRelease:true, reviewerPhysician:""};
          const corpo = {filterId:null, restrictions:r, orderBy:"datetime", direction:"desc", startIndex:%d, maxResults:%d};
          fetch("/studies/find/all", {method:"POST", credentials:"include",
            headers:{"Content-Type":"application/json", "X-Requested-With":"XMLHttpRequest"}, body:JSON.stringify(corpo)})
            .then(x => x.text().then(t => ok(JSON.stringify({s:x.status, u:x.url, t:t}))))
            .catch(e => ok(JSON.stringify({s:0, t:String(e)})));
        })""" % (prioridade, inicio, MAX)
        ws.send(json.dumps({"id": 1, "method": "Runtime.evaluate",
                            "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
        while True:
            r = json.loads(ws.recv())
            if r.get("id") == 1:
                return json.loads(r["result"]["result"]["value"])
    finally:
        ws.close()


def brt(txt):
    """A API crua devolve "dd/mm/aaaa HH:MM:SS" no horario de Brasilia (a tela converte; o fetch direto nao)."""
    if txt and txt[2:3] == "/":
        return datetime.strptime(txt[:19], "%d/%m/%Y %H:%M:%S").replace(tzinfo=BRT)
    return datetime.fromisoformat(txt.replace("Z", "+00:00")).astimezone(BRT)


def main():
    agora = datetime.now(timezone.utc)
    base = {"unidade": "tijucas", "lida_em": agora.isoformat(), "cheia": False, "linhas": []}
    aba, problema = pagina_animati()
    if problema:
        log(problema)
        return enviar({**base, "status": "erro", "detalhe": {"motivo": problema}})
    if "/login" in aba.get("url", ""):
        log("login")
        return enviar({**base, "status": "sem_grade", "detalhe": {"motivo": "sessao_expirada"}})
    regs, cheia = [], False
    for pri, origem in PRIORIDADES_GSS.items():
        inicio = 0
        while True:
            resp = ler_fila(aba, pri, inicio)
            if resp.get("s") != 200 or "/login" in str(resp.get("u", "")) or not resp.get("t", "").lstrip().startswith("{"):
                log(f"api status {resp.get('s')}")
                return enviar({**base, "status": "sem_grade", "detalhe": {"motivo": "api", "http": resp.get("s")}})
            pagina = json.loads(resp["t"]).get("records") or []
            regs += [(origem, e) for e in pagina[:MAX]]
            if len(pagina) <= MAX:
                break
            inicio += MAX
            if inicio >= 2000:  # trava de seguranca: fila GSS normal tem dezenas
                cheia = True
                break
    total = len(regs)
    linhas, antigos = [], 0
    for origem, e in regs:
        if not e.get("datetime"):
            continue
        quando = brt(e["datetime"])
        if (agora - quando).days >= 10:  # a edge so aceita data de ate 10 dias; mais velho fica so na contagem
            antigos += 1
            continue
        estudo = " ".join(x for x in [e.get("mainModality") or "", (e.get("description") or "").strip()] if x)
        vence = brt(e["deadline"]).isoformat() if e.get("deadline") else None
        linhas.append({
            "data": quando.strftime("%d/%m/%Y"), "hora": quando.strftime("%H:%M:%S"), "origem": origem,
            "paciente": ((e.get("patient") or {}).get("name") or "").strip()[:120],
            "estudo": estudo[:120], "vence": vence,
        })
    detalhe = {"fonte": "animati_api", "lista_completa": not cheia and antigos == 0, "total": total, "antigos": antigos}
    r = enviar({**base, "status": "ok", "cheia": cheia, "linhas": linhas, "detalhe": detalhe})
    log(f"ok {len(linhas)} linhas, total {total}, antigos {antigos}: {r}")
    return r


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log("falha " + traceback.format_exc().replace("\n", " | ")[-600:])
        try:
            enviar({"unidade": "tijucas", "lida_em": datetime.now(timezone.utc).isoformat(), "status": "erro",
                    "cheia": False, "linhas": [], "detalhe": {"motivo": "excecao"}})
        except Exception:
            pass
        sys.exit(1)
