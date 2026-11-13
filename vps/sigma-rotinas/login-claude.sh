#!/usr/bin/env bash
# Login do Claude Code pela assinatura Max da GSS, em dois tempos, para dar para fazer pelo Sigma
# (o worker sigma-rotinas chama este script como o usuário sigma-ia) ou à mão no servidor.
# Cópia do deploy/vps/login-claude.sh do Board da Wood, que faz o mesmo login em produção desde 10/2026:
#   login-claude.sh iniciar        abre o `claude setup-token` e mostra "LINK: <endereço>"
#   login-claude.sh codigo <cod>   entrega o código que o claude.ai mostrou e grava o token
#   login-claude.sh codigo -       o mesmo, com o código vindo pela entrada padrão (não aparece no `ps`)
#   login-claude.sh enter          só confirma (Enter) o que já foi digitado e grava o token
# Roda como o usuário do serviço. O token (1 ano, só assinatura, nunca API) vai para
# ~/.config/sigma-ia/claude.env (0600). Nenhum pedaço do token aparece na saída: em erro sai só
# "ERRO: <motivo>", nunca a tela do terminal.
set -uo pipefail
umask 077
export PATH="$HOME/.local/bin:$PATH"

BASE="$HOME/.config/sigma-ia"
D="$BASE/login-claude"
EU="$(id -un)"

limpa() { sed 's/\x1b\[[0-9;?]*[A-Za-z]//g; s/\x1b\][^\x07]*\x07//g' "$D/saida" 2>/dev/null; }

encerrar() {
  pkill -u "$EU" -f 'claude setup-token' 2>/dev/null
  pkill -u "$EU" -f 'segura-login-sigma' 2>/dev/null
  return 0
}

# A tela do setup-token (Ink) redesenha só o que muda: no registro o token vem picotado por saltos
# de cursor que pulam letras já desenhadas. Grep no texto cru monta um token errado; o certo é
# reproduzir o registro num emulador de terminal (pyte) e ler a tela final.
LER_TELA='
import re, sys, pyte
tela = pyte.Screen(2000, 50)
pyte.Stream(tela).feed(open(sys.argv[1], "rb").read().decode("utf-8", "replace"))
achados = [m for l in tela.display for m in re.findall(r"sk-ant-[A-Za-z0-9_-]{60,}", l)]
print(achados[-1] if achados else "")
'
ler_token() {
  if command -v uv >/dev/null 2>&1; then
    uv run -q --with pyte python -c "$LER_TELA" "$D/saida" 2>/dev/null
  elif python3 -c 'import pyte' >/dev/null 2>&1; then
    python3 -c "$LER_TELA" "$D/saida" 2>/dev/null
  else
    return 3
  fi
}

gravar_token() {
  local token="" _
  if ! command -v uv >/dev/null 2>&1 && ! python3 -c 'import pyte' >/dev/null 2>&1; then
    echo "ERRO: sem-leitor-de-tela"; return 1
  fi
  for _ in $(seq 1 30); do
    # grep -c lê a entrada inteira: com -q o sed morreria de SIGPIPE e o pipefail daria falso negativo.
    if limpa | grep -c 'CLAUDE_CODE_OAUTH_TOKEN' >/dev/null; then token=$(ler_token); fi
    [ -n "$token" ] && break
    sleep 2
  done
  if [ -z "$token" ]; then echo "ERRO: token-nao-apareceu"; return 1; fi
  mkdir -p "$BASE"
  # Grava ao lado e troca: o worker nunca lê um arquivo pela metade.
  printf 'CLAUDE_CODE_OAUTH_TOKEN=%s\n' "$token" >"$BASE/claude.env.novo" && mv -f "$BASE/claude.env.novo" "$BASE/claude.env"
  chmod 600 "$BASE/claude.env"
  encerrar
  # O registro da tela tem o token: não pode sobrar em disco.
  rm -rf "$D"
  echo "OK: token gravado"
  # O Sigma faz o próprio teste pelo Hermes; à mão, este aqui dá a prova de vida.
  [ "${SIGMA_LOGIN_SEM_TESTE:-0}" = "1" ] && return 0
  if (cd "$HOME" && env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN CLAUDE_CODE_OAUTH_TOKEN="$token" timeout 180 claude -p "Responda apenas a palavra OK." 2>/dev/null | grep -c 'OK' >/dev/null); then
    echo "TESTE: ok"
  else
    echo "TESTE: falhou"; return 1
  fi
}

case "${1:-}" in
  iniciar)
    command -v claude >/dev/null 2>&1 || { echo "ERRO: sem-claude"; exit 1; }
    command -v script >/dev/null 2>&1 || { echo "ERRO: sem-script"; exit 1; }
    encerrar
    rm -rf "$D" && mkdir -p "$D" && chmod 700 "$D"
    mkfifo "$D/entrada"
    # Segura a fifo aberta: sem isso o setup-token recebe fim de arquivo antes de chegar o código.
    nohup bash -c 'exec -a segura-login-sigma sleep 1800' >"$D/entrada" 2>/dev/null </dev/null &
    # Terminal largo: o link e o token saem numa linha só (o Ink quebra texto na largura).
    nohup script -q -f -c "stty cols 2000 rows 50; claude setup-token" "$D/saida" <"$D/entrada" >/dev/null 2>&1 &
    url=""
    for _ in $(seq 1 40); do
      url=$(limpa | grep -ao 'https://[^[:space:]]*oauth/authorize[^[:space:]]*' | head -1)
      [ -n "$url" ] && break
      sleep 1
    done
    if [ -n "$url" ]; then echo "LINK: $url"; else encerrar; echo "ERRO: link-nao-apareceu"; exit 1; fi
    ;;
  codigo)
    [ -p "$D/entrada" ] || { echo "ERRO: sem-login-aberto"; exit 1; }
    cod="${2:-}"
    if [ "$cod" = "-" ]; then IFS= read -r cod || true; cod="${cod%$'\r'}"; fi
    [ -n "$cod" ] || { echo "ERRO: sem-codigo"; exit 2; }
    printf '%s' "$cod" >"$D/entrada"
    # Enter em escrita separada: junto do texto o Ink trata tudo como colagem e não confirma.
    sleep 1
    printf '\r' >"$D/entrada"
    gravar_token
    exit $?
    ;;
  enter)
    [ -p "$D/entrada" ] || { echo "ERRO: sem-login-aberto"; exit 1; }
    printf '\r' >"$D/entrada"
    gravar_token
    exit $?
    ;;
  *) echo "uso: $0 iniciar | codigo <codigo> | codigo - | enter"; exit 2 ;;
esac
