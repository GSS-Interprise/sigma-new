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
  | `ia_claude_assistente_campanha` | 1º processo (17/11): interpreta a "regra especial" do assistente de campanha e devolve JSON. Pedida pela edge `campanha-assistente-ia` (service_role), que espera até 60 s e cai no Gemini se não houver login, der erro ou demorar. Vê só o rascunho da campanha, sem dado de médico; sem ferramentas |
  | `ia_claude_sugerir_resposta` | 2º processo (25/11, pedido do Heron): botão "Sugerir resposta" da tela Conversas. Pedida pela edge `conversa-sugerir-resposta` (service_role), que espera até 25 s e cai no Gemini se não houver login, der erro ou demorar. Devolve o texto da próxima mensagem (`{texto}`) ou, fora da janela de 24 h, o modelo escolhido (`{json}`). **Vê dado de médico** (últimas 30 mensagens, nome, especialidade, cidade, vaga): só para números com `uso` em `supabase_config.sugestao_resposta_usos` (começa em `["prospeccao"]`, LGPD). Por isso a fila esconde esse tipo da leitura da tela (policy `rotina_pedidos_ler`), `rotina_concluir` apaga o payload e a edge apaga o resultado depois de ler. Motor de cada sugestão em `conversa_sugestoes.motor`. Sem ferramentas |
  | `ia_claude_robo_sigma` | 3º processo (25/11): um **passo** do robô "Perguntar ao Sigma" (edge `sigma-assistente`). Ver "Robô do Sigma no Claude" abaixo. **Vê dado de médico** (resultados das ferramentas que a pessoa pode usar); mesma proteção da sugestão: fila esconde o tipo, payload apagado no `rotina_concluir`, resultado apagado pela edge. Motor de cada resposta em `assistente_mensagens.modelo` (`claude-sonnet (Hermes)` ou o modelo do Gemini). Sem ferramentas do Hermes |

## Processos que usam o Claude

Todos com o Gemini de reserva: sem login, com erro ou demora, o Gemini responde e o Sigma segue igual. Helper comum
das edges: `supabase/functions/_shared/motor-ia.ts` (`claudeLigado`, `pedirAoClaude`).

| Processo | Edge | Rotina | Vê | Espera o Claude | Onde fica o motor que respondeu |
|---|---|---|---|---|---|
| Assistente de campanha | `campanha-assistente-ia` | `ia_claude_assistente_campanha` | rascunho da campanha, sem dado de médico | 60 s | `rotina_pedidos` (erro = o Gemini respondeu; sem login o Gemini responde sem passar pela fila) |
| Robô do Sigma ("Perguntar ao Sigma") | `sigma-assistente` | `ia_claude_robo_sigma` | o que a pessoa vê nas telas (domínios liberados) | 80 s no total, 20 s para a VPS pegar o pedido | `assistente_mensagens.modelo` |
| Sugestão de resposta em Conversas | `conversa-sugerir-resposta` | `ia_claude_sugerir_resposta` | conversa, cadastro do médico e vaga (só números de prospecção) | 25 s | `conversa_sugestoes.motor` |

A tela mostra, por processo, qual motor respondeu por último e quando (RPC `motor_ia_processos()`, só administrador,
sem abrir o conteúdo de nenhum pedido; migration `20261125130000_motor_ia_robo_sigma.sql`).

### Robô do Sigma no Claude (desenho b)

- **A edge continua dona do laço de ferramentas.** A cada passo ela pede `ia_claude_robo_sigma` com as instruções de
  sempre (`instrucoes()` de `_shared/assistente.ts`, as mesmas do Gemini), a lista de ferramentas liberadas para a
  pessoa e a conversa com os resultados já consultados. O Claude devolve só `{"ferramentas": [{nome, args}]}` (até 4)
  ou `{"resposta": "..."}`. A edge roda as ferramentas e repete, até 6 voltas (`sigma-assistente/claude.ts`).
- **Permissões iguais às de hoje:** as ferramentas rodam na edge, com `roboLiberado`, `MODULO_DO_DOMINIO`,
  `veContratos`, a campanha da página (`?campanha=`) e `pode_editar_campanha`. Nome de ferramenta fora da lista vira
  "ferramenta indisponível para esta pessoa". Escrita continua só proposta: o cartão "Confere?" sai igual.
- **Por que não o desenho (a)** (Claude na VPS chamando o `sigma-mcp`): o MCP decide acesso por papel
  (`agente_dominio_acessos`), não pelo módulo da tela de cada pessoa, não tem as ferramentas de proposta nem o
  contexto da página, e pediria um token por usuário guardado na VPS.
- **Reserva:** passo sem JSON válido, erro, sem login ou passou de 80 s: o Gemini responde do zero com o próprio teto
  de 40 s (o caminho de antes, sem mudança). Se o Claude já montou uma proposta antes de falhar, o cartão vale e o
  Gemini não é chamado. Se a VPS não pegar um pedido em 20 s (worker parado), o robô vai direto ao Gemini por 10 min.
- **Tamanho:** as instruções somam ~27 KB (guias dos domínios); os resultados dividem ~60 mil caracteres (até 8 mil
  cada), porque a pergunta vira um argumento do Hermes e o Linux recusa argumento acima de 128 KB. O worker recusa
  acima de 120 KB (vira Gemini).
- **Tempo e cota:** cada passo é um `hermes chat` (uns 10-20 s); uma pergunta com consulta usa 2 passos. O laço rápido
  do worker atende um pedido por vez: duas pessoas perguntando juntas esperam uma pela outra.

- **Segredo:** nenhum resultado leva token, código ou a tela crua. O código do login sai do `payload` quando o pedido
  termina (`rotina_concluir`), porque a fila é legível por qualquer usuário logado.
- **Tela:** Configurações › Canais & Integrações › **Motor de IA (Claude)** (`MotorIaTab.tsx`): situação, conectar ou
  refazer login, testar, desconectar, o passo a passo do login para quem não é técnico e o bloco "Onde o Claude é
  usado" (cada processo com o último motor que respondeu e quando).

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
- [x] Login com a conta Max da GSS (Raul, pela tela, 26/11/2026): teste respondeu em 15 s; token vence ~26/11/2027
- [x] Primeiro processo: assistente de campanha (Raul, 17/11), com o Gemini de reserva até a GSS conectar
- [x] Robô do Sigma no Claude (25/11): edge `sigma-assistente` e migration `20261125130000` no ar; falta publicar
  `motor_claude.py` (rotina `ia_claude_robo_sigma`) na VPS e reiniciar o `sigma-rotinas` (conferido em 26/11: VPS igual ao repo)
