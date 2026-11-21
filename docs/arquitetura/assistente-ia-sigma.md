---
tags: [arquitetura, gss, sigma, ia, assistente, agente]
projeto: SigmaGSS
autor: Raul
data: 2026-11-21
status: fase-1-no-ar
operador: Raul
repo: sigma-new
pulse_os: 00618fa8-8ec8-4ead-8153-4469e4676d1b (fases 161c3278, 71bf0532, 25973603, 02d37b4d)
---

# Arquitetura de Solução — Assistente de IA dentro do Sigma

> Decisão do Raul em 21/11/2026: uma IA dentro do Sigma que tira dúvidas (campanhas, escalas, licitações, contratos,
> processos) e cria e edita campanhas, "só se o solicitante for quem já pode fazer isso hoje". Fecha também o item 4
> da tabela da Ramone ("Criação e ajustes de campanha com IA"): editar com IA uma campanha que já está no ar.
> Plataforma por baixo: o protocolo do agente (`docs/arquitetura/protocolo-agente-sigma.md`), o mesmo do Claude dos
> sócios. Status: checklist da §6.

## 1. O que precisa funcionar (a capacidade)

Qualquer pessoa logada no Sigma abre um chat (botão fixo no canto, em todas as telas) e pergunta em português:
"quais campanhas estão rodando e como vão?", "quem está de plantão no CEPON amanhã?", "chegou licitação nova de
radiologia?", "quando vence o contrato de Gaspar?", "como encaminho um médico para Contratos?".

- **Responde com os fatos do Sigma**, os mesmos que o Claude dos sócios dá para a mesma pergunta (mesma ferramenta,
  mesmo hash de consistência), e diz a hora do dado.
- **Vê só o que a pessoa já vê hoje.** Quem não abre Licitações no Sigma também não recebe resposta de licitação.
- **Cria e edita campanha conversando** ("cria uma campanha de pediatria no RS com o modelo de plantão", "muda o
  limite da campanha GO Braço do Norte para 80 por número", "pausa a campanha X"). A IA nunca grava: ela monta uma
  proposta, o chat mostra um cartão "Confere?" com o antes e o depois, e só o clique da pessoa grava, pelas mesmas
  RPCs e com o login dela. Quem não pode criar ou editar campanha hoje recebe "você não tem acesso a isso".
- **Fica registrado:** toda pergunta, ferramenta chamada e ação confirmada.

## 2. Estado atual (o que já existe)

- **Protocolo do agente** (`supabase/functions/_shared/agente/`): núcleo (`protocolo.ts`, `registro.ts`, `tipos.ts`),
  domínios ativos `escalas` e `campanhas`, guia por domínio, hash de consistência, bateria
  `scripts/agente-consistencia.ts`. Permissão por domínio na tabela `agente_dominio_acessos` (papel × domínio).
  Ferramentas recebem `Ctx { svc (service role), userId, agora }`: a permissão é checada **antes** de chegar nelas.
- **MCP dos sócios** (`supabase/functions/sigma-mcp/`): expõe o protocolo para o Claude de fora (OAuth, tokens `sgm_`).
- **Motor de IA:** Claude da GSS via Hermes na VPS (`docs/arquitetura/motor-ia-hermes-claude.md`), por fila
  `rotina_pedidos` (laço de 2 a 8 s); **a conta Max ainda não está conectada** (tarefa 9113854b em Revisão). Gemini
  (`GEMINI_API_KEY`, conta bi@) é o reserva usado hoje pelo assistente de campanha (`campanha-assistente-ia`).
- **Criação de campanha:** assistente em `/prospeccao/nova` (`NovaCampanhaAssistente.tsx`) → RPC
  `campanha_assistente_criar(p jsonb)` (SECURITY DEFINER; só exige login: o portão hoje é a rota, `canView('disparos')`).
- **Edição de campanha:** `ConfigurarCampanhaDialog.tsx` grava direto em `campanhas`; RLS deixa admin, `diretoria`,
  `gestor_marketing` e `gestor_captacao`.
- **Permissões de tela:** `usePermissions` = `permissoes` (perfil × módulo × ação) menos `usuario_modulos_bloqueados`;
  no banco, `has_permission(uid, modulo, acao)` (não olha os bloqueios por pessoa).

## 3. A solução desenhada

```
Sigma (React)                         Edge sigma-assistente (Deno)                 Banco
 BotaoAssistente ─► PainelChat ─POST─► 1. valida JWT do usuário                    agente_dominio_acessos
   (todas as telas)   (mensagens)       2. domínios liberados = papel × domínio     permissoes / bloqueios
                                           ∩ módulos que a pessoa vê (pode_modulo)
                                        3. laço de ferramentas com o modelo ───────► ferramentas dos domínios
                                           (Gemini function calling; Claude depois)   (mesmo registro do MCP)
                                        4. ferramenta de escrita = só PROPOSTA ────► assistente_propostas
   CartaoProposta ◄─── resposta + proposta_id                                       (status pendente)
   [Confirmar] ─► RPC assistente_confirmar(proposta_id) com o JWT do usuário ──────► campanha_assistente_criar /
                                                                                     campanha_assistente_editar
                                        5. registra tudo ──────────────────────────► assistente_conversas/mensagens
```

### 3a. Um protocolo, dois clientes
A edge `sigma-assistente` usa o **mesmo registro de domínios** do `sigma-mcp` (`_shared/agente/registro.ts`): mesmas
ferramentas, mesmo guia (vira o system prompt), mesmo hash. Domínio novo entra uma vez e vale nos dois. O guia de
cada domínio liberado vai no prompt; o resto do Sigma, não.

### 3b. Permissão (o ponto mais sensível)
- **Leitura:** domínio liberado se a pessoa vê o módulo da tela correspondente (`MODULO_DO_DOMINIO` em
  `_shared/assistente.ts`): escalas → `escalas`, campanhas → `disparos`, licitações → `licitacoes`, contratos →
  `contratos`, CRM → `medicos`. Função `pode_modulo(uid, modulo, acao)` = `has_permission` **menos**
  `usuario_modulos_bloqueados` (antes o bloqueio por pessoa só existia no front). A tabela `agente_dominio_acessos`
  continua sendo só do MCP dos sócios (decisão de 21/11: dentro do Sigma vale "o que você já vê na tela").
- **Escrita:** ferramentas `campanhas_propor_criacao` e `campanhas_propor_edicao` só existem no laço se a pessoa pode:
  - criar = `pode_modulo(uid, 'disparos', 'visualizar')` — exatamente quem abre o assistente de campanha hoje;
  - editar = os papéis da RLS de `campanhas` (admin, diretoria, gestor_marketing, gestor_captacao).
  A checagem se repete na confirmação (RPC), porque o cartão pode ser clicado horas depois.
- **A IA nunca escreve.** Ferramenta de escrita grava uma linha em `assistente_propostas` (tipo, payload validado,
  resumo antes/depois, status `pendente`, expira em 2 h). Só `assistente_confirmar(proposta_id)`, chamada pelo front
  com o JWT da pessoa, executa — e só proposta da própria pessoa.
- `campanha_assistente_criar` ganha a checagem de `pode_modulo` por dentro (hoje só a rota protege).

### 3c. Edição de campanha (o que falta do item 4 da Ramone)
Nova RPC `campanha_assistente_editar(p_campanha_id, p jsonb)`, com lista branca do que dá para mudar conversando:
nome, status (ativa/pausada), limite por número, números (sender_ids), modelo e variáveis, briefing (valor, local,
sigilo, instruções), destinos do aviso. Cada campo valida como na tela (modelo aprovado no número, limite 1–250,
telefone válido). Devolve o antes e o depois para o cartão e grava no histórico da campanha.

### 3d. Motor
- **v1: Gemini** com function calling, chamado direto pela edge (resposta em segundos; o Claude da GSS ainda não
  está conectado). Modelo `gemini-3.5-flash`, reserva `-lite`, temperatura baixa.
- **Depois: Claude da GSS**, quando a conta Max estiver conectada e a GSS aprovar o uso da cota: o Hermes chama o
  `sigma-mcp` como servidor MCP com um token de vida curta da própria pessoa (mesmas regras de permissão). A troca é
  só no passo 3 da edge; tela, propostas e permissões não mudam.
- Limites: até 6 chamadas de ferramenta por pergunta, 40 s de teto, histórico das últimas 12 mensagens.

### 3e. Tela
- **Botão "Perguntar ao Sigma"** no cabeçalho do `AppLayout` (todas as telas; no canto ele cobriria o Kanban), atalho `Ctrl+J`.
- **Painel lateral** (Sheet de 420 px): conversa, campo de texto, 3 sugestões por tela (na Prospecção: "como estão
  as campanhas hoje?"; no BI Escalas: "onde tem furo esta semana?").
- **Cartão de proposta:** título ("Criar campanha Pediatria RS" / "Mudar 2 itens da campanha X"), lista antes → depois,
  botões **Confirmar** e **Descartar**; depois do clique, "Feito. Campanha criada pausada com 312 médicos" com link.
- Resposta sempre com rodapé curto da fonte ("Dado de 21/11 18h06, Dr. Escala").
- Carregar a skill `qualidade-de-tela` antes; portão visual em 1440 e 1024 px (ninguém usa o Sigma no celular).

### 3f. Registro
`assistente_conversas` (usuário, criada, última) e `assistente_mensagens` (papel, texto, ferramentas chamadas com
argumentos e hash, modelo, tempo, erro). A aba Configurações › Agente do Sigma ganha o filtro "dentro do Sigma".

### 3g. Domínios novos (fases 2 a 4)
Cada um pelo molde da §3i do protocolo (módulo, arquivo de casos, `PROTOCOLO_VERSAO` sobe, nasce sem papel nenhum):
- **licitações:** novas que chegaram (por data de captação), disputas da semana, situação de um edital, análise;
- **contratos:** vencimentos, itens e valores por papel, médicos vinculados;
- **processos:** manual curto do Sigma (`docs/manual-sigma/*.md`, uma página por área, escrita a partir do que existe
  de fato) servido como guia; sem página, a IA diz "não sei" em vez de inventar.

## 4. Fora de escopo
- Ações além de campanhas (mover card de licitação, mexer em contrato, enviar mensagem a médico): só leitura nesta
  capacidade.
- Excluir campanha ou apagar leads pela IA.
- Conversa com médico ou dado de paciente no prompt.
- Uso no celular e áudio.
- Trocar o motor para o Claude antes de a conta Max estar conectada e a GSS aprovar a cota.

## 5. Riscos, pegadinhas e dependências
- **Permissão vazando pelo service role:** as ferramentas usam `svc` (ignora RLS). A barreira é a lista de domínios e
  ferramentas montada por pessoa (§3b). Teste obrigatório: usuário sem `disparos` não recebe nenhuma ferramenta de
  campanha nem resposta sobre campanha.
- **Prompt injection pelo dado:** nome de campanha, texto de edital e briefing são dado, nunca instrução. A IA não
  executa nada sem o clique; o payload da proposta é validado de novo na RPC.
- **IA inventando processo:** sem página no manual, resposta "não sei, procure X". Manual escrito a partir do código.
- **Custo e cota:** Gemini por chamada (barato); Claude Max dividido com o uso diário da GSS.
- **Divergência com o Claude dos sócios:** mesma ferramenta, mesmo hash; a bateria de consistência roda depois de
  todo deploy que mexer em domínio.
- **Bloqueio por pessoa** (`usuario_modulos_bloqueados`) hoje só vale no front: `pode_modulo` corrige no banco.

## 6. Plano de execução (cada item ≈ 1 commit)
- [x] T1 — Banco: `pode_modulo`, `assistente_conversas`, `assistente_mensagens`, `assistente_propostas`,
      `assistente_confirmar`; checagem de `pode_modulo` dentro de `campanha_assistente_criar`; testes de banco.
- [x] T2 — `campanha_assistente_editar` com lista branca e validações iguais às da tela; testes.
- [x] T3 — Edge `sigma-assistente`: auth, domínios por pessoa, laço com Gemini, propostas, registro; testes Deno
      (permissão, limite de chamadas, proposta sem gravar).
- [x] T4 — Ferramentas de proposta no domínio campanhas (`campanhas_propor_criacao`, `campanhas_propor_edicao`),
      que só aparecem para quem pode; casos na bateria.
- [x] T5 — Tela: botão, painel, cartão de proposta, sugestões por tela; portão visual 1440/1024.
- [x] T6 — Domínio licitações (fase 2) + casos + bateria. (21/11: 4 ferramentas, protocolo v1.2.0, bateria 18/18; no MCP liberado só para admin)
- [ ] T7 — Domínio contratos (fase 3) + casos + bateria.
- [ ] T8 — Manual curto do Sigma e domínio processos (fase 4).
- [ ] T9 — Motor Claude da GSS (quando a conta Max estiver conectada e a GSS aprovar).

## 7. Critério de pronto
- Pergunta de escala e de campanha no chat dá o mesmo número que a tela e que o Claude dos sócios (bateria ok).
- Usuário sem `disparos` não vê nada de campanha; usuário com `disparos` cria uma campanha pelo chat e ela nasce igual
  à do assistente de tela; usuário sem papel de edição não consegue editar nem pelo cartão (RPC recusa).
- Toda ação confirmada aparece no registro com quem, quando, antes e depois.
- Portão visual com 0 falhas em 1440 e 1024 px; testes Deno e de banco passam.

## 8. Autonomia e direitos de decisão
O operador decide nomes, prompts e layout dentro deste desenho. Volta ao Raul: qualquer ação de escrita fora de
campanhas, mudança na regra de quem pode, troca de motor, e o que entra no manual sobre processo da GSS que não
estiver no código.

## Estado (21/11/2026)
- Fase 1 no ar: banco (`20261121220000_assistente_ia_sigma.sql`), edge `sigma-assistente`, painel
  `src/components/assistente/AssistenteSigma.tsx`. Testes: 6 Deno (`_shared/assistente_test.ts`) e de banco em transação
  (prévia, confirmação, recusa sem permissão, campo fora da lista). Portão visual 0 falhas em 1440 e 1024 px.
- `sigma_guia` e `sigma_dominios` ficam fora do chat: o guia já vai nas instruções e a volta extra custava ~15 s.
- Tempo de resposta medido: ~7 s com uma ferramenta, ~15 a 30 s com duas ou mais.
