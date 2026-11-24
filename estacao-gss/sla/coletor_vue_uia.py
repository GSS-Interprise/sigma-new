# Coletor do SLA de laudos pelo Vue PACS SEM OCR (24/11/2026, primeiro no CEPON, PC da baia do Wagner).
# A grade do "Explorador de arquivos" do Vue expoe cada celula pela UIA (DataItem "<coluna> row N", valor no
# ValuePattern): Data, Hora, Nome do paciente, Descricao, Status, Tipo de Atendimento. Le o texto exato, sem tela na
# frente e sem mouse. Roda a cada 3 min na sessao do usuario (tarefa SigmaColetorSLA, /it, pythonw), porque a UIA
# nao enxerga a tela pela sessao do SSH. O vigia dispara esta mesma tarefa se coletor.log ficar parado.
#
# Seguranca contra "fila vazia falsa": so manda leitura se o titulo da lista for a pasta configurada (ex.: ...\Hoje).
# Fora dela (outra pasta, visualizador, tela de login) manda sem_grade e o Sigma nao tira ninguem da fila.
# A UIA so expoe as linhas desenhadas: se a grade estiver cheia (rolagem), manda cheia = true e ninguem sai.
#
# Uso: pythonw coletor_vue_uia.py   (unidade e pasta em C:\ProgramData\ssh-tunel\estacao.json; chave em sla_key.txt)
import json, re, sys, traceback, urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE = Path(r"C:\ProgramData\ssh-tunel")
URL_SIGMA = "https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-coletor"
LOG = BASE / "coletor.log"


def log(msg):
    try:
        if LOG.exists() and LOG.stat().st_size > 512_000:
            LOG.replace(LOG.with_suffix(".log.1"))
        with LOG.open("a", encoding="utf-8") as f:
            f.write(f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}\n")
    except Exception:
        pass


BRT = timezone(timedelta(hours=-3))


def cfg():
    c = json.loads((BASE / "estacao.json").read_text(encoding="utf-8-sig"))
    return c["unidade"], c.get("pasta") or "Hoje"


def prazo_externo_h():
    # Prazo do eletivo/externo por unidade (Brenda, 24/11: Marieta 48 h, CEPON 72 h). O padrao do Sigma
    # (sla_prazos) e um so para todas as unidades (48 h); com prazo_externo_h em estacao.json o coletor manda o
    # "vence" do exame externo. PS e internado seguem o padrao (2 h e 4 h).
    try:
        return int(json.loads((BASE / "estacao.json").read_text(encoding="utf-8-sig")).get("prazo_externo_h") or 0)
    except Exception:
        return 0


def enviar(payload):
    chave = (BASE / "sla_key.txt").read_text(encoding="utf-8-sig").strip()
    req = urllib.request.Request(URL_SIGMA, data=json.dumps(payload).encode("utf-8"), method="POST",
                                 headers={"x-sla-key": chave, "Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")[:300]


def origem(tipo):
    # "Tipo de Atendimento" do Vue. Brenda (23/11): CEPON segue o esquema da Marieta, urgencia e internado.
    t = (tipo or "").lower()
    if "intern" in t:
        return "internado"
    if "urg" in t or "emerg" in t or "pronto" in t:
        return "ps"
    return "externo"


def valor(d):
    try:
        return (d.iface_value.CurrentValue or "").strip()
    except Exception:
        return (d.legacy_properties().get("Value") or "").strip()


def ler(pasta):
    from pywinauto import Desktop
    jan = next((w for w in Desktop(backend="uia").windows() if w.window_text() == "Vue PACS Client"), None)
    if jan is None:
        return None, "vue_fechado"
    if any(c.element_info.automation_id == "WND_LoginDialog" for c in jan.descendants(control_type="Window")):
        return None, "tela_login"
    titulo = next((p.window_text() for p in jan.descendants(control_type="Pane")
                   if p.element_info.automation_id == "pctTitle"), "")
    if not titulo.replace("/", "\\").lower().endswith("\\" + pasta.lower()):
        return None, "fora_da_pasta"
    # Atualiza a lista (botao Atualizar da faixa, sem mouse); se nao achar, le o que esta na tela.
    for b in jan.descendants(control_type="Button"):
        if "refresh" in (b.element_info.automation_id or b.window_text() or "").lower():
            try:
                b.invoke()
            except Exception:
                pass
            break
    import time
    time.sleep(3)
    tabela = None
    for t in jan.descendants(control_type="Table"):
        if any(re.match(r"Data row \d+$", d.window_text() or "") for d in t.descendants(control_type="DataItem")):
            tabela = t
            break
    if tabela is None:
        return {"linhas": [], "altura": 0, "visiveis": 0}, None
    linhas = {}
    for d in tabela.descendants(control_type="DataItem"):
        m = re.match(r"(.+) row (\d+)$", d.window_text() or "")
        if m and int(m.group(2)) >= 0:
            linhas.setdefault(int(m.group(2)), {})[m.group(1)] = valor(d)
    r = tabela.rectangle()
    return {"linhas": [linhas[k] for k in sorted(linhas)], "altura": r.bottom - r.top}, None


def main():
    unidade, pasta = cfg()
    agora = datetime.now(timezone.utc)
    base = {"unidade": unidade, "lida_em": agora.isoformat(), "cheia": False, "linhas": []}
    grade, problema = ler(pasta)
    if problema:
        log(problema)
        return enviar({**base, "status": "sem_grade", "detalhe": {"motivo": problema, "fonte": "vue_uia"}})
    linhas, tipos, prazo_h = [], {}, prazo_externo_h()
    for l in grade["linhas"]:
        st = (l.get("Status") or "").strip().lower()
        if st and not st.startswith("n"):
            continue  # so "Nao lido" (a pasta ja filtra; isto e trava contra "Lido", "Laudado" etc.)
        if not re.match(r"\d{2}/\d{2}/\d{4}$", l.get("Data", "")) or not re.match(r"\d{2}:\d{2}(:\d{2})?$", l.get("Hora", "")):
            continue
        tipo = l.get("Tipo de Atendimento", "")
        tipos[tipo] = tipos.get(tipo, 0) + 1
        org = origem(tipo)
        vence = None
        if org == "externo" and prazo_h:
            h = l["Hora"] if len(l["Hora"]) == 8 else l["Hora"] + ":00"
            vence = (datetime.strptime(l["Data"] + " " + h, "%d/%m/%Y %H:%M:%S").replace(tzinfo=BRT)
                     + timedelta(hours=prazo_h)).isoformat()
        linhas.append({"data": l["Data"], "hora": l["Hora"], "origem": org, "vence": vence,
                       "paciente": (l.get("Nome do paciente") or "")[:120], "estudo": (l.get("Descri\u00e7\u00e3o") or l.get("Descricao") or "")[:120]})
    # Linha de 25 px: se as linhas ocupam a grade quase toda, pode haver mais abaixo (UIA so expoe as desenhadas).
    cheia = len(grade["linhas"]) * 25 >= grade["altura"] - 60
    detalhe = {"fonte": "vue_uia", "lista_completa": not cheia, "total": len(grade["linhas"]), "tipos": tipos}
    r = enviar({**base, "status": "ok", "cheia": cheia, "linhas": linhas, "detalhe": detalhe})
    log(f"ok {len(linhas)} linhas, cheia {cheia}, tipos {tipos}: {r}")
    return r


if __name__ == "__main__":
    try:
        main()
    except Exception:
        log("falha " + traceback.format_exc().replace("\n", " | ")[-600:])
        try:
            u = cfg()[0]
            enviar({"unidade": u, "lida_em": datetime.now(timezone.utc).isoformat(), "status": "erro",
                    "cheia": False, "linhas": [], "detalhe": {"motivo": "excecao", "fonte": "vue_uia"}})
        except Exception:
            pass
        sys.exit(1)
