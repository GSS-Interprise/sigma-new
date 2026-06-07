---
tags: [arquitetura, sigma-gss, ws8, enriquecimento, lemit, spec-driven]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-07
status: DESENHO (pronto pra executar na próxima sessão)
repo: GSS-Interprise/sigma-new
---

# WS8-T6 — Fila de Enriquecimento Gradual (Lemit)

> **Contexto:** o import CFM (07/06) trouxe **506.493 médicos novos SEM telefone** (só CRM+UF+especialidade). Eles **não disparam** até serem enriquecidos. O import só vira valor real com esta fila. Este doc é o **desenho** pra executar — começar pela seção **Tasks**.

## 0. Spec
Enriquecer telefone/email dos leads (especialmente os 506k novos do CFM) de forma **gradual** e sob **custo controlado** (o Lemit cobra por consulta), **priorizando quem vai pra campanha**. Lead que entra em campanha não pode esperar o batch.

## 1. Estado atual — o que JÁ existe (reaproveitar, não reconstruir)
| Peça | O que faz |
|---|---|
| edge `enrich-lead` | **Receptor**: recebe resultado de pipeline externo (PATCH) e aplica ao lead. Política: never-overwrite nos campos enriquecíveis; `crm`/`nome` overwrite; telefones/emails **deduplicados**. Auth por bearer token (`validate_api_token`). |
| edge `query-leads-for-enrich` | Seleciona leads **não enriquecidos** (`enrich_X=false`) por pipeline, FIFO por `created_at`, `limit` até 10k. Marca `last_attempt_at_X`. |
| edge `query-leads-by-enrich` | Igual, com filtros opcionais (`not_null_fields`: ex só quem tem CRM). Exclui `merged_into_id`. |
| tabela `lead_enrichments` | 1 linha/lead. `enrich_one..five` (bool), `last_attempt_at_X`, `expires_at_X`. Índices parciais `WHERE enrich_X=false`. |
| **Lemit** = `enrich_lemit` → coluna `enrich_three` | Provedor de **CPF/telefone a partir de CRM/nome**. Validade **48 meses**. Já usado no import (origem `CRM-LEMIT`, RPA do Thiago). Token `import-leads-crm-lemit`. |

Pipelines disponíveis: `enrich_v1` (one), `enrich_residentes` (two), **`enrich_lemit` (three)**, `enrich_lifeshub` (four), `enrich_especialidade` (five).

## 2. O que FALTA (construir)
1. **Disparo** — NÃO há cron/N8N que aciona o enriquecimento hoje. Os 506k dormem indefinidamente.
2. **Controle de custo** — nenhum teto. Lemit cobra por consulta → risco de bill shock se rodar tudo de uma vez.
3. **Priorização** — enriquecer on-demand (lead vai pra campanha) antes do batch dos 506k.

## 3. Plan — arquitetura proposta (2 camadas)
**A. On-demand (prioridade alta):** quando um lead **sem telefone** entra numa campanha (`INSERT campanha_leads`), enfileirar pra enriquecimento **imediato**. Garante que leads em uso são enriquecidos primeiro, sem esperar o batch.

**B. Batch gradual (background):** cron diário processa **N leads/dia** (= teto de custo) dos 506k, em ordem de prioridade (ex: por UF/especialidade-alvo das campanhas ativas). Espalhado em horários off-peak.

Mecânica:
- Cron `pg_cron` (ex 4x/dia) → chama `query-leads-for-enrich` (pipeline `enrich_lemit`) com `limit = teto_diario/4`.
- Lote selecionado → consultado no **Lemit** → resultado volta via `enrich-lead` (PATCH).
- **Teto de custo:** config nova (ex `antiban_global_config.enrich_daily_budget`) + check antes de cada lote.
- Telefone enriquecido **valida no WhatsApp** (`checkIsOnWhatsapp` via `evolution-api-proxy`) antes de marcar disparável.

## 4. Tasks (ordem)
- **T1 [PERGUNTAR Raul/Thiago]** Confirmar **como o Lemit é chamado hoje** (API direta? RPA do Thiago? N8N?) e o **custo por consulta**. Isso define se a fila chama o Lemit ou só prepara os leads pro RPA puxar.
- **T2 [DECISÃO Raul]** Definir **teto de custo/dia** (ex 5.000 enriquecimentos/dia).
- **T3** Trigger on-demand: lead sem telefone entra em campanha → marca enrich prioritário.
- **T4** Cron batch gradual (`pg_cron`) + RPC `processar_batch_enriquecimento` (lote controlado, respeita teto).
- **T5** Quota/teto em `antiban_global_config` + função `check_enrich_quota`.
- **T6** (opcional) Validação WhatsApp do telefone enriquecido antes de disparável.
- **T7** (opcional) Dashboard da fila (enriquecidos/dia, custo, fila restante, taxa de acerto).

## 5. Aceite
- 506k novos enriquecidos **gradualmente** sem estourar o teto/dia definido.
- Lead que vai pra campanha é enriquecido **com prioridade** (não espera o batch).
- Re-enriquecimento respeita a validade (`expires_at` 48m do Lemit).
- Telefone só vira "disparável" após validar no WhatsApp.

## 6. Riscos / a confirmar
- 🔴 **Custo do Lemit por consulta** — decisão de teto é do Raul. Confirmar valor.
- ⚠️ **Como o Lemit é acessado** (RPA Thiago vs API direta vs N8N) — muda a arquitetura do disparo (T1 é bloqueante).
- ⚠️ **Taxa de acerto do Lemit** (% dos CRMs com telefone encontrado) — afeta o ROI.
- ⚠️ Telefone enriquecido pode estar inativo no WhatsApp → validar antes de disparar (não queimar cap do chip).

## 7. Referências
- Edges: `enrich-lead`, `query-leads-for-enrich`, `query-leads-by-enrich`.
- Tabela `lead_enrichments` (migration `20260415205725`).
- Token `import-leads-crm-lemit`.
- Plano-mestre `plano-mestre-maquina-prospeccao.md` §WS8 + §1.5.
- Import CFM: 506k novos sem telefone (sessão 07/06).
