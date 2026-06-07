---
tags: [arquitetura, sigma-gss, plano-mestre, spec-driven]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-07
status: ativo — FONTE DE VERDADE do roadmap (v2, Spec-Driven)
repo: GSS-Interprise/sigma-new
---

# 🎯 Plano Mestre — Máquina de Prospecção GSS (v2 · Spec-Driven)

> **Como usar (briefing de nova sessão):** este doc é a fonte de verdade. Comece lendo §0 (metodologia) + §1 (o que já está pronto) + §2 (guardrails) e então pegue a próxima WS em §4 (cada uma em formato spec→plan→tasks→aceite). Cada WS também tem doc próprio em `docs/arquitetura/wsN-*.md`.

**Stakeholders:** Raul (dev/decisor técnico) · Ramone + Dr. Michael (direção) · equipe prospecção (Bruna lidera + Letícia, Ester, Kezia, Antônia, Lidyanne).

**Meta de negócio:** **2.000–5.000 disparos/dia**, máquina **estável**, **zero erros recorrentes** (reconexão de chip, envio pela equipe, QR), visibilidade total (dashboard), equipe operando 100% no Sigma (hoje opera em planilha externa).

---

## 0. Metodologia — Spec Driven Development + pipeline (LER PRIMEIRO)

Toda WS segue **SDD**: nada de código antes da spec.

**Fluxo por WS:**
1. **Spec** (`docs/arquitetura/wsN-*.md`): o quê / por quê / estado atual mapeado / fora de escopo.
2. **Plan**: arquitetura, arquivos-alvo, tarefas atômicas (T1, T2...), riscos.
3. **Tasks**: implementar numa **branch** (`wsN-nome`), tarefa a tarefa, type-check verde.
4. **Review (multi-agente, barato)**: Workflow com **2 lentes Sonnet** (bugs/correção + anti-ban/dados) **escopo no diff** (`git diff main...branch`). PO = Claude (confere contra o critério de pronto).
5. **Gate de merge autônomo:** review sem blocker (após triagem) **+ type-check verde + build verde + smoke-test runtime** (edge: deploy+invoke 2xx; migration: aplicar+verificar; UI: criar/abrir no fluxo) **+ rollback pronto**.
6. **Auto-merge** (squash) → `main`. **Lovable deploya o front da main na hora.** Edges via `supabase functions deploy`.

**Autonomia (decidido com Raul 06/06):**
- ✅ **Auto-merge sozinho:** código frontend, **edge functions** (com smoke-test).
- 🔴 **Precisa OK explícito do Raul (o classificador bloqueia DDL autônomo):** **migrations / RPC / funções DB** e **ops destrutivas/em massa de dados** (ex: importar 752k do CFM). Apresentar o SQL → Raul aprova → aplicar via Management API.
- Decisões de **produto**: default sensato + anotar; só perguntar se molda muito o build (ex: split top-N da WS4).

**Custo calibrado:** preset barato (2 lentes Sonnet, escopo no diff) custou **27k–121k tokens/review** vs 240k do painel Opus inicial. Pegou bugs reais em 100% das WS. Subir pra 3 lentes/Opus só em WS crítica.

**Guard-rail de triagem:** o agente revisor às vezes **exagera** (ex: disse "sync apaga categoria a cada evento" — era falso; PostgREST preserva colunas fora do payload). Sempre **validar o achado** antes de aplicar; descartar o inaplicável (ex: gates de aquecimento interno — warmup é EXTERNO, [[aquecimento-externo-pre-conexao]]).

---

## 1. Estado atual — ENTREGUE (jun/2026)

### Infra/estabilidade (fixes de raiz desta sprint)
| ✅ | O quê |
|---|---|
| Proxy | Bright Data ISP BR sticky por chip (substituiu webshare quebrado) + env global. |
| Encoding | `encodeURIComponent` em todas edges Evolution → fim do "Edge non-2xx" por acento/espaço. |
| Container duplicado | Evolution órfão do Swarm removido (causava conflito de sessão/flapping). |
| **Healthcheck** | edge `chip-auto-reconnect` + cron pg_cron `chip-auto-reconnect-5min` (jobid 22): reinicia `connecting`, ignora `open`, loga `close`→`needs_qr`. Mira só `categoria_uso in (prospeccao_ia,manual,inbound)`. |
| Conversas órfãs | 478 migradas de instâncias mortas→vivas (0 dup). |
| Classificação de chips | `categoria_uso` setado nos ativos; ver §runtime. |

**Causa-raiz do flapping (documentada):** latência do proxy residencial × `defaultQueryTimeoutMs` 60s **hardcoded** no Baileys → loop de reconexão. Evolution v2.3.7 **não expõe** o timeout por env. Mitigação = healthcheck. Raiz (opcional) = forkar imagem (timeout 120s) ou proxy 4G. Ver [[chip-connecting-flapping-causa-e-fix]].

### Features entregues (PRs em produção)
| WS | Entrega | PR | DB |
|---|---|---|---|
| **WS1** | UI de chip: `categoria_uso` **obrigatória na criação** (`EvolutionInstanceDialog`), coluna Categoria + badges 🟡Reclassificar / 🔴Reconectar (`InstanciaConfigTab`), fonte única `src/constants/categorias.ts`. | #1 | — |
| **WS2-A** | Motor de disparo: guard **janela 07-17h dias úteis** + **cap 35 cold/dia POR CHIP** (global) + **espaçamento ~1 cold/chip a cada 15-20min** (substitui rajada). `campanha-disparo-processor`. | #2 | migration `campanhas` janela (4 cols) |
| **WS2-B** | UI da janela no wizard (`JanelaHorarioConfig`) com validação (bloqueia fim≤início / dias vazio). | #3 | — |
| **WS3** | **Já existia** — IA (`campanha-ia-responder`) já interpola os 17 campos do briefing (prompt sigma-v9); detalhe da campanha abre (`CampanhaProspeccaoKanban`). Não recriado. | — | — |
| **WS4** | Duplicar campanha **IA→manual** com **split top-N** (RPC `duplicar_campanha_para_manual` + menu 3-pontinhos no `CampanhaCard` + dialog). Move N frios, gera 6 tasks por canal. | #4 | RPC (migration `20260606170000`) |
| **WS8** ✅ | **Import CFM 752k** (07/06). Staging `cfm_medicos_staging` (espelho dos 751.800 ativos cod A, transporte direto VPS→Supabase via pooler). Merge dedup em 3 camadas (CRM forte → nome+UF exato anti-homônimo → insert cru), idempotente, auditado em `cfm_import_audit`. **Resultado: leads 289k→796k** (506.493 novos + 236.544 ganharam CRM sem duplicar + 18k enriquecidos; 0 duplicata de chave_unica). Validado no piloto RR + Chrome. | — | staging + `cfm_import_audit` (DDL aprovado Raul) |

### Componentes/arquivos-chave criados
- `src/constants/categorias.ts` (fonte única categorias).
- `src/components/campanhas/JanelaHorarioConfig.tsx` (janela).
- `src/components/campanhas/DuplicarCampanhaManualDialog.tsx` (WS4).
- edge `supabase/functions/chip-auto-reconnect/` (healthcheck).
- RPC `duplicar_campanha_para_manual(uuid,int)`.

---

## 1.5 Prontidão das Campanhas — auditoria 07/06 (multi-agente + runtime + visual)

**Veredito:** a máquina de campanhas **JÁ RODA em produção** (cron `job 11` ativo a cada minuto; sexta 05/06 = 429 recebidas + 540 enviadas). Hoje (domingo) fica quieto pela janela 07-17h **dias úteis** — correto.

**Modelo confirmado com Raul (07/06):** disparo ≠ troca de mensagens. **Disparo automático em IA E manual** (mesmo motor `campanha-disparo-processor`, anti-ban: 35/chip/dia **cold**, espaçamento em minutos, janela 07-17h úteis, **multi-chip** round-robin+fallback). A diferença IA×manual é **quem conduz a conversa** (IA vs operadora). A **resposta nunca é barrada pelo cap** (cap conta só `data_primeiro_contato`; resposta tem rate-limit próprio permissivo).

| Capacidade | Status |
|---|---|
| Campanha IA: dispara + responde + handoff | ✅ produção |
| Multi-chip (round-robin + fallback) | ✅ |
| Disparo manual automático (mesmo motor) | ✅ |
| Cap 35/chip só cold; resposta livre em segundos | ✅ |
| **[P0 ✅ 07/06] chip só dispara se `connection_state='open'`** | ✅ deployado (corrige campanha parada por chip caído, ex ULTRASSOM SC) |
| **[P0 ✅ 07/06] campanha manual: IA NÃO responde (operadora conduz)** | ✅ deployado (`receive-whatsapp-messages` checa `tipo_envio`) |
| Modal do lead: conversa WhatsApp + tasks juntas | 🟡 70% — existe no Kanban (`AcompanhamentoLeadPainel`); falta **responder inline** + falta no modal da página `/leads` (`LeadProfile360Modal`) |
| Operadora responder pelo Sigma | 🟡 caminho existe (`send-disparo-manual`, sem gate anti-ban); falta o **botão** no modal |
| Painel saúde de chips (UI) | 🔴 views prontas (`vw_chip_health`), falta a tela |
| Dashboard IA×manual | 🟡 `DashboardCampanhas` + export PDF/Excel ✅; falta segmentar IA×manual |
| Página `/leads` performance (796k) | 🔴 lenta — keyset pagination + índices trgm + count estimado + select reduzido |

**Caminho crítico restante:**
- **P1:** botão "responder" no modal do lead (operadora) · levar conversa+tasks pro modal da `/leads` · badge "lead manual respondeu" (pra operadora ver que tem resposta esperando).
- **P2:** painel saúde de chips · otimização `/leads` · dashboard IA×manual · fila de enriquecimento (506k novos do CFM sem telefone).

**Pré-requisitos operacionais (equipe, não-dev):** reconectar chips `close` (28 manual + vários IA) via QR.

---

## 2. Guardrails anti-ban (inquebráveis)
1. **Máx 35 primeiros-disparos/chip/dia.** "Disparo" = 1ª msg (cold). Respostas IA/cadência NÃO contam (buckets `resposta_ia`/`cadencia`).
2. **Espaçar 07-17h BRT** (~1 cold/chip a cada 15-20min). Nunca rajada, nunca madrugada.
3. **Aquecimento é EXTERNO** (equipe aquece antes de conectar). Sem gate de warmup interno no Sigma. [[aquecimento-externo-pre-conexao]]
4. Proxy residencial BR sticky por chip. Datacenter = ban. Spintax. Manual e IA em chips separados.
5. Regra por `categoria_uso`: 35/dia só pra `prospeccao_ia`; `manual` = operadora; `inbound` = só recebe; `pessoal_restrito`/`suporte` = fora da máquina.

---

## 3. Modelo de dados (referência rápida)
- `chips` (Evolution `instance_id`, `categoria_uso`, `status`, `connection_state`) → `sigzap_instances` (FK `chip_id`) → `sigzap_conversations` (FK `instance_id`) → `sigzap_messages`.
- `campanhas` (`tipo_envio` ia|manual, `briefing_ia` jsonb, `chip_ids`, `horario_*`, `dias_semana`, `next_batch_at`) → `campanha_leads` (FK `campanha_id`, `lead_id`, `status` frio→contatado→…, `chip_usado_id`, `data_primeiro_contato`) → `campanha_lead_tasks` (6 tasks/canal, trigger AFTER INSERT só se manual/ambos).
- `leads` (288k; únicos: `chave_unica`, `cpf`, `phone_e164`; `crm`,`uf`,`especialidade`). `enrich-lead` edge enriquece telefone.
- Anti-ban: `pre_send_check` RPC (per-chip, atômico), `chip_send_log`, `antiban_global_config` (`warmup_curve=[10,20,35,50,60,70,80]`).
- **CFM:** VPS `cfm-postgres` → db `cfm` → `cfm.medicos` (978.332; **751.800 ativos cod `A`**).

---

## 4. Workstreams restantes (formato Spec-Driven)

### WS5 — Wizard: proposta multi-local / vagas próximas (R8)
**Spec:** 1 campanha/proposta com **vários hospitais/cidades** (ex: Tubarão SC, 3 unidades). Hoje o wizard (`NovaCampanhaProspeccaoDialog`) só tem 1 hospital + 1 cidade (briefing) + 1 UF (`regiao_estado`).
**Plan:** `briefing_ia` é jsonb → adicionar `locais: [{hospital, cidade, uf}]` (array) sem migration (campo jsonb). UI: bloco "Locais" repetível no wizard. O prompt (`campanha-ia-responder buildPrompt`) passa a listar os locais. Sugestão de vagas próximas = filtro por especialidade + UF/raio (usar `leads.uf`/`cidade`).
**Tasks:** T1 estado `locais[]` + UI repetível no wizard. T2 salvar em `briefing_ia.locais`. T3 `buildPrompt` renderiza locais. T4 (opcional) sugestão de região próxima no preview.
**Aceite:** criar campanha com 2+ locais; IA menciona o local certo; sem migration.
**Risco:** retrocompat — briefing antigo sem `locais` deve continuar (fallback pra hospital/cidade single).

### WS6 — WhatsApp dentro do card do lead (R7/N4) — quase pronto
**Spec:** ver/responder a conversa WhatsApp (IA+manual) dentro do card do lead, sem ir pra Conversas.
**Estado:** **já existe** — `AcompanhamentoLeadPainel` tem tab "Conversa" via `LeadConversaUnificada` (busca `sigzap_conversations` por `lead_id`). Falta: histórico cross-canal (email/IG) no card + contexto da campanha na conversa.
**Plan/Tasks:** T1 validar o que existe (pode estar 90% pronto — confirmar no Chrome). T2 adicionar aba/secção cross-canal se faltar. T3 mostrar campanha de origem na conversa.
**Aceite:** abrir lead no Kanban → ver/responder WhatsApp no card. (Talvez já passe hoje — validar antes de codar.)

### WS7 — Monitoramento & Dashboard (R1/R6)
**Spec:** dashboard BI (Dr. Michael): disparos/dia, taxa resposta, funil, **IA×manual lado a lado**, por canal/campanha, exportável. + painel saúde de chips (online/offline/precisa-QR, disparos hoje vs teto). + avisos "campanha X parada por falta de chip".
**Plan:** views já existem (`vw_campanhas_dashboard`, `vw_campanha_tasks_dashboard`). Painel de chips usa `connectionState` + `chip_auto_reconnect_log`. Pode precisar de view nova pra IA×manual agregado (migration → aprovação).
**Tasks:** T1 painel saúde de chips (R1 — reusa dados do healthcheck). T2 BI funil IA×manual. T3 export. T4 avisos campanha-parada.
**Aceite:** Dr. Michael vê números IA×manual + equipe vê saúde dos chips sem perguntar ao Raul.

### WS8 — Importação CFM + enriquecimento + dedup ⭐ (N3) — ✅ ENTREGUE 07/06

> **Status:** import concluído. Transporte (752k→staging) + merge dedup 3-camadas idempotente rodados. Base leads 289k→**796k**. Falta só **T6 (fila de enriquecimento gradual de telefone)** — os 506k novos entraram sem telefone. Follow-ups abertos: varredura de ~3.485 duplicatas pré-existentes por CRM (merge via `merged_into_id`), limpeza de 195 leads com UF inválida. Auditoria/reversão em `cfm_import_audit` (lotes `RR-piloto`+`BR-massa`).

**Spec:** Leads tab mostra **médicos ATIVOS do Brasil** (~752k) pra equipe analisar estratégia ANTES de criar campanha. Enriquecimento (telefone/email) **gradual e sob custo controlado**.

**Fonte (mapeada):** VPS `cfm-postgres` (container `ec132a8611cd`), db `cfm`, user `cfm_user`, tabela **`cfm.medicos`**:
- Colunas: `nu_crm`, `sg_uf`, `nm_medico`, `especialidade`, `situacao`, `cod_situacao`, `dt_inscricao`, instituição, `hash_dados`/`security_hash` (dedup do scraper), `first_seen_at`/`updated_at`/`last_run_id`. **Sem telefone/email.**
- Distribuição: total **978.332**. `cod_situacao='A'` (Regular) = **751.800 ← ALVO**. Excluir Falecido (40.559), Cancelado (50.656), etc. **Transferido (T, 133.147) = mesmo médico em outra UF** (cuidado dedup).

**Alvo:** `leads` (Supabase, 288k atuais; únicos `chave_unica`/`cpf`/`phone_e164`; só 16,9k têm CRM).

**Plan — pipeline (precisa aprovação DDL p/ staging + import):**
1. **Transporte VPS→Supabase** (cfm-postgres é interno à rede da VPS, não exposto). Opções: (a) `pg_dump` do subset ativo na VPS → COPY pra tabela staging no Supabase; (b) **script na VPS** que lê `cfm.medicos` em lotes e faz UPSERT via REST/SQL no Supabase (recomendado — incremental + idempotente via `hash_dados`). Decidir na sessão.
2. **Staging:** tabela `cfm_medicos_staging` (espelho do subset ativo) — permite reprocessar sem re-baixar.
3. **Dedup → leads:**
   - Chave do médico = **`nu_crm` + `sg_uf`**. Setar `leads.crm`, `leads.uf`, `chave_unica = 'crm_<uf>_<nu_crm>'`.
   - Insert idempotente (índice único `chave_unica` já protege). Re-rodar não duplica.
   - **Match contra os 288k existentes (que têm phone mas não CRM):** fuzzy por **nome normalizado + UF**. Se match → atualizar o lead existente com CRM/UF (NÃO inserir novo). Se não → inserir novo (cru). Normalização: upper, sem acento, sem prefixo Dr/Dra, colapsar espaços.
   - **Transferido:** mesmo `nu_crm` em UF diferente = mesmo médico → dedup por nome+CRM raiz (evitar 2 leads).
4. **Filtro ATIVOS** (`cod_situacao='A'`) — Raul: "o ideal é pegar os ativos".
5. **Lotes** (752k é grande): importar incremental (ex: 5-10k/lote), logar progresso, sem travar o banco.
6. **Enriquecimento gradual:** lead entra cru (CRM+UF+especialidade, sem telefone). `enrich-lead` por **fila/demanda** (só enriquece quando vai pra campanha ou sob batch controlado) — controla custo.
7. **Leads tab:** filtros UF / especialidade / situação / enriquecido (cru vs com telefone).

**Tasks:** T1 decidir+montar transporte (script VPS ou dump). T2 staging table (DDL→aprovar). T3 dedup+upsert idempotente (RPC ou job, DDL→aprovar) — testar em lote pequeno (1k) primeiro. T4 fuzzy match vs existentes. T5 filtros na Leads tab. T6 fila de enriquecimento gradual.
**Aceite:** equipe vê médicos ativos do BR, filtra por especialidade+região, enriquece/dispara subconjunto. **Zero duplicata** (re-rodar import = idempotente). Custo de enriquecimento sob controle.
**Riscos:** 🔴 import de 752k = op em massa → **lote-teste pequeno + aprovação Raul**. Fuzzy match falso-positivo (médico errado) → começar conservador (match exato normalizado). cfm-postgres não exposto → transporte via VPS.

### WS9 — Infra & rotas (N5)
**Spec/Plan:** reorg `/disparos/*`→`/prospeccao/{sub}` + redirects (`bloco-t-rotas-prospeccao.md`, 8 tasks) + sidebar agrupada (`sidebar-agrupada-dominio.md`). Frontend puro (auto-mergeável).
**Aceite:** ver os 2 docs (critério de pronto neles).

### Hardening / follow-ups (quando estabilizar)
- **Cap atômico no `pre_send_check`** (resolve corrida TOCTOU cross-campanha do cap 35/chip — hoje soft-cap). Precisa aprovação DDL. Conta `chip_send_log` (tentativas), com lock por chip.
- **Raiz do flapping:** forkar Evolution (timeout 120s) OU proxy 4G móvel.
- **Limpar instâncias duplicadas por número** (Leticia-radio/radio2 mesmo número; etc.) — decisão do Raul via UI (WS1 já dá visibilidade).
- **WS2-B:** inline reclassify de categoria na lista de instâncias (hoje via aba Chips).

### Backlog
- R10 Instagram/LinkedIn discovery (custo Life's Hub). R11 Treinamento equipe.

---

## 5. Pendências operacionais (Raul/equipe — não bloqueiam dev)
- **Equipe:** QR rescan dos chips `close` → destrava volume de disparo. (WS1 mostra quais.)
- **Raul:** persistir env do proxy no **Easypanel** (login web) — senão um redeploy reverte pro webshare quebrado. Risco latente.
- **Escala:** ~57 chips online p/ 2.000/dia (operacional/Bruna + UberChip a avaliar).

---

## 6. Briefing técnico (acessos / comandos / como retomar)
- **Repo:** `C:\Users\rauls\sigma-new` (branch `main`, push direto → Lovable deploya). Commits só com identidade do Raul, sem co-author.
- **Acessos (em memória):** VPS SSH `root@147.93.71.48` (Easypanel), Supabase (service_role JWT + SBP token em `reference_supabase_token.md`), Bright Data API, anon key, cfm-postgres (via VPS), N8N CLI (`docker exec disparador_n8n n8n …`).
- **SQL prod:** Management API `POST https://api.supabase.com/v1/projects/zupsbgtoeoixfokzkjro/database/query` com SBP. **Sempre PowerShell** (não Bash) p/ evitar mangle de acento; melhor ainda usar coluna não-acentuada ou JS no browser p/ UTF-8.
- **Deploy edge:** `npx supabase functions deploy <nome> --project-ref zupsbgtoeoixfokzkjro` (env `SUPABASE_ACCESS_TOKEN`=SBP).
- **Invocar edge (DNS local não resolve `.functions.supabase.co`):** usar `https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/<nome>`.
- **Cron de minuto (job 11)** dispara `campanha-disparo-processor` p/ campanhas ativas com `next_batch_at<=now()` OU (null + frio). Healthcheck = jobid 22.

## 7. Referências (docs por capacidade)
- WS entregues: `ws1-chip-ui.md`, `ws2-disparo-em-minutos.md`, `ws4-manual-duplicar-split.md`.
- Pendentes/base: `horario-inteligente-campanhas-ia.md`, `bloco-t-rotas-prospeccao.md`, `sidebar-agrupada-dominio.md`, `templates-email-por-campanha.md`, `chips-disparo-runtime.md`, `.claude/plano-campanhas-ia-vs-manual.md` (R1-R11).
- Memórias: `chip-connecting-flapping-causa-e-fix`, `aquecimento-externo-pre-conexao`, `feedback_encode_instancename_evolution`, `feedback_proxy_global_fallback`, `reference_bright_data_isp_br`, `reference_supabase_token`.
