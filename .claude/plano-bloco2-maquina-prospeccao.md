# Plano Bloco 2 — Máquina de Prospecção Automática

**Data:** 18/04/2026 (atualizado após análise dos commits do Ewerton)
**Status:** Em execução (fim de semana 18-19/04)
**Responsáveis:** Raul + Claude (banco/frontend/backend) | Ewerton (N8N/automações na segunda)

---

## Visão

Bruna abre modal → configura campanha → sistema roda sozinho 24h → operador só recebe lead quente.

10+ campanhas em paralelo, ~1.000 médicos/dia, IA conversando, chips com fallback.

---

## Modal de criação de campanha (o que Bruna preenche)

1. **Especialidade** — filtro (ex: Intensivista Pediátrico) → 135 especialidades disponíveis
2. **Região** — estado + cidade(s) alvo
3. **Serviço/Proposta** — o que está oferecendo (plantão UTI, rotineiro, etc.) + valores
4. **Chip WhatsApp** — qual instância usar + fallback
5. **Limite diário** — quantos disparos/dia nessa campanha
6. **Briefing pra IA** — perguntas sobre a campanha que viram o prompt:
   - Qual o serviço? Qual o diferencial? Qual o valor? Qual a região?
   - Quais objeções comuns? Como responder?
   - Isso vira o contexto que a IA usa pra conversar com cada médico

---

## Motor automático (roda sem intervenção)

1. **Seleciona leads** — pool dinâmico: especialidade + região + não bloqueado + não contatado nessa campanha
2. **Dispara WhatsApp** — mensagem inicial via chip configurado, respeita limite diário
3. **IA conversa** — quando médico responde, IA assume com o briefing da campanha
4. **IA qualifica** — identifica interesse real, responde perguntas, aquece
5. **Handoff** — lead quente → notifica operador → operador assume e fecha
6. **Fallback** — chip caiu → próximo chip assume automaticamente

---

## Pipeline por campanha

```
FRIO → CONTATADO → EM CONVERSA → AQUECIDO → QUENTE → CONVERTIDO
```

Um lead pode estar QUENTE na campanha de Pediatria-RJ e FRIO na de Anestesio-SP.

---

## O que já existe

### Infra base (construída antes)
| Componente | Status |
|---|---|
| 135 especialidades + 170k vínculos na junction | Pronto |
| Leads com região (estado/cidade) | Pronto |
| Chips/instâncias WhatsApp | Pronto |
| Disparo em massa (disparos_campanhas + disparos_contatos) | Pronto |
| SigZap (conversas WhatsApp) | Pronto |
| lead_historico (eventos/touchpoints) | Estrutura pronta, falta popular |
| Blacklist/greylist 5 categorias | Pronto |
| Propostas com valores por serviço | Pronto |
| lookup_especialidade com INSERT na junction | Pronto |

### O que o Ewerton já construiu (commits 15-17/04)

**Banco — tabelas novas:**
- `campanha_propostas` — junction campanha → proposta → lista. Campos: campanha_id, proposta_id, lista_id, status, webhook_trafego_enviado_at
- `campanha_proposta_canais` — tracking por canal (7 canais: whatsapp/trafego_pago/email/instagram/ligacao/linkedin/tiktok). Status: pendente/em_andamento/concluido/falha. Trigger auto-cria 7 registros por INSERT (over-engineered)
- `tarefas_captacao` — tarefas por lead+campanha com responsável, prazo, prioridade. Sem UI ainda
- Proposta: 5 colunas de mensagem por canal (mensagem_whatsapp/email/instagram/linkedin/tiktok) + triggers admin-only
- Chips: separação por `tipo_instancia` (disparos vs trafego_pago) via InstanciaConfigTab

**Frontend — componentes:**
- `CampanhaPropostaModal.tsx` — modal dossiê de campanha com 7 abas de canal
- `MensagensCanaisTabs.tsx` — tabs reutilizáveis pra mensagens por canal (5 tabs)
- `CampanhaLeadsList.tsx` — lista de leads da campanha com filtros de status (a contactar/contactados/em aberto/fechados)
- `BrandIcons.tsx` — ícones SVG (WhatsApp, Instagram, LinkedIn, TikTok, Gmail, Telefone, Tráfego)
- `CaptacaoPropostaDialog.tsx` — criação de proposta com mensagens por canal
- `CaptacaoPropostaDetailDialog.tsx` — edição de proposta com admin-only
- `InstanciaConfigTab.tsx` — config de instâncias filtrada por tipo
- `DisparosConfig.tsx` — página com abas "WhatsApp de Disparos" e "Tráfego Pago"

**Hook:**
- `useCampanhaPropostas.ts` — CRUD de campanha_propostas + vínculo com edge function trafego-pago-auto-dispatch

### O que aproveitar do Ewerton
- `campanha_propostas` como bridge (campanha → proposta → lista) — estender com nossos campos
- `campanha_proposta_canais` — tracking por canal funciona, remover auto-create de 7 canais
- `tarefas_captacao` — estrutura ok pra handoff/notificações, precisa de UI
- `MensagensCanaisTabs` + `BrandIcons` — componentes prontos, reutilizáveis
- `CampanhaLeadsList` — reaproveitável pro kanban com ajustes
- Mensagens por canal na proposta — alinha com modelo multi-canal
- Separação de instâncias por tipo — é a flag que propusemos

### O que falta (não existe no que ele fez)
- **`campanha_leads`** — status do lead POR campanha (pipeline FRIO→QUENTE). Ele não tem isso
- **Briefing IA** — nenhum campo pra configurar a IA na campanha
- **Pool dinâmico** — ele usa lista fixa. Nosso plano é filtro automático (especialidade+região)
- **Fallback de chip** — não tem chip_fallback_id
- **Motor de seleção automática** — nenhuma RPC/função pra selecionar leads automaticamente
- **Edge function de IA** — o coração da máquina
- **Lógica de handoff** — notificação quando lead vira QUENTE
- **Dashboard de campanhas** — visão geral com métricas

---

## O que construir neste fim de semana

### Camada 1 — Fundação (banco) — AJUSTADA

Reaproveitar tabelas do Ewerton + adicionar o que falta:

| # | Tarefa | Tipo |
|---|---|---|
| 1.1 | **Estender campanha** (tabela `disparos_campanhas` ou criar nova) com: `especialidade_id`, `regiao_estado`, `regiao_cidades` (array), `briefing_ia` (JSONB), `chip_fallback_id`, `limite_diario`, `pipeline_status_config` | ALTER/CREATE |
| 1.2 | **Criar `campanha_leads`** — lead_id, campanha_id, status enum (frio/contatado/em_conversa/aquecido/quente/convertido), data_status, data_ultimo_contato, metadados JSONB, conversa_id FK nullable | CREATE |
| 1.3 | **Adicionar flags em `chips`** — `pode_disparar` (bool DEFAULT true), `origem_padrao_inbound` (text) | ALTER |
| 1.4 | **Touchpoints em `lead_historico`** — novos valores no enum: export_trafego_pago, inbound_whatsapp, outbound_whatsapp, campanha_status_change | ALTER ENUM |
| 1.5 | **Corrigir trigger de `campanha_proposta_canais`** — não auto-criar 7 canais, criar sob demanda | ALTER TRIGGER |
| 1.6 | **Cleanup especialidades** — executar plano pendente (6 especialidades faltantes + 107 leads do array) | SCRIPT |

**Estimativa:** ~4h

### Camada 2 — Motor (backend)

| # | Tarefa | Tipo |
|---|---|---|
| 2.1 | **RPC `selecionar_leads_campanha(campanha_id)`** — pool dinâmico: JOIN lead_especialidades + filtro região + NOT IN campanha_leads + NOT IN bloqueio + LIMIT (limite_diario) | RPC |
| 2.2 | **RPC `exportar_lista_trafego_pago(campanha_id)`** — gera dados + registra touchpoint | RPC |
| 2.3 | **Trigger fallback de chip** — se chips.status muda pra inativo, campanhas com esse chip migram pro chip_fallback_id | TRIGGER |
| 2.4 | **Trigger handoff** — quando campanha_leads.status = 'quente', insere em `tarefas_captacao` (reusa tabela do Ewerton) com tipo='lead_quente' | TRIGGER |
| 2.5 | **RPC `atualizar_status_lead_campanha()`** — muda status + registra touchpoint em lead_historico | RPC |

**Estimativa:** ~5h

### Camada 3 — Interface (frontend)

| # | Tarefa | Tipo | Reuso Ewerton |
|---|---|---|---|
| 3.1 | **Modal de criação de campanha** — especialidade (dropdown 135), região, proposta, chip+fallback, limite, briefing IA | Componente novo | Reutiliza `MensagensCanaisTabs`, `BrandIcons` |
| 3.2 | **Kanban de pipeline** — campanhas ativas, leads por status, drag-and-drop | Componente novo | Adapta `CampanhaLeadsList` |
| 3.3 | **Dashboard de campanhas** — cards com métricas, lista de campanhas ativas | Componente novo | — |
| 3.4 | **Página de campanha individual** — config, leads, pipeline, métricas, ações | Componente novo | Adapta `CampanhaPropostaModal` |
| 3.5 | **Painel de leads quentes** — notificações de handoff, "assumir conversa" | Componente novo | Reutiliza `tarefas_captacao` |

**Estimativa:** ~8h

### Camada 4 — IA (inteligência)

| # | Tarefa | Tipo |
|---|---|---|
| 4.1 | **Edge Function `campanha-ia-responder`** — recebe msg do SigZap, busca campanha + briefing, responde via Claude API | Edge Function |
| 4.2 | **Detecção de lead quente** — lógica no prompt: sinais de interesse → status QUENTE → dispara handoff | Prompt engineering |
| 4.3 | **Workflow N8N** — orquestração: cron → selecionar leads → disparar → monitorar respostas | N8N (com acesso SSH à VPS) |

**Estimativa:** ~4h

---

## Ordem de execução (fim de semana 18-19/04)

### Sábado 18/04
- **Manhã:** Camada 1 completa (migrations, estender tabelas, criar campanha_leads, flags, enum, cleanup especialidades)
- **Tarde:** Camada 2 (RPCs de seleção, exportação, triggers de fallback e handoff)
- **Noite:** Camada 3 início (modal de criação de campanha + dashboard)

### Domingo 19/04
- **Manhã:** Camada 3 (kanban, página de campanha, painel de leads quentes)
- **Tarde:** Camada 4 (edge function IA + workflow N8N via SSH)
- **Noite:** Testes end-to-end, polish, validação

### Segunda 20/04 (Ewerton)
- Conectar suas automações N8N existentes ao novo motor
- Configurar instâncias no ConfigZap com novas flags
- Testar fluxo completo com campanha real
- Ajustar UI existente pra convergir com nova estrutura

---

## Convergência Ewerton — guia de comunicação

**O que dizer pra ele na segunda:**
> "Ewerton, aproveitei tuas tabelas e componentse e construí por cima: agora tem pool dinâmico de leads por campanha, pipeline FRIO→QUENTE por lead, briefing de IA, e fallback de chip. Tuas tabelas campanha_propostas e tarefas_captacao tão integradas. Preciso que tu conecte as automações N8N e configure as instâncias."

**O que NÃO mudar do que ele fez:**
- campanha_propostas — manter, funciona como bridge
- MensagensCanaisTabs — manter, reutilizamos
- Mensagens por canal na proposta — manter
- BrandIcons — manter
- CampanhaLeadsList — manter mas adaptar

**O que simplificar do que ele fez:**
- Trigger de 7 canais auto-criados → criar sob demanda
- 7 canais hardcoded no modal → configurável

---

## Validação pós-construção

- [ ] Criar campanha via modal funciona (especialidade + região + briefing IA)
- [ ] Pool dinâmico filtra leads corretamente (especialidade + região + não bloqueado + não contatado)
- [ ] Lead aparece no kanban com status correto (FRIO→QUENTE)
- [ ] Exportação CSV gera arquivo + registra touchpoint em lead_historico
- [ ] Fallback de chip funciona quando chip inativa
- [ ] IA responde mensagem usando briefing da campanha (Claude API)
- [ ] Lead quente gera tarefa em tarefas_captacao + notificação pro operador
- [ ] Dashboard mostra métricas corretas (ativas, contactados, quentes, convertidos)
- [ ] 2+ campanhas rodando em paralelo sem conflito de leads
- [ ] Componentes do Ewerton continuam funcionando (sem breaking changes)
