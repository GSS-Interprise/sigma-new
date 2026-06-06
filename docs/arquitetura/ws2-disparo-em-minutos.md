---
tags: [arquitetura, sigma-gss, ws2, disparo, antiban]
projeto: SigmaGSS
data: 2026-06-06
status: em execução (autônomo)
repo: GSS-Interprise/sigma-new
parent: plano-mestre-maquina-prospeccao.md (WS2) + horario-inteligente-campanhas-ia.md
---

# WS2 — Disparo inteligente: janela 07-17h + 35/chip/dia espaçado em minutos

> **1 frase:** cada chip de prospecção espalha **no máx 35 primeiros-disparos por dia**, **1 a cada ~15-20 min**, só dentro da **janela 07h-17h** (dias úteis) — nunca em rajada, nunca de madrugada.

## 1. Estado atual (mapeado — `campanha-disparo-processor`)
- Limite é **por campanha** (`limite_diario_campanha`, default 120), **não por chip**.
- Envia em **rajada**: `batch_size` (10) com gaps 8-25s, pausa 5-10min entre batches.
- **Sem guard de janela** (causou disparo às 04h).
- `warmup_curve=[10,20,35,50,60,70,80]` em `antiban_global_config` — curva interna. **Com aquecimento EXTERNO ([[aquecimento-externo-pre-conexao]]), ignoramos a curva interna pro cold** e usamos cap flat.

## 2. Design
### Guardrails (decisões registradas)
- **Disparo = 1ª mensagem (cold).** Só o bucket `cold_disparo` entra no cap/espaçamento. Respostas IA/cadência NÃO contam.
- **Cap flat 35/chip/dia** (global por chip, somando todas as campanhas) — não a curva até 80. Editável via config se precisar.
- **Janela 07h-17h BRT, dias úteis** (default; editável por campanha).
- Aplica só a chips `categoria_uso='prospeccao_ia'`. Manual/inbound fora.

### T1 — Migration `campanhas` (janela)
```sql
ALTER TABLE campanhas
  ADD COLUMN IF NOT EXISTS horario_inicio_brt smallint DEFAULT 7  CHECK (horario_inicio_brt BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS horario_fim_brt    smallint DEFAULT 17 CHECK (horario_fim_brt BETWEEN 1 AND 24),
  ADD COLUMN IF NOT EXISTS dias_semana smallint[] DEFAULT ARRAY[1,2,3,4,5] CHECK (dias_semana <@ ARRAY[1,2,3,4,5,6,7]),
  ADD COLUMN IF NOT EXISTS horario_inteligente_ativo boolean DEFAULT true;
UPDATE campanhas SET horario_inteligente_ativo = true WHERE tipo_envio = 'ia';
```

### T2 — Guard de janela no processor (early return 200)
No início, se `horario_inteligente_ativo` e (hora BRT fora de [inicio,fim) OU dia fora de dias_semana) → limpa `next_batch_at`, reagenda pro próximo início de janela, retorna 200 `skipped:fora_janela`.

### T3 — Cap 35/chip/dia (cold) + espaçamento em minutos
- Antes de mandar, pra cada chip candidato: contar `cold_disparo` de HOJE (BRT) daquele chip em `chip_send_log` (global). Se ≥ 35 → chip fora do ciclo.
- **Espaçamento:** por ciclo, manda **no máx 1 cold por chip** (não batch de 10). Próximo ciclo = `now() + random(12-25 min)` (substitui o delay de batch atual). Mantém `delay_min/max_ms` só como micro-jitter entre chips no mesmo ciclo.
- Se todos os chips no teto → `next_batch_at=null` (espera próximo dia/janela).

### T4 — UI `JanelaHorarioConfig.tsx` (wizard + edição)
Toggle "Respeitar horário" + inputs início/fim + dias da semana. Reusável. Default 07-17h seg-sex.

## 3. Fora de escopo (v1)
- Curva de aquecimento interna (externo). Multi-timezone (BRT fixo). Feriados. Pausa de almoço.
- Limite por chip configurável na UI (fica fixo 35; ajustável via config depois).

## 4. Riscos
- **Cap por chip é GLOBAL** (todas campanhas) — usar `chip_send_log` (chip_id + evento_origem + dia), não `campanha_leads` (per-campanha).
- Migration ANTES do deploy do processor (senão bate em coluna inexistente).
- BRT fixo (UTC-3) — validar off-by-one no dia da semana (Postgres dom=0 / nosso seg=1).
- Espaçamento muda o ritmo: confirmar que `selfInvoke`/`next_batch_at` continua coerente.

## 5. Critério de pronto
- [ ] Migration aplicada + backfill IA. Build/type-check verde.
- [ ] Processor pula fora de 07-17h (log `skipped:fora_janela`).
- [ ] Chip no teto de 35 cold/dia é pulado; log mostra ~1 envio/chip a cada ~15-20min.
- [ ] Edge deployada + smoke-test (invoke retorna 2xx; dispara dentro da janela, pula fora).
- [ ] UI de janela no wizard + edição.
- [ ] Revisão barata (2 lentes Sonnet) + PO (eu) sem blocker. Auto-merge.

## 6.1 Resultado da revisão (2 lentes Sonnet, ~121k tokens)
**Corrigidos antes do merge:**
- 🔴 Guard de janela zerava `next_batch_at` incondicional → podia destruir lock de outro processo (envio duplo). **Fix:** reagenda pro próximo início de janela com `.or(next_batch_at.is.null,next_batch_at.lte.now)` — não toca lock ativo. (job 11, cron de minuto, re-dispara no horário.)
- 🔴 Fallback de chip podia mandar 2+ cold no mesmo ciclo (estourar cap intra-ciclo). **Fix:** `enviadosCiclo[chipId]` — skip chip que já enviou no ciclo + break quando todos enviaram.
- 🟠 Fronteira do cap usava meia-noite UTC. **Fix:** meia-noite BRT (03:00 UTC).

**Follow-up registrado (NÃO bloqueia v1):**
- 🟠 **Corrida TOCTOU cross-campanha:** 2 campanhas no mesmo chip, mesmo minuto, ambas em 34 → chip fecha em 36. Soft-cap atual (snapshot por invocação) já corta o grosso (vs 0 cap antes). **Cap atômico real = mover pro `pre_send_check`** (conta `chip_send_log` = tentativas, não só sucessos; com lock por chip). Exige aprovação de função DB (DDL). Raro hoje: campanhas usam chips dedicados.
