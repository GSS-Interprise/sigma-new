---
tags: [arquitetura, sigma-gss, ws4, manual]
projeto: SigmaGSS
data: 2026-06-06
status: em execução (autônomo) — RPC aguarda aprovação DDL
repo: GSS-Interprise/sigma-new
parent: plano-mestre-maquina-prospeccao.md (WS4 / R3+R5)
---

# WS4 — Duplicar campanha IA→manual com split de leads (top N)

> **1 frase:** num clique a operadora duplica uma campanha IA como **manual**, puxando os **N primeiros leads frios** pra fila manual (saem da IA) — com as 6 tarefas por canal já geradas.

## Já existe (reaproveitar)
- `campanha_lead_tasks` + trigger `tg_campanha_leads_generate_tasks` (AFTER INSERT, gera 6 tasks se `tipo_envio in (manual,ambos)`).
- `LeadCampanhaTasks` (UI de tarefas por canal — funciona).
- `tipo_envio='manual'` + componentes DisparoManual.

## Decisão de produto (Raul 06/06)
- **Split = por quantidade (top N frios)** — operadora digita "puxar X leads", sistema move os X frios mais antigos.

## Pegadinha
- O trigger de tasks é **AFTER INSERT** — mover por UPDATE de `campanha_id` **NÃO** dispara. Logo a RPC **gera as tasks manualmente** (espelha o trigger) pros leads movidos.

## Backend — RPC atômica `duplicar_campanha_para_manual(origem uuid, qtd int)` (precisa aprovação DDL)
1. Clona a campanha origem como `tipo_envio='manual'`, nome + " (Manual)" (copia briefing, config, chips, janela, remetente).
2. Move os top N `campanha_leads` `status='frio'` (ordem `created_at`, `FOR UPDATE SKIP LOCKED`) → `campanha_id = nova`.
3. Gera as 6 tasks default pros leads movidos (ON CONFLICT DO NOTHING).
4. Retorna o id da nova campanha.
Atômico (tudo ou nada). `SECURITY DEFINER` + GRANT authenticated.

## Frontend
- Menu 3-pontinhos no card da campanha (localizar onde os cards renderizam — provável `CampanhasProspeccao` lista; `DashboardCampanhas` dropdown é só export).
- Item "Duplicar pra manual" → dialog com input de quantidade (mostra quantos frios a campanha tem) → chama a RPC → toast + invalida queries.

## Fora de escopo (v1)
- Split por seleção manual/filtro (Raul escolheu top-N). Pausar/editar no menu (separado).

## Critério de pronto
- [ ] RPC aplicada (aprovada) + testada (clona + move N + gera tasks).
- [ ] Menu + dialog no card; duplicar move N leads pro manual (somem da IA) com tasks.
- [ ] Build/type-check verde. Revisão barata + gate. Auto-merge.
