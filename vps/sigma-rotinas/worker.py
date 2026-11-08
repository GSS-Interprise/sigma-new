"""Worker das rotinas do Sigma na VPS da GSS (plano GSS dono no comando, Fase 5).

Pega pedidos da fila rotina_pedidos pela edge rotinas-fila, executa e devolve o resultado.
Só biblioteca padrão: roda no python3 do sistema, sem venv.

Configuração em /opt/sigma-rotinas/.env (chmod 600, fora do git):
  SIGMA_URL=https://zupsbgtoeoixfokzkjro.supabase.co
  ROTINAS_KEY=<mesmo valor do secret ROTINAS_WORKER_KEY do Supabase>

Rotina nova = função em ROTINAS + o tipo na lista de rotina_pedir (migração) .
"""
import json
import os
import socket
import sys
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timezone

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


ROTINAS = {
    "ping": rotina_ping,
}


# ---- laço ------------------------------------------------------------------

def executar(pedido):
    tipo, pid = pedido["tipo"], pedido["id"]
    inicio = time.time()
    try:
        resultado = ROTINAS[tipo](pedido.get("payload") or {})
        fila({"action": "concluir", "id": pid, "ok": True, "resultado": resultado})
        log(f"feito {tipo} {pid} em {time.time() - inicio:.1f}s")
    except Exception as e:  # noqa: BLE001 — qualquer falha da rotina vira erro no pedido, o laço segue
        fila({"action": "concluir", "id": pid, "ok": False, "erro": f"{type(e).__name__}: {e}"})
        log(f"erro {tipo} {pid}: {e}\n{traceback.format_exc()}")


def main():
    if not CHAVE or "functions/v1" not in URL or not URL.startswith("https://"):
        log("faltam SIGMA_URL e ROTINAS_KEY no .env")
        sys.exit(1)
    log(f"worker {WORKER} ouvindo {sorted(ROTINAS)}")
    while True:
        try:
            r = fila({"action": "pegar", "worker": WORKER, "tipos": sorted(ROTINAS), "limite": 1})
            pedidos = r.get("pedidos") or []
            for p in pedidos:
                executar(p)
            if not pedidos:
                time.sleep(INTERVALO_VAZIO)
        except urllib.error.HTTPError as e:
            log(f"fila respondeu {e.code}: {e.read()[:200]!r}")
            time.sleep(60)
        except Exception as e:  # noqa: BLE001 — rede caiu: espera e tenta de novo
            log(f"falha ao falar com a fila: {e}")
            time.sleep(30)


if __name__ == "__main__":
    main()
