---
tags: [arquitetura, sigma-gss, plano-mestre]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-06
status: ativo — FONTE DE VERDADE do roadmap da máquina de prospecção
repo: GSS-Interprise/sigma-new
base: [.claude/plano-campanhas-ia-vs-manual.md, horario-inteligente-campanhas-ia.md, bloco-t-rotas-prospeccao.md, sidebar-agrupada-dominio.md, templates-email-por-campanha.md, chips-disparo-runtime.md]
---

# 🎯 Plano Mestre — Máquina de Prospecção GSS (consolidado)

> Amarra e indexa: `plano-campanhas-ia-vs-manual.md` (R1-R11), `horario-inteligente`, `bloco-t-rotas`, `sidebar-agrupada`, `templates-email`, `chips-disparo-runtime`. Cada um segue como doc de capacidade com tarefas finas; este é o mapa que conecta tudo.

**Stakeholders:** Raul (dev/decisor técnico) · Ramone + Dr. Michael (direção) · equipe prospecção (Bruna lidera + Letícia, Ester, Kezia, Antônia, Lidyanne).

**Meta de negócio:** **2.000–5.000 disparos/dia**, máquina **estável**, **zero erros recorrentes** (reconexão de chip, envio pela equipe, QR), visibilidade total (dashboard), equipe operando sozinha no Sigma (hoje opera fora, em planilha). Hoje: ~25–35/dia efetivos — insuficiente.

**Princípio:** seguir à risca, soluções inteligentes (avisos "Necessário reconectar WhatsApp X"), fix de raiz — sem gambiarra.

---

## 0. Guardrails anti-ban (base inquebrável)

1. **Máx 35 primeiros-disparos/chip/dia.** "Disparo" = **a 1ª mensagem (saudação fria)** a um lead novo. Respostas IA/cadência **NÃO contam** (são reativas, buckets `resposta_ia`/`cadencia`).
2. **Espaçar os 35 ao longo de 07h–17h BRT** (600 min) → **1 primeiro-envio a cada ~12–25 min/chip** (jitter em MINUTOS, nunca segundos, nunca rajada). Cada chip tem o dia todo pra seus 35.
3. **Proxy residencial BR sticky por chip** (Bright Data ISP). Datacenter = ban. Avaliar 4G/5G móvel.
4. **Nunca martelar poucos chips** pra "fazer número" (risco ban — incidentes 01–03/06).
5. **Spintax/variações** da 1ª mensagem (até 18) — manter. **Chip novo = aquecer** antes de cold. **Manual e IA em chips separados.**
6. Época de eleição = meta mais restritiva, cuidado extra.

---

## 1. Estado atual — ENTREGUE (jun/2026)

| ✅ | O quê |
|---|---|
| Proxy | webshare→**Bright Data** sticky (per-instância + env global). |
| Encoding | `encodeURIComponent` em todas edges Evolution. Fim do "Edge non-2xx" por acento/espaço. Ver `feedback encode-instancename`. |
| Container duplicado | Evolution órfão (Swarm) removido — causava conflito de sessão/flapping. |
| Healthcheck | `chip-auto-reconnect` + cron jobid 22 (5min): reinicia `connecting`, ignora `open`, loga `close`→`needs_qr`. Fim do restart manual. |
| Conversas órfãs | 478 migradas de instâncias mortas→vivas (0 dup). |
| Opt-out bug | chips manuais fora do bridge IA; 5 falsos-positivos revertidos. |
| Visibilidade campanhas | default "Todos" (líder/gestor/equipe veem todas). |
| QR UX | aviso instância não-selecionada + edge faz restart+poll até QR. |
| Templates por campanha | remetente/oportunidade por campanha + Mustache (T1-T10). |

**Diagnóstico de raiz (sessão 05-06/06):** `connecting` = latência proxy residencial × `defaultQueryTimeoutMs` 60s **hardcoded** no Baileys → flapping. Evolution v2.3.7 não expõe timeout por env. Ver `reference_chip_connecting_flapping`.

## 1b. Já construído — REAPROVEITAR (não recriar)
- `campanhas.tipo_campanha`='prospeccao', `tipo_envio`='ia'|'manual'.
- **`campanha_lead_tasks`** (migration 20260524) — tarefas por lead/canal, trigger gera 6 tasks (whatsapp_1/2/3, email, instagram, telefone).
- Componentes **DisparoManual** (`useDisparoManual`, `DisparoManualLeadPanel`, `DisparoManualLeadsColumn`).
- Sigzap: conversa+histórico WhatsApp do lead.
- `DisparosCampanhas` (multicanal) + `CampanhasProspeccao` (IA) + `CaptacaoKanban` (acompanhamento).
- Views `vw_campanhas_dashboard` etc. (BI parcial).
- **Dedup de leads:** índices únicos `chave_unica`, `cpf`, `phone_e164`. `enrich-lead` edge. 288k leads hoje.

---

## 2. Requisitos consolidados (R1-R11 das reuniões + novos N1-N5)

| # | Requisito | Origem | Estado | WS |
|---|---|---|---|---|
| R1 | Indicador UI: campanha rodando × parada por falta de chip + "reconectar WhatsApp X" | Raul+Bruna | ❌ | WS1/WS7 |
| R2 | Card de campanha automatizada **abre** detalhe (hoje nem abre) | Bruna | ❌ | WS3 |
| R3 | Duplicar campanha IA→manual (3-pontinhos) com **split de leads** | Bruna/Raul | ❌ | WS4 |
| R4 | Fluxo manual = **tarefas por lead/canal** (1º/2º contato, ligação, email, IG, LinkedIn) | Bruna | ⚙️ `campanha_lead_tasks` | WS4 |
| R5 | Separação automática listas IA × manual (lead não nas duas) | Bruna/Raul | ❌ | WS4 |
| R6 | Relatórios/BI (IA×manual, por canal/campanha, exportável p/ Dr. Michael) | Bruna | ⚙️ views | WS7 |
| R7 | Ver conversa do lead (IA+manual) **dentro do card/campanha** | Bruna | ⚙️ Sigzap | WS6 |
| R8 | Proposta **multi-local/hospital** (1 contrato, vários hospitais/cidades) | Bruna | ❌ | WS5 |
| R9 | Default 35 disparos/chip/dia | Rubens | ⚙️ limite existe | WS2 |
| R10 | Instagram/LinkedIn discovery (perfil do médico) — custo, parceiro Life's Hub | Bruna | ❌ backlog | backlog |
| R11 | Treinamento equipe (sexta 14h + semana seguinte) | Bruna | — | operacional |
| **N1** | **Disparo em minutos** (1º envio espaçado 07-17h), não segundos/rajada | Raul | ❌ | WS2 |
| **N2** | **IA absorve contexto da criação** da campanha (briefing→prompt) | Raul | ❌ | WS3 |
| **N3** | **Importação CFM** (~752k médicos ativos) + enriquecimento gradual + dedup | Raul | ❌ | WS8 |
| **N4** | **WhatsApp dentro do card do lead** | Raul | ⚙️ Sigzap | WS6 |
| **N5** | **Reorg rotas /prospeccao + sidebar agrupada** | Raul | ❌ arquitetado | WS9 |

---

## 3. Workstreams

### WS1 — Estabilidade de chip & conexão (R1) — zero erro de reconexão
healthcheck ✅. Falta UI:
- [ ] **Indicador de chip (R1):** badge 🟢 online · 🟡 reconectando · 🔴 **"Necessário reconectar WhatsApp X"** + botão QR. Fonte: `connectionState` + `chip_auto_reconnect_log`.
- [ ] **Aviso proativo** quando chip de campanha ativa fica `close` > N min.
- [ ] **Painel "Saúde dos Chips"**: estado, último reconnect, precisa-QR, disparos hoje/teto.
- [ ] (raiz, opcional) forkar Evolution `defaultQueryTimeoutMs:120000` OU proxy 4G.

### WS2 — Disparo inteligente (R9 + N1) — janela + espaçamento em minutos
base: `horario-inteligente-campanhas-ia.md` (janela). Falta o pacing:
- [ ] **Janela horária/campanha** (07-17h, dias úteis) + guard no `campanha-disparo-processor` (4 colunas — ver doc).
- [ ] **Pacing 35/dia em minutos:** processor agenda próximo 1º-envio = `now()+random(12-25min)`, teto 35/dia, dentro da janela, **só bucket cold_disparo**. Nunca rajada.
- [ ] **Limite por bucket:** 35/dia conta só primeiros-contatos; respostas IA/cadência fora.
- [ ] Critério: log mostra ~35 envios espalhados 07-17h, ~1/15-20min, nunca de madrugada.

### WS3 — Campanhas IA (R2 + N2)
- [ ] **Detalhe da campanha automatizada abre** → Kanban funil + relatório + leads + chips + status.
- [ ] **IA absorve briefing da criação** — especialidade/cidade/hospital/oportunidade/valores/remetente da campanha viram contexto no prompt do `campanha-ia-responder` (sem reconfigurar à mão).

### WS4 — Campanhas Manuais (R3+R4+R5) — núcleo da dor da Bruna
infra parcial (`campanha_lead_tasks`, DisparoManual). Finalizar+expor:
- [ ] **Duplicar IA→manual** com **split de leads** (lead sai da fila IA, não fica nas duas).
- [ ] **Tarefas por lead/canal** espelhando a planilha: 1º/2º contato, ligação, email, IG, LinkedIn; status 🟡 sem resposta · 🔴 negou · 🟢 conversando.
- [ ] **Atribuição por operadora** + produtividade.
- [ ] Critério: Bruna duplica IA→manual, pega X leads, trabalha tasks por canal no Sigma (substitui planilha).

### WS5 — Wizard de campanha (R8) — vagas próximas/multi-local
- [ ] **Proposta multi-hospital/cidade** (1 contrato, N localizações — ex: Tubarão 3 unidades).
- [ ] **Sugerir vagas semelhantes/região próxima** (especialidade + raio geográfico).
- [ ] **Duplicar/pré-preencher** a partir de outra campanha.

### WS6 — Conversas/Sigzap (R7 + N4) — WhatsApp no card
robustez ✅ (encoding, órfãs). Falta o card:
- [ ] **WhatsApp dentro do card do lead** — ver/responder a conversa (IA+manual) sem sair pra Conversas.
- [ ] **Histórico cross-canal** no card (WhatsApp+email+tasks).

### WS7 — Monitoramento & Dashboard (R1+R6)
- [ ] **Dashboard BI** (Dr. Michael): disparos/dia, taxa resposta, funil, **IA×manual lado a lado**, por canal/campanha, exportável.
- [ ] **Painel saúde operacional** (chips online/offline/precisa-QR, disparos hoje vs teto).
- [ ] **Avisos inteligentes**: "campanha X parada por falta de chip", "reconectar WhatsApp Y".

### WS8 — Importação CFM + enriquecimento + dedup (N3) ⭐
**Fonte:** VPS `cfm-postgres` → db `cfm` → tabela **`cfm.medicos` = 978.332 médicos**, dos quais **751.800 ATIVOS (Regular/cod `A`)** ← alvo. Excluir Falecido (40,5k), Cancelado (50,6k), etc. **Transferido (133k) = mesmo médico em outra UF** (cuidado dedup). Campos: `nu_crm`, `sg_uf`, `nm_medico`, `especialidade`, `situacao`, `dt_inscricao`, instituição, `hash_dados`. **Sem telefone/email.**
**Alvo:** `leads` (Supabase; dedup por `chave_unica`/`cpf`/`phone_e164`; só 16,9k têm CRM hoje).
**Objetivo:** Leads tab mostra **médicos ATIVOS do Brasil** → equipe analisa estratégia ANTES de criar campanha. Enriquecimento **gradual** (controle de custo).
- [ ] **Pipeline import** `cfm.medicos (cod_situacao='A')` → `leads`. Definir transporte (cfm-postgres está na rede `easypanel` da VPS, Supabase é cloud → provável dump+import por lote, ou edge/job que lê via conexão direta ao Postgres da VPS).
- [ ] **Filtrar só ativos** (`cod_situacao='A'`, ~752k) — Raul: "o ideal é pegar os ativos".
- [ ] **Dedup robusto:** chave médico = **`nu_crm`+`sg_uf`** → setar `leads.crm`, `leads.uf`, `chave_unica='crm_<uf>_<crm>'`. **Match nome+UF (fuzzy) contra os 288k existentes** pra NÃO duplicar (existentes têm phone, não CRM). Tratar Transferido (mesmo médico em UF nova). Idempotente via `hash_dados`.
- [ ] **Importar em lotes** (752k é grande) — incremental.
- [ ] **Enriquecimento gradual** (`enrich-lead` por lote/demanda): lead entra cru (CRM+UF+especialidade), enriquece telefone só quando vai pra campanha ou sob fila controlada.
- [ ] **Leads tab** filtra UF/especialidade/situação/enriquecido.
- [ ] Critério: equipe vê médicos ativos, filtra por especialidade+região, enriquece/dispara subconjunto. Zero duplicata.

### WS9 — Infra & rotas (N5)
- [ ] **Reorg rotas** `/disparos/*`→`/prospeccao/{sub}` + redirects (`bloco-t-rotas-prospeccao.md`, 8 tarefas).
- [ ] **Sidebar agrupada** (`sidebar-agrupada-dominio.md`).
- [ ] **Persistir env Evolution no Easypanel UI** (senão deploy reverte pro webshare). ⚠️ pendente.
- [ ] (opcional raiz) fork Evolution timeout 120s, ou proxy 4G.

### Backlog
- R10 Instagram/LinkedIn discovery (custo Life's Hub). R11 Treinamento equipe (sexta 14h + semana seguinte).

---

## 4. Sequenciamento (fases) — alinhado ao roadmap P0-P3 da Bruna

**Fase A — estabilizar operação (destrava JÁ):** WS1 indicador+aviso QR · WS2 janela+pacing (R9/N1) · persistir env Easypanel · equipe faz QR rescan dos `close`. *(= P0)*

**Fase B — equipe 100% no Sigma:** WS4 manual+tarefas (R3/R4/R5) · WS6 WhatsApp no card (R7/N4) · WS3 detalhe IA (R2). *(= P1)*

**Fase C — escala & inteligência:** WS8 CFM (N3) · WS5 wizard multi-local (R8) · WS3 IA contextual (N2). *(= P2)*

**Fase D — visibilidade & polish:** WS7 dashboard BI (R6) · WS9 rotas+sidebar (N5). *(= P2/P3)*

> Execução tarefa-a-tarefa, PR por tarefa, sem regressão. Cada WS aprofundado num doc de capacidade.

---

## 5. Critérios de "eficiência 100%"
- [ ] Chip cai → reconecta sozinho OU avisa QR claramente. **Zero "Edge non-2xx" surpresa.**
- [ ] Equipe envia/recebe no Sigzap sem erro; vê todas campanhas e conversas.
- [ ] Cada chip espalha ~35 primeiros-disparos entre 07-17h (anti-ban respeitado).
- [ ] Disparos/dia escalam com chips online (2k+ exige ~57 chips — operacional/Bruna).
- [ ] Leads tab com médicos ativos do Brasil (CFM), enriquecimento gradual, zero duplicata.
- [ ] Dashboard: IA×manual, funil, saúde dos chips.
- [ ] Bruna opera campanhas manuais inteiramente no Sigma (planilha aposentada).

## 6. Acessos
- ✅ VPS (SSH root), Supabase (service_role + SBP), Bright Data (API), anon key, cfm-postgres (via VPS).
- ⚠️ **N8N login** — pra ajustar detector opt-out + webhooks.
- ⚠️ **Easypanel login** — persistir env Evolution.

## 7. Referências (docs-base por capacidade)
- `chips-disparo-runtime.md` — runbook runtime/troubleshooting
- `horario-inteligente-campanhas-ia.md` — janela horária (WS2)
- `bloco-t-rotas-prospeccao.md` + `sidebar-agrupada-dominio.md` — rotas/sidebar (WS9)
- `templates-email-por-campanha.md` — templates (entregue)
- `.claude/plano-campanhas-ia-vs-manual.md` — R1-R11 das reuniões (base de WS3/WS4/WS5/WS7)
- memórias: `reference_chip_connecting_flapping`, `feedback_encode_instancename_evolution`, `feedback_proxy_global_fallback`, `reference_bright_data_isp_br`
