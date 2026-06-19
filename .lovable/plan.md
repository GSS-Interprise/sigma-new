## Objetivo
Resolver 4 problemas das tarefas recorrentes na coluna "Minhas tarefas":
1. Recorrência gerando ocorrências no passado
2. Falta aviso quando hora se aproxima
3. Lista poluída por muitas ocorrências da mesma recorrência
4. Tarefas sem separação visual por data

---

## 1. Recorrência sem retroativo + data de início explícita

**Form (`NovaDemandaDialog.tsx`)**
- Adicionar campo dedicado **"Início da recorrência"** (date picker), separado do `data_limite`. Default = hoje. Não permite datas passadas (`disabled={{ before: hoje }}`).
- Aparece só quando `recorrenteAtivo`.
- Enviar esse valor em `data_inicio` para `useCriarRecorrencia`.

**Edge function (`gerar-tarefas-recorrentes/index.ts`)**
- Mudar a regra: `start = max(proxima_geracao ?? hoje, hoje)` SEMPRE, ignorando `janelaCustomizada` quando o início seria no passado. Ou seja, `inicioJanela` nunca fica antes de hoje, mesmo quando o calendário pede meses anteriores.
- Garante que nenhuma materialização cria registros com `data_limite < hoje`.

---

## 2. Aviso de horário (10 min antes)

**Hook novo `useTarefasHoraAlerta.ts`**
- Consulta a cada 1 min as tarefas abertas do usuário com `data_limite = hoje` e `data_limite_hora` definida.
- Dispara um toast (e tenta `Notification` API se permitido) quando faltar entre 9–11 min para a hora.
- Persiste IDs já avisados em `sessionStorage` para não repetir no mesmo dia.
- Plugar em `AppLayout` ou no provider que já roda `useDemandasAtrasadas`.

Sem migração nova — usa colunas já existentes (`data_limite`, `data_limite_hora`).

---

## 3. Recorrentes: só a próxima ocorrência da semana

**`ColunaMinhasTarefas.tsx`**
- Antes de renderizar `abertas`, agrupar por `recorrencia_id`:
  - Tarefas sem `recorrencia_id`: aparecem normalmente.
  - Tarefas com `recorrencia_id`: filtra para a janela `[hoje, fim_da_semana]` (domingo) e mantém apenas a de menor `data_limite`. Se nenhuma cai na semana atual, esconde.
- Pequeno badge no card (`+N esta semana` / `Recorrente`) quando tem mais ocorrências escondidas — usar `Repeat` icon que já existe no `TarefaCard`.

---

## 4. Separação por dia na coluna

**`ColunaMinhasTarefas.tsx`**
- Após filtros acima, agrupar `abertas` por `data_limite` (string YYYY-MM-DD; `null` vira grupo "Sem data").
- Renderizar headers sticky pequenos: `Atrasada — 18 jun`, `Hoje — 19 jun`, `Amanhã — 20 jun`, `Sex 22 jun`, etc. (usando `date-fns` `format` ptBR + comparação com hoje).
- Headers com estilo discreto (text-[11px] uppercase tracking-wide text-muted-foreground, divisor sutil).

---

## Detalhes técnicos

```text
Arquivos editados:
  src/components/demandas/NovaDemandaDialog.tsx   (+ campo data_inicio)
  src/components/demandas/ColunaMinhasTarefas.tsx (agrupamento + dedup recorrente)
  src/hooks/useDemandas.ts                        (campo data_inicio já existe — só garantir uso)
  supabase/functions/gerar-tarefas-recorrentes/index.ts  (clamp inicioJanela >= hoje)

Arquivos novos:
  src/hooks/useTarefasHoraAlerta.ts
  + 1 chamada em src/components/layout/AppLayout.tsx (ou onde useDemandasAtrasadas roda)
```

Sem migração de banco. Sem alteração nas RLS.

---

## Fora de escopo (não tocar agora)
- Cron job de geração diária (já existe e continuará válido após o fix do clamp)
- Calendário mensal — apenas a coluna "Minhas tarefas" muda visualmente
- Notificações push reais via service worker — usaremos toast + Notification API best-effort