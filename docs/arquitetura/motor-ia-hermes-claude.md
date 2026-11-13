# Motor de IA do Sigma: Hermes + assinatura Max do Claude da GSS

**Decisão do Raul, 13/11/2026:** os itens de IA novos do Sigma usam como motor o Hermes Agent na VPS da GSS,
rodando pela assinatura **Max** do Claude da GSS (conta `@gestaoservicosaude.com.br`), do mesmo jeito que a VPS da
Pulse. Quais processos rodam com o Claude será definido com a GSS, um a um.

O que já existe **não muda**: IA de campanha (`campanha-ia-responder`), busca de perfil (`redes-sociais-buscar`),
BI e o resto seguem no Gemini.

## Como funciona

```
Sigma (tela ou edge)                VPS da GSS 147.93.71.48
  rotina_pedir('ia_claude_*') ──►  rotina_pedidos ──► worker sigma-rotinas (root, systemd)
                                                         │ laço próprio: 8 s parado, 2 s por 10 min depois de um pedido
                                                         ▼
                                                   runuser -u sigma-ia (ambiente limpo, sem ANTHROPIC_*)
                                                         │
                                                   Hermes 0.21.5 ──► plugin claude-subscription-directsdk
                                                                        └─► Claude Code oficial (claude CLI)
                                                                              └─► assinatura Max (CLAUDE_CODE_OAUTH_TOKEN)
```

- **Plugin:** `claude-subscription-directsdk-experimental` (Nous Research). Roda o Claude Code oficial como cliente do
  modelo; o consumo sai da cota de "Agent SDK" da assinatura. Ainda é "review build" (experimental).
- **Usuário `sigma-ia`** (sem root, sem sudo): `~/.hermes/hermes-agent` (git na tag `v2026.9.24` = 0.21.5, `uv sync
  --frozen`), `~/.local/bin/claude` (2.1.323, instalador oficial), `~/.hermes/plugins/claude-subscription-directsdk-experimental`.
  Config do Hermes: `model.provider` = o plugin, `model.default` = `sonnet`.
- **Ferramentas do Hermes desligadas** (web, browser, terminal, file, code_execution, memory, delegation, cronjob,
  computer_use etc.; só `todo` ligado). Cada processo novo liga só o que precisa, com `-t` na chamada.
- **Login:** `vps/sigma-rotinas/login-claude.sh` (cópia do Board da Wood, em produção desde 10/2026): `claude
  setup-token` num terminal falso (`script` + fifo); o Sigma mostra o link, a pessoa entra com a conta da GSS e cola o
  código; o token (1 ano) vai para `~sigma-ia/.config/sigma-ia/claude.env` (0600). O registro da tela, que contém o
  token, é apagado na hora.
- **Rotinas** (`vps/sigma-rotinas/motor_claude.py`), só administrador pede (`rotina_pedir` recusa os outros):

  | Tipo | Faz |
  |---|---|
  | `ia_claude_situacao` | versões do Hermes e do Claude Code, plugin presente, se há login e quando vence (estimado) |
  | `ia_claude_login` | abre o `setup-token` e devolve o link |
  | `ia_claude_codigo` | entrega o código, grava o token e roda o teste |
  | `ia_claude_teste` | `hermes chat -Q --provider <plugin> -m sonnet -q "Responda apenas a palavra OK."` |
  | `ia_claude_sair` | apaga o token |

- **Segredo:** nenhum resultado leva token, código ou a tela crua. O código do login sai do `payload` quando o pedido
  termina (`rotina_concluir`), porque a fila é legível por qualquer usuário logado.
- **Tela:** Configurações › Canais & Integrações › **Motor de IA (Claude)** (`MotorIaTab.tsx`): situação, conectar ou
  refazer login, testar, desconectar e a lista de processos que usam o Claude (vazia até a GSS definir).

## Regras para um processo novo usar o Claude

1. Definido com a GSS: o que faz, quais dados vê (atenção a dado de médico e de paciente: LGPD) e quanto da cota usa.
2. Entra na lista "Processos que usam o Claude" da tela e neste doc.
3. Vira uma rotina `ia_claude_<processo>` (ou um tipo próprio) no worker, com as ferramentas mínimas (`-t`).
4. A cota é a da assinatura Max, dividida com quem usa o Claude da GSS no dia a dia: processo pesado em lote fica para
   a madrugada. "Extra usage" desligado na conta para não haver cobrança além do plano.

## Riscos

- Plugin experimental e cota de Agent SDK sem documentação pública de peso: pode mudar sem aviso. O teste da tela é a
  prova de vida; se ele falhar, os processos do Claude param e o resto do Sigma segue.
- Token de 1 ano: refazer o login antes do vencimento (a tela mostra a data estimada).
- O serviço `sigma-rotinas` tem `MemoryMax=1G`, que vale também para o Hermes e o Claude Code (rodam dentro do
  cgroup do serviço). Se um processo pesado estourar, subir o limite.

## Estado (13/11/2026)

- [x] Hermes, Claude Code e plugin instalados na VPS da GSS, usuário `sigma-ia`
- [x] Rotinas `ia_claude_*`, migration `20261113170000_motor_ia_claude.sql`, tela Motor de IA
- [ ] Login com a conta Max da GSS (Raul, pela tela) e teste respondendo
- [ ] Primeiro processo definido com a GSS
