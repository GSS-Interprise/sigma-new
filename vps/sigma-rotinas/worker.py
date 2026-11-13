"""Worker das rotinas do Sigma na VPS da GSS (plano GSS dono no comando, Fase 5).

Pega pedidos da fila rotina_pedidos pela edge rotinas-fila, executa e devolve o resultado.
O laço só usa biblioteca padrão; a rotina lifeshub_lista precisa do venv /opt/sigma-rotinas/venv
(playwright + chromium + openpyxl), que é o python do serviço.

Configuração em /opt/sigma-rotinas/.env (chmod 600, fora do git):
  SIGMA_URL=https://zupsbgtoeoixfokzkjro.supabase.co
  ROTINAS_KEY=<mesmo valor do secret ROTINAS_WORKER_KEY do Supabase>
  LIFESHUB_EMAIL=... / LIFESHUB_SENHA=...   (login do Life's Hub, rotina lifeshub_lista)
  DRESCALA_EMAIL=... / DRESCALA_SENHA=...   (login do Dr. Escala, rotina drescala_escalas)

As rotinas ia_claude_* (motor_claude.py: login, situação e teste do Claude da GSS no Hermes) correm num laço
próprio: quem está na tela esperando o link do login não pode ficar atrás dos ~7 min da carga do Dr. Escala.

Rotina nova = função em ROTINAS + o tipo na lista de rotina_pedir (migração) .
"""
import json
import os
import socket
import sys
import threading
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

INTERVALO_VAZIO = 10  # segundos entre consultas quando a fila está vazia
WORKER = socket.gethostname()


def carregar_env(caminho):
    if not os.path.exists(caminho):
        return
    for linha in open(caminho, encoding="utf-8"):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            chave, valor = linha.split("=", 1)
            os.environ.setdefault(chave.strip(), valor.strip())


carregar_env(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
URL = os.environ.get("SIGMA_URL", "").rstrip("/") + "/functions/v1/rotinas-fila"
CHAVE = os.environ.get("ROTINAS_KEY", "")


def log(msg):
    print(f"{datetime.now().isoformat(timespec='seconds')} {msg}", flush=True)


def fila(corpo):
    req = urllib.request.Request(
        URL,
        data=json.dumps(corpo).encode("utf-8"),
        headers={"Content-Type": "application/json; charset=utf-8", "x-rotinas-key": CHAVE},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


# ---- rotinas ---------------------------------------------------------------

def rotina_ping(payload):
    return {"pong": WORKER, "em": datetime.now(timezone.utc).isoformat(), "eco": payload}


def rotina_lifeshub_lista(payload, pedido_id):
    """Extrai a lista do Life's Hub e pede ao Sigma para importar como lista de disparo."""
    import lifeshub  # Playwright só é carregado quando a rotina roda (o ping não depende dele)

    r = lifeshub.extrair(payload)
    xlsx_b64 = r.pop("xlsx_b64")
    if not xlsx_b64:
        return {**r, "lista": None, "aviso": "nenhum médico com telefone nessa busca"}
    # Hora de Brasília no nome: a VPS roda em UTC e duas extrações no mesmo dia saíam com o mesmo nome.
    quando = datetime.now(ZoneInfo("America/Sao_Paulo")).strftime("%d/%m/%Y %Hh%M")
    nome = f"Life's Hub — {r['especialidade']} — {'/'.join(r['ufs'])} — {quando}"
    imp = fila({"action": "importar_lista", "pedido_id": pedido_id, "xlsx_b64": xlsx_b64,
                "nome_lista": nome, "especialidade": r["especialidade"]})
    if not imp.get("ok"):
        raise RuntimeError(f"importação no Sigma falhou: {imp.get('error')}")
    return {**r, "lista": nome, "import_job_id": imp.get("job_id")}


def rotina_drescala_escalas(payload, pedido_id):
    """Escalas do Dr. Escala (hospitais, setores, plantões e furos) para as tabelas drescala_* do Sigma."""
    import drescala

    def enviar(action, corpo):
        corpo = {"action": action, **corpo}
        if action == "drescala_abrir":
            corpo["pedido_id"] = pedido_id
        r = fila(corpo)
        if not r.get("ok"):
            raise RuntimeError(f"Sigma recusou {action}: {r.get('error')}")
        return r

    return drescala.sincronizar(payload, enviar)


# Rotinas que recebem o id do pedido (precisam falar com a fila no meio da execução).
COM_PEDIDO = {"lifeshub_lista", "drescala_escalas"}

ROTINAS = {
    "ping": rotina_ping,
    "lifeshub_lista": rotina_lifeshub_lista,
    "drescala_escalas": rotina_drescala_escalas,
}

import motor_claude  # noqa: E402 — só biblioteca padrão; o Hermes e o Claude rodam como o usuário sigma-ia

ROTINAS_RAPIDAS = dict(motor_claude.ROTINAS)
ROTINAS.update(ROTINAS_RAPIDAS)


# ---- laço ------------------------------------------------------------------

def executar(pedido):
    tipo, pid = pedido["tipo"], pedido["id"]
    inicio = time.time()
    try:
        args = (pedido.get("payload") or {}, pid) if tipo in COM_PEDIDO else (pedido.get("payload") or {},)
        resultado = ROTINAS[tipo](*args)
        fila({"action": "concluir", "id": pid, "ok": True, "resultado": resultado})
        log(f"feito {tipo} {pid} em {time.time() - inicio:.1f}s")
    except Exception as e:  # noqa: BLE001 — qualquer falha da rotina vira erro no pedido, o laço segue
        fila({"action": "concluir", "id": pid, "ok": False, "erro": f"{type(e).__name__}: {e}"})
        log(f"erro {tipo} {pid}: {e}\n{traceback.format_exc()}")


def laco(tipos, intervalo, rapido=None):
    """rapido = (segundos, janela): depois de um pedido, consulta mais amiúde por `janela` segundos (login em dois
    passos: o código chega logo depois do link). Fora disso, `intervalo` — cada consulta é uma chamada de edge."""
    log(f"worker {WORKER} ouvindo {tipos}")
    ultimo = 0.0
    while True:
        try:
            r = fila({"action": "pegar", "worker": WORKER, "tipos": tipos, "limite": 1})
            pedidos = r.get("pedidos") or []
            for p in pedidos:
                executar(p)
                ultimo = time.time()
            if not pedidos:
                quente = rapido and time.time() - ultimo < rapido[1]
                time.sleep(rapido[0] if quente else intervalo)
        except urllib.error.HTTPError as e:
            log(f"fila respondeu {e.code}: {e.read()[:200]!r}")
            time.sleep(60)
        except Exception as e:  # noqa: BLE001 — rede caiu: espera e tenta de novo
            log(f"falha ao falar com a fila: {e}")
            time.sleep(30)


def main():
    if not CHAVE or "functions/v1" not in URL or not URL.startswith("https://"):
        log("faltam SIGMA_URL e ROTINAS_KEY no .env")
        sys.exit(1)
    # Laço próprio para o motor de IA (gente esperando na tela): 8 s parado, 2 s nos 10 min depois de um pedido.
    threading.Thread(target=laco, args=(sorted(ROTINAS_RAPIDAS), 8, (2, 600)), daemon=True).start()
    laco(sorted(set(ROTINAS) - set(ROTINAS_RAPIDAS)), INTERVALO_VAZIO)


if __name__ == "__main__":
    main()
