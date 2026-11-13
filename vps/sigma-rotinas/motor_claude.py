"""Motor de IA do Sigma: Hermes na VPS da GSS rodando pela assinatura Max do Claude da GSS.

Doc: docs/arquitetura/motor-ia-hermes-claude.md. Tudo roda como o usuário sigma-ia (nunca root):
  ~/.hermes/hermes-agent        Hermes Agent (versão fixada) com o plugin claude-subscription-directsdk
  ~/.local/bin/claude           Claude Code oficial, que o plugin usa como cliente do modelo
  ~/.config/sigma-ia/claude.env token do `claude setup-token` (1 ano, só assinatura), 0600
O login é feito pela tela Configurações › Motor de IA, em dois pedidos (iniciar → link; código → token),
com o roteiro login-claude.sh. Nenhuma saída daqui leva token, código ou a tela crua dos programas.
"""
import os
import pathlib
import re
import subprocess
from datetime import datetime, timedelta, timezone

USUARIO = "sigma-ia"
CASA = pathlib.Path("/home") / USUARIO
TOKEN = CASA / ".config" / "sigma-ia" / "claude.env"
HERMES = CASA / ".hermes" / "hermes-agent" / ".venv" / "bin" / "hermes"
CLAUDE = CASA / ".local" / "bin" / "claude"
ROTEIRO = pathlib.Path(__file__).resolve().parent / "login-claude.sh"
PROVEDOR = "claude-subscription-directsdk-experimental"
# O token do setup-token vale um ano; a data exata não vem em lugar nenhum, então é estimativa.
VALIDADE_DIAS = 365

ERROS = {
    "sem-claude": "O Claude Code não foi encontrado na VPS.",
    "sem-script": "Falta o programa `script` na VPS para abrir o login.",
    "sem-leitor-de-tela": "Falta o leitor de tela (uv/pyte) na VPS para concluir o login.",
    "link-nao-apareceu": "O Claude não mostrou o endereço de login. Tente de novo em instantes.",
    "sem-login-aberto": "O login expirou ou não foi aberto. Comece de novo.",
    "token-nao-apareceu": "O código não foi aceito. Comece de novo e cole o código inteiro que a página mostrar.",
}


def _como_usuario(args, entrada="", tempo=120, env_extra=None):
    """Roda como sigma-ia com o ambiente limpo: nada de chave de API desviando da assinatura."""
    env = {"HOME": str(CASA), "USER": USUARIO, "LANG": "C.UTF-8", "PYTHONUTF8": "1", "PYTHONUNBUFFERED": "1",
           "PATH": f"{CASA}/.local/bin:/usr/local/bin:/usr/bin:/bin", "HERMES_HOME": str(CASA / ".hermes"),
           **(env_extra or {})}
    cmd = ["runuser", "-u", USUARIO, "--", "env", "-i", *[f"{k}={v}" for k, v in env.items()], *args]
    try:
        r = subprocess.run(cmd, input=entrada, capture_output=True, text=True, timeout=tempo, cwd=str(CASA))
        return r.returncode, (r.stdout or "") + (r.stderr or "")
    except subprocess.TimeoutExpired:
        return None, ""


def _token():
    try:
        for linha in TOKEN.read_text(encoding="utf-8").splitlines():
            if linha.startswith("CLAUDE_CODE_OAUTH_TOKEN="):
                return linha.split("=", 1)[1].strip() or None
    except OSError:
        return None
    return None


def _motivo(saida):
    m = re.search(r"^ERRO: ([a-z-]+)\s*$", saida, re.M)
    return m.group(1) if m else None


def _versao(exe, args):
    if not exe.exists():
        return None
    _, saida = _como_usuario([str(exe), *args], tempo=30)
    linha = (saida.strip().splitlines() or [""])[0]
    return linha[:80] or None


def situacao(_payload=None):
    gravado = None
    if _token():
        gravado = datetime.fromtimestamp(TOKEN.stat().st_mtime, timezone.utc)
    return {
        "hermes": _versao(HERMES, ["--version"]),
        "claude_code": _versao(CLAUDE, ["--version"]),
        "plugin": (CASA / ".hermes" / "plugins" / PROVEDOR).exists(),
        "conectado": gravado is not None,
        "login_em": gravado.isoformat() if gravado else None,
        "vence_em_estimado": ((gravado + timedelta(days=VALIDADE_DIAS)).isoformat() if gravado else None),
    }


def login_iniciar(_payload=None):
    _, saida = _como_usuario(["bash", str(ROTEIRO), "iniciar"], tempo=70)
    m = re.search(r"^LINK: (https://\S+)\s*$", saida, re.M)
    if not m:
        raise RuntimeError(ERROS.get(_motivo(saida) or "", "Não consegui abrir o login do Claude. Tente de novo."))
    return {"link": m.group(1)}


def login_codigo(payload):
    codigo = str((payload or {}).get("codigo") or "").strip()
    if not re.fullmatch(r"[\x21-\x7e]{8,2000}", codigo):
        raise RuntimeError("Cole o código inteiro que a página do Claude mostrou.")
    # O código vai pela entrada padrão: como argumento ficaria à vista na lista de processos.
    _, saida = _como_usuario(["bash", str(ROTEIRO), "codigo", "-"], entrada=codigo + "\n", tempo=120,
                             env_extra={"SIGMA_LOGIN_SEM_TESTE": "1"})
    if not re.search(r"^OK: ", saida, re.M):
        raise RuntimeError(ERROS.get(_motivo(saida) or "", "Não consegui concluir o login do Claude. Comece de novo."))
    return {"conectado": True, "teste": teste()}


def teste(_payload=None):
    """Prova a cadeia inteira: Hermes → plugin → Claude Code → assinatura. Só vale a palavra OK de volta."""
    token = _token()
    if not token:
        return {"ok": False, "frase": "Ainda não há login do Claude na VPS."}
    inicio = datetime.now(timezone.utc)
    cod, saida = _como_usuario(
        [str(HERMES), "chat", "-Q", "--provider", PROVEDOR, "-m", "sonnet", "-q", "Responda apenas a palavra OK."],
        tempo=180, env_extra={"CLAUDE_CODE_OAUTH_TOKEN": token},
    )
    segundos = round((datetime.now(timezone.utc) - inicio).total_seconds(), 1)
    if cod is None:
        return {"ok": False, "frase": "O Claude não respondeu em 3 minutos. Tente de novo.", "segundos": segundos}
    if cod == 0 and re.search(r"\bOK\b", saida):
        return {"ok": True, "frase": "A assinatura respondeu pelo Hermes.", "segundos": segundos}
    # Só a última linha, sem nada que pareça token, para o Sigma mostrar o motivo.
    ultima = re.sub(r"sk-ant-\S+", "[token]", (saida.strip().splitlines() or ["sem saída"])[-1])[:200]
    return {"ok": False, "frase": f"O Claude não respondeu pelo Hermes: {ultima}", "segundos": segundos}


def sair(_payload=None):
    try:
        TOKEN.unlink()
    except FileNotFoundError:
        pass
    return {"conectado": False}


ROTINAS = {
    "ia_claude_situacao": situacao,
    "ia_claude_login": login_iniciar,
    "ia_claude_codigo": login_codigo,
    "ia_claude_teste": teste,
    "ia_claude_sair": sair,
}
