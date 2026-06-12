## Objetivo

Evoluir o módulo de Demandas/Tarefas para suportar:
1. **Prazo com hora** (não só data).
2. **Tarefas recorrentes** (ex.: "toda quinta às 14h, reunião financeiro").
3. **Alerta no Sigma 2h antes** do prazo expirar.
4. **Clique no dia do calendário** abre dialog com tarefas e agendas daquele dia.

---

## 1. Schema — `worklist_tarefas` e novas tabelas

Migração (esquema, sem dados):

- **`worklist_tarefas.data_limite_hora` `time`** (nullable) — hora associada ao `data_limite`. Mantém compatibilidade: tarefas antigas continuam só com data.
- **`worklist_tarefas.duracao_min` `int`** (nullable) — útil para reuniões (default 60 quando criada como agenda).
- **`worklist_tarefas.alerta_2h_enviado_at` `timestamptz`** — controle de idempotência do alerta.
- **`worklist_tarefas.recorrencia_id` `uuid`** (FK → `worklist_tarefa_recorrencias.id`) — vincula a tarefa-instância ao template.

Nova tabela **`worklist_tarefa_recorrencias`**:

```text
id, titulo, descricao, tipo, urgencia,
setor_destino_id, escopo, created_by,
frequencia        text   -- 'semanal' | 'mensal' | 'diaria'
dias_semana       int[]  -- 0..6 (dom..sáb), p/ semanal
dia_mes           int    -- 1..31, p/ mensal
hora              time   -- horário do compromisso
duracao_min       int
participantes     uuid[] -- vira mencionados em cada instância
checklist_template jsonb
ativo             bool
proxima_geracao   date   -- até onde já foi materializado
created_at, updated_at
```

Materialização: edge function diária gera instâncias em `worklist_tarefas` para os próximos 30 dias, idempotente por `(recorrencia_id, data_limite)` (unique index parcial).

GRANTs + RLS análogas às de `worklist_tarefas` (criador/admin gerencia, setor visualiza).

---

## 2. Backend / Edge Functions

- **`gerar-tarefas-recorrentes`** — roda 1x/dia via `pg_cron`. Para cada recorrência ativa, cria as instâncias faltantes dos próximos 30 dias.
- **`alerta-tarefas-2h`** — roda a cada 10 min via `pg_cron`. Seleciona tarefas com `data_limite + data_limite_hora` entre `now()+1h50` e `now()+2h10`, status ≠ concluída, `alerta_2h_enviado_at IS NULL`. Cria notificação em `comunicacao_notificacoes` / `system_notifications` para `created_by`, `responsavel_id` e `mencionados`, e marca `alerta_2h_enviado_at = now()`.

Os jobs `pg_cron` serão inseridos via insert tool (contêm URL/anon-key específicos do projeto).

---

## 3. UI

### a) `NovaDemandaDialog` (criar/editar tarefa)
- Ao lado do date picker de Prazo, adicionar **input de hora** (`HH:mm`, opcional) e, quando preenchido, campo **Duração (min)**.
- Nova aba/seção colapsável **"Repetir"**:
  - Switch "Tarefa recorrente"
  - Frequência: Semanal / Mensal / Diária
  - Dias da semana (chips Seg–Dom) ou dia do mês
  - Hora + Duração
  - Pessoas envolvidas (reusa `PessoasCombobox`)
  - Ao salvar com recorrência ativa: grava em `worklist_tarefa_recorrencias` e dispara `gerar-tarefas-recorrentes` para materializar imediatamente.

### b) `TarefaCard`
- Exibir hora junto da data quando `data_limite_hora` existir (`13 jun · 14:00`).
- Badge 🔁 quando `recorrencia_id` não-nulo.

### c) `ColunaAgenda` — clique no dia
- Hoje o calendário só mostra contagem. Adicionar `onClick` no dia que abre **`DiaAgendaDialog`** novo:
  - Lista as tarefas daquele dia ordenadas por hora.
  - Inclui as instâncias de recorrência já materializadas (vêm naturalmente de `worklist_tarefas`).
  - Botão "Nova tarefa neste dia" pré-preenche o `NovaDemandaDialog`.

### d) Sino de notificações
- Reaproveita o componente atual de notificações; alerta 2h aparece como item novo "⏰ Tarefa expira às 16:00 — {titulo}".

---

## 4. Detalhes técnicos

- Campo único de prazo no front: `data_limite: Date` + `hora?: string`. Ao montar payload: gravar `data_limite` (date) e `data_limite_hora` (time) separados.
- Ordenação na Agenda: `ORDER BY data_limite, data_limite_hora NULLS LAST`.
- Considerar timezone do navegador para o alerta de 2h; o cron compara em `America/Sao_Paulo` (server side via `timezone('America/Sao_Paulo', now())`).
- Edição de uma instância recorrente: editar só a instância (default) ou "editar série" (atualiza `worklist_tarefa_recorrencias` e regenera futuras não concluídas). Versão 1: apenas "editar instância"; "editar série" fica como follow-up.
- Excluir série desativa `ativo=false` e remove instâncias futuras não concluídas.

---

## 5. Ordem de implementação

1. Migração (schema + RLS + GRANTs + unique index + crons).
2. Edge functions `gerar-tarefas-recorrentes` e `alerta-tarefas-2h`.
3. UI: hora no `NovaDemandaDialog` + exibição no `TarefaCard`.
4. UI: seção "Repetir" + criação de recorrência.
5. UI: `DiaAgendaDialog` no clique do dia.
6. Notificação 2h no sino.

Posso começar pelos passos 1–3 (entrega imediata: hora + alerta) e depois 4–6 (recorrência + dialog do dia), ou ir tudo em sequência. Qual prefere?
