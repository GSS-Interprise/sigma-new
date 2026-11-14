---
tags: [arquitetura, gss, mcp, claude, escalas, dr-escala]
projeto: SigmaGSS
autor: Raul
data: 2026-11-13
status: em-execucao
operador: Raul
repo: sigma-new
---

# Arquitetura de Solução — Claude dos sócios da GSS (operação por conversa)

> Pedido do Heron (sócio da GSS). Conceito no Vault: `Projetos/GSS-Claude-dos-Socios.md`.
> Este doc é a fonte do status: a checklist da §6 diz o que está feito.
> A plataforma por baixo (guia do agente, domínios, permissão, consistência entre sócios) está em
> `docs/arquitetura/protocolo-agente-sigma.md`.

## 1. O que precisa funcionar (a capacidade)

Cada sócio da GSS pergunta ao próprio Claude coisas como "como estão as escalas do hospital X amanhã?",
"quais plantões estão descobertos esta semana?" ou "quem está de plantão no HRO agora?" e recebe a resposta com
dado real do Sigma. Numa segunda fase, o sócio lê as conversas dos escalistas com os médicos e pede ao Claude
para responder pelo número do escalista, com confirmação antes de enviar e registro de quem mandou.

## 2. Estado atual (o que já existe)

**Dr. Escala (o software de escalas da GSS)**
- Edges antigas `supabase/functions/drescala-sync`, `drescala-bi` e `escalas-api`: chamam a **API de BI** do
  Dr. Escala (`https://api-gateway.drescala.com/api/bi/gss`, header `x-api-key`, rotas `/plantoes?mes&ano` e
  `/locais-setores`). Gravavam em `escalas_integradas` (12.252 linhas, 55 unidades, dez/2025 a mar/2026).
- **Essa sincronização morreu na migração de 03/04/2026:** o secret `DRESCALA_API_KEY` não foi levado para o
  Supabase novo (as edges respondem `DRESCALA_API_KEY não está configurada`). O dado parou em 31/03.
- A API de BI só devolve plantão **preenchido** (`nome_profissional`, sem CRM, sem situação, sem furo). Não
  serve para "plantões descobertos".
- `escalas_integradas` é usada pelas telas antigas de escala (`src/hooks/useEscalasData.ts`, `useEscalasBI.ts`,
  `EscalasImportTab.tsx`) e pelo financeiro (`useFinanceiroData.ts`). Não mexer no formato dela aqui.
- No financeiro, a "T10 Dr. Escala API (JSON)" (`docs/arquitetura/modulo-financeiro.md`) é um contrato JSON
  combinado com o pessoal do Dr. Escala, ainda não entregue. A produção do mês entra hoje por import do relatório
  (`financeiro-importar-fechamento`).

**App web do Dr. Escala (mapeado em 13/11/2026, sem login, pelos bundles do app)**
- App Angular; a GSS entra em `https://gss.drescala.com.br/#/login`. API interna em `https://api-gateway.drescala.com/api`
  (o tenant vem no JWT: `"subdomain": "gss"`).
- Login: `POST /api/auth/login` com `{"email","senha"}` → `{"token": "<JWT>"}`. Sem captcha. O JWT traz
  `tipo_usuario` (`admin`, `coordenador`, `visualizador`, `profissional`) e `permissoes`. O app manda
  `Authorization: Bearer <token>` em toda chamada e, em algumas, um header `DeviceInfo` (JSON do navegador).
- Rotas de leitura úteis (todas sob `/api`):
  - `GET /locais/findAllListagem`, `GET /locais/habilitados`, `GET /setores/findAllListagem`
  - `GET /plantoes/busca?page&limit&startDate&endDate&localId&setorId&profissionalId&situacaoId&tipoId&furo&anunciado&...`
    (filtro `furo` = plantão descoberto; parâmetro vazio vai como a string `null`)
  - `GET /plantoes/relatorio-escala-lista?startDate&days&localId&setorId&...`
  - `GET /plantoes/semanal?local&data`, `GET /plantoes/mensal-setor?setor_id&mes`
  - `GET /situacoes-plantao/...`, `GET /tipo-plantao?setor_id&mes`
- **Confirmado logado (13/11/2026, conta da diretoria):** `/plantoes/busca` e `/plantoes/relatorio` voltam vazios
  com essa conta. A rota que funciona é `GET /plantoes/mensal-setor?setor_id=<id>&mes=AAAA-MM` (a da tela de escala
  mensal), uma chamada por setor e mês. `GET /locais/findAllListagem` traz os locais já com os setores.
- **Furo** = plantão com `furo: true`, `profissional_real: 0` e nome "Sem Profissional Alocado": vaga sem médico.
- A API devolve **429** se apertar. Com pausa de 0,35 s, a carga de 106 locais / 188 setores / 2 meses faz 378
  chamadas e leva ~7 min.
- O Dr. Escala tem locais de teste ("EMPRESA DR ESCALA - LOCAL TESTE", "EMPRESA LOCAL TESTE 2"); a view os exclui.

**VPS da Pulse/GSS (`147.93.71.48`)**
- Worker `vps/sigma-rotinas/worker.py` (systemd `sigma-rotinas`, venv com Playwright) consome a fila
  `rotina_pedidos` pela edge `supabase/functions/rotinas-fila` (header `x-rotinas-key`). Rotina de referência:
  `vps/sigma-rotinas/lifeshub.py` (login pela tela, captura do token, API direta).
- `rotina_pegar` devolve à fila o pedido que ficar mais de 10 min em `executando`: a rotina precisa terminar
  antes disso.

**WhatsApp**
- Chakra (API oficial) em coexistence: mensagens em `sigzap_messages`; ecos do celular em
  `smb_message_echoes`. Envio pelo número já existe na prospecção. O Vini está conectando os números do pessoal
  de escala (13/11/2026).

**Papéis no Sigma** (`app_role`): `admin`, `diretoria`, `coordenador_escalas`, `gestor_financeiro`, ...
Funções `has_role(uid, role)` e `is_admin(uid)`.

## 3. A solução desenhada

```
Dr. Escala ──(robô na VPS: login + API interna)──► rotinas-fila ──► tabelas drescala_* ◄── sigma-mcp (edge)
                                                                                           ▲
                                     Claude do sócio (Claude.ai / Desktop / Code) ── MCP ──┘
```

### 3a. Robô do Dr. Escala na VPS — rotina `drescala_escalas`

- Arquivo `vps/sigma-rotinas/drescala.py` + entrada `drescala_escalas` em `ROTINAS` no `worker.py`.
- Login direto por HTTP (`POST /api/auth/login`), sem navegador: o Dr. Escala não cifra a senha nem tem captcha.
  O JWT vale 4 h.
  Se um dia passar a exigir, o fallback é o mesmo do Life's Hub (Playwright + captura do token).
- Payload: `{"inicio": "2026-11-13", "dias": 38, "local_ids": []}` (vazio = todos os locais).
  Padrão: de 7 dias atrás a 30 dias à frente (máximo 62 dias, por causa do tempo).
- Passos: login → locais e setores → `/plantoes/mensal-setor` por setor ativo e mês → envia ao Sigma em
  lotes de até 500 plantões (`rotinas-fila` action `drescala_gravar`) → fecha a sincronização
  (`drescala_fechar`), que apaga do período os plantões que sumiram do Dr. Escala.
- Credenciais `DRESCALA_EMAIL` e `DRESCALA_SENHA` só em `/opt/sigma-rotinas/.env` (chmod 600). Usuário ideal:
  um **visualizador** dedicado ao robô (só leitura), não a conta de uma pessoa.

### 3b. Tabelas de escala no Sigma (migration nova, RLS + GRANT)

| Tabela | Chave | Conteúdo |
|---|---|---|
| `drescala_locais` | `id` (id do Dr. Escala) | hospital/unidade: nome, cidade, habilitado, `raw` |
| `drescala_setores` | `id` | setor: `local_id`, nome, `raw` |
| `drescala_plantoes` | `id` (id do plantão) | `local_id`, `setor_id`, `data` (dia de início, hora de Brasília), `inicio`, `fim` (timestamptz), `profissional_id`, `profissional_nome`, `profissional_crm`, `situacao`, `tipo`, `furo` (bool), `anunciado` (bool), `ultima_sync` (id da sincronização), `raw` |
| `drescala_sincronizacoes` | `id` | uma linha por execução: período, contagens (locais, plantões, furos, removidos), erro |

- Fonte nova e separada de `escalas_integradas` (que é da API de BI e alimenta telas antigas e o financeiro).
  Quando a T10 do financeiro chegar, a decisão de unificar fica para lá.
- RLS: leitura para `admin`, `diretoria` e `coordenador_escalas`; escrita só `service_role` (o robô grava pela
  edge). GRANT `select` para `authenticated` e `all` para `service_role` logo depois de cada `create table`.
- View `drescala_escala_v` (plantão + nome do local + nome do setor) para as consultas do MCP e de telas futuras.
- `pg_cron` pede a rotina 3 vezes ao dia (06h, 12h, 18h de Brasília).

### 3c. Servidor MCP remoto do Sigma — edge `sigma-mcp` (só leitura no começo)

- Edge function que fala MCP por Streamable HTTP (JSON-RPC em `POST`, sem sessão: `initialize`, `tools/list`,
  `tools/call`, `ping`). Sem SDK pesado, para caber no runtime das edges.
- **Login por sócio:** cada sócio tem uma conta no Sigma. Primeira versão: **token pessoal** (`mcp_tokens`:
  `user_id`, hash SHA-256 do token, nome, criado, último uso, revogado). O token é mostrado uma vez e vai no
  header `Authorization: Bearer` do cliente MCP. A edge confere o hash, carrega os papéis do usuário e recusa quem
  não tiver papel liberado (`admin`, `diretoria`).
- **OAuth 2.1 (T7, no ar em 14/11)** para Claude.ai, celular e Desktop, que só conectam conector remoto com login.
  A própria edge é o servidor de login (regras em `supabase/functions/_shared/mcp-oauth.ts`):
  - sem token, o MCP responde 401 com `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource"`;
  - metadados em `<edge>/.well-known/oauth-protected-resource`, `/oauth-authorization-server` e `/openid-configuration`;
  - `POST /register`: registro dinâmico (RFC 7591), cliente público. Só aceita redirect do Claude
    (`https://claude.ai|claude.com/...` e `http://localhost`), para nenhum site de fora pedir acesso a um sócio;
  - `GET /authorize` (PKCE S256 obrigatório) manda o sócio para `/conectar-claude` no Sigma, onde ele já está logado
    e clica **Autorizar** (a tela chama `POST /oauth/aprovar` com o JWT do Sigma; código de uso único, 10 min);
  - `POST /token`: código → acesso `sgm_` (1 h) + refresh `sgr_` (90 dias, rotaciona a cada uso). Código repetido
    derruba a conexão criada com ele. `POST /revoke` (RFC 7009);
  - a conexão OAuth é uma linha de `mcp_tokens` (`origem = 'oauth'`), como o token manual: desligar na tela corta
    as duas chaves. Tabelas `mcp_oauth_clientes` e `mcp_oauth_codigos` são só da service role.
- **Tela `/conectar-claude` (T5)**, no menu para admin e diretoria (Configurações só abre para admin): endereço do
  conector para colar no Claude, conexões ativas com último uso e **Desligar**, e token para o Claude Code (mostrado
  uma vez, já no comando `claude mcp add`). Com `client_id` na URL vira a tela de aprovação do OAuth. Se o sócio não
  estiver logado, o pedido sobrevive ao login (`src/lib/voltaAposLogin.ts`).
- Toda chamada grava em `mcp_chamadas` (quem, ferramenta, argumentos, duração, erro). É a trilha de auditoria.
- Ferramentas da fase 1 (escala):
  - `escalas_hospitais(busca?)`: lista hospitais/unidades com quantos plantões e furos há nos próximos 7 dias.
  - `escalas_do_hospital(hospital, data_inicio, data_fim?)`: plantões por setor, com quem está escalado e os furos.
  - `plantoes_descobertos(data_inicio, data_fim?, hospital?)`: só os furos, agrupados por hospital e dia.
  - `quem_esta_escalado(quando?, hospital?, profissional?)`: quem está de plantão num momento (padrão: agora) ou
    os plantões de um médico.
  - Toda resposta diz a hora da última sincronização com o Dr. Escala, para o sócio saber quão fresco é o dado.
- `hospital` aceita parte do nome sem acento ("hro", "chapeco", "gaspar"); se casar mais de um, a ferramenta
  devolve as opções em vez de chutar.

### 3d. Conversas dos escalistas (fase 2, leitura)

- Os números dos escalistas entram na Chakra em coexistence (o Vini está conectando). As mensagens já caem em
  `sigzap_messages` e os ecos do celular em `smb_message_echoes`.
- Marcar esses números como "escala" (tabela de números já existente da Chakra, coluna de finalidade) para
  separar da prospecção.
- Ferramentas MCP: `conversas_escalistas(escalista?, desde?)`, `conversa(medico ou telefone)`.

### 3e. Envio pelo número do escalista (fase 3, escrita)

- Ferramenta `enviar_mensagem_escalista(escalista, telefone, texto)` em duas etapas: a primeira chamada só
  devolve uma prévia e um código de confirmação; a mensagem sai só quando o Claude chama de novo com o código,
  depois de o sócio dizer "sim". Usa o envio da Chakra que já existe.
- Registro: `mcp_chamadas` + a própria mensagem guarda `enviado_por` (o sócio) e `via = 'mcp'`.
- Limites: só número marcado como "escala"; só para quem já conversou com aquele número (janela de 24 h da
  Meta; fora dela, só template aprovado); sem grupo (a API oficial não envia para grupo).

## 4. Fora de escopo

- Escrever no Dr. Escala (trocar médico, anunciar plantão, ofertar). O robô só lê.
- Tela nova de escala no Sigma. As telas antigas (`/escalas`) continuam em `escalas_integradas`.
- Mexer no financeiro ou na T10 (contrato JSON). Esta capacidade não muda `escalas_integradas` nem
  `financeiro_pagamentos`.
- Mandar mensagem em grupo de WhatsApp.
- Ações além de escala e WhatsApp (financeiro, contratos, prospecção) pelo MCP. Ficam para depois, ferramenta a
  ferramenta.
- Dar ao Claude acesso SQL livre ao banco. O MCP só expõe ferramentas fechadas.

## 5. Riscos, pegadinhas e dependências

- **API interna não é contrato.** O Dr. Escala pode mudar `/plantoes/busca` sem aviso. A rotina valida o formato
  e falha com mensagem clara ("formato de /plantoes/busca mudou"), sem gravar lixo. O caminho firme é a API de BI
  (pedir a chave de volta) e, depois, a T10.
- **Conta do robô:** hoje roda com a conta `diretoria@` (admin no Dr. Escala). Se usar a conta de uma pessoa, troca de senha derruba o robô, e o log do Dr. Escala mostra a
  pessoa acessando de madrugada. Pedir um visualizador dedicado.
- **Sessão única:** se o Dr. Escala derrubar a sessão de quem estava logado quando outro entra (como o Life's Hub),
  o robô expulsa o usuário real 3 vezes ao dia. Confirmar no primeiro teste.
- **Tempo:** a carga leva ~7 min. `rotina_pegar` passou a devolver à fila só o pedido parado há mais de 20 min
  (era 10). Se a GSS crescer muito em setores, quebrar a carga por local.
- **Fuso:** o Dr. Escala grava em UTC em parte das rotas (o app manda `timezone`). `data` no Sigma é o dia em
  hora de Brasília. Plantão noturno começa num dia e termina no outro.
- **LGPD:** nome e CRM de médico e conversas com médicos passam pelo Claude de cada sócio (dado sai do Sigma para
  a Anthropic). Precisa da decisão do Raul/GSS antes da fase 2.
- **Custo Meta:** desde 01/10/2026 a resposta enviada pela API é cobrada depois de 1.000 grátis por número/mês.
- **Token pessoal vaza = acesso aos dados.** Hash no banco, revogação por linha, último uso visível, papel
  conferido a cada chamada.
- **Descoberta do OAuth pelo Claude.ai:** a edge mora em `/functions/v1/sigma-mcp`, e a raiz do domínio do
  Supabase (`/.well-known/...` sem caminho) não é nossa. O Claude acha os metadados pelo `resource_metadata` do 401
  e pelo issuer com caminho (inserido ou anexado). Testado ponta a ponta por script (`supabase/tests/sigma_mcp_oauth_e2e.py`),
  ainda **não** com o Claude.ai de verdade. Se ele só procurar na raiz, a saída é um domínio próprio na VPS
  (proxy reverso) com os `/.well-known` na raiz.
- **A tela de aprovação vive no front do Lovable:** sem publicar o front, o `/authorize` manda para uma página que
  ainda não existe no ar.
- **Dependências externas:** login do Dr. Escala (Raul/GSS); números dos escalistas na Chakra (Vini).

## 6. Plano de execução (cada item ≈ 1 PR/commit)

- [x] T1 — Migration: `drescala_locais`, `drescala_setores`, `drescala_plantoes`, `drescala_sincronizacoes`,
  view `drescala_escala_v`, RLS, GRANT; `rotina_pedir` aceita `drescala_escalas`; RPCs `drescala_gravar_lote` e
  `drescala_fechar_sync`.
- [x] T2 — Rotina `drescala_escalas` (`vps/sigma-rotinas/drescala.py` + `worker.py`) e actions
  `drescala_gravar`/`drescala_fechar` na `rotinas-fila`. Deploy na VPS, credencial no `.env`, primeira carga real.
- [~] T3 — Agendamento `pg_cron` (06h, 12h, 18h; job `drescala-escalas`) feito. Falta o alerta quando a última
  sincronização tiver mais de 12 h.
- [x] T4 — Edge `sigma-mcp` com token pessoal (`mcp_tokens`, `mcp_chamadas`) e as 4 ferramentas de escala.
- [x] T5 — Tela `/conectar-claude` (no menu de admin e diretoria; Configurações só abre para admin): endereço do
  conector, conexões com Desligar, token do Claude Code. Portão visual 0 falhas em 1440 e 1024 (14/11).
- [ ] T6 — Conectar o Claude do Heron e validar com ele as perguntas reais de escala. Antes: publicar o front no
  Lovable e conectar o Claude.ai do Raul pelo endereço (prova da descoberta do OAuth).
- [x] T7 — OAuth 2.1 no `sigma-mcp` (registro dinâmico, PKCE, refresh com rotação, revogação). 14/11.
- [ ] T8 — Fase 2: marcar números de escala na Chakra + ferramentas de leitura de conversas.
- [ ] T9 — Fase 3: envio pelo número do escalista com confirmação em duas etapas e registro.

## 7. Critério de pronto

- [x] `select count(*) from drescala_plantoes` > 0 com dado real do mês corrente, e `drescala_sincronizacoes`
  com a última execução `ok` há menos de 12 h.
- [~] `furo = true` bate com o Dr. Escala para um hospital e um dia. **14/11, contra a API ao vivo:** CEPON em
  18/11/2026, setores 21, 24, 25 e 26: 13 plantões dos dois lados, mesmos ids e mesmos médicos, 1 furo (plantão
  92747, setor 26, "Sem Profissional Alocado", `furo=true`). Falta olhar a mesma escala na **tela** do Dr. Escala
  (precisa do login da GSS no navegador).
- [x] `POST /functions/v1/sigma-mcp` com `tools/call escalas_do_hospital {"hospital":"hro","data_inicio":"<hoje>"}`
  devolve os plantões do dia com nomes; sem token devolve 401; com token de usuário sem papel liberado, 403.
- [ ] Um cliente MCP real (Claude Code ou Desktop) lista as ferramentas e responde "quais plantões estão
  descobertos esta semana?".
- [x] Toda chamada aparece em `mcp_chamadas`.
- [x] Testes automatizados (14/11):
  - `supabase/functions/_shared/escalas_test.ts` (15) e `mcp-oauth_test.ts` (11): `cd supabase/functions/_shared && deno test --node-modules-dir=none`.
    Pegaram 2 bugs: CRM digitado com ponto ("12.345/SC") virava busca por nome, e mês 13 estourava RangeError.
  - `vps/sigma-rotinas/test_drescala.py` (14): `python -m unittest vps/sigma-rotinas/test_drescala.py`.
  - `supabase/tests/drescala_mcp.sql`: carga, remoção do que sumiu, sync com erro não apaga, cron, RLS, token. Termina
    em `TESTE_OK` e não grava nada.
  - `supabase/tests/sigma_mcp_oauth_e2e.py`: OAuth inteiro contra a edge no ar (27 checagens; apaga o que criou).

## 8. Autonomia e direitos de decisão

- **Operador decide sozinho:** detalhes de implementação dentro deste desenho, ordem fina entre T1 e T4.
- **Volta pro Raul em:** credenciais; qualquer escrita no Dr. Escala ou envio de WhatsApp; mudança de quem pode ver
  o quê; perguntas abertas abaixo.
- **Mergeia:** Raul.

## 9. Perguntas abertas (Raul decide)

1. ~~Acesso por sócio~~ **Decidido 13/11:** admin e diretoria veem todas as escalas. Falta a lista de quem entra.
2. ~~Quais Claude~~ **Decidido 13/11:** Claude.ai (navegador e celular), Claude Desktop e Claude Code. O OAuth
   (T7) é obrigatório para o Claude.ai e sobe de prioridade; o token pessoal serve no Code e no Desktop.
3. **LGPD:** a GSS aceita que nome/CRM de médico e, na fase 2, conversas com médicos passem pelo Claude de cada
   sócio? Qual plano do Claude eles usam (Team/Enterprise tem termos de dados diferentes do plano individual)?
4. **Conta do robô no Dr. Escala:** roda hoje com a conta `diretoria@` (admin). Dá para criar um usuário
   visualizador só para o robô? E a chave da API de BI
   (`DRESCALA_API_KEY`) pode ser pedida de novo ao Dr. Escala, para religar `drescala-sync`?
5. **Envio (fase 3):** confirmação sempre antes de enviar? Algum sócio pode mandar sem confirmar?
6. **Números dos escalistas:** quais entram e se a WABA da GSS cobre todos.
