

# Reestruturação: Colunas de Alimentação Diretas na Tabela `leads`

## Mudança de Abordagem

Em vez de múltiplas linhas na tabela `lead_enrichments`, cada linha de alimentação vira um **conjunto de colunas** direto na tabela `leads`. Isso permite buscas simples como `WHERE enrich_one = false` sem joins.

## Novas Colunas na Tabela `leads`

15 colunas novas (3 por linha de alimentação):

```text
Linha  | Coluna boolean       | Última tentativa           | Validade
-------|----------------------|----------------------------|------------------
1      | enrich_one   (false) | last_attempt_at_one        | expires_at_one
2      | enrich_two   (false) | last_attempt_at_two        | expires_at_two
3      | enrich_three (false) | last_attempt_at_three      | expires_at_three
4      | enrich_four  (false) | last_attempt_at_four       | expires_at_four
5      | enrich_five  (false) | last_attempt_at_five       | expires_at_five
```

Significado:
- **Linha 1** = Import-leads (Tiago)
- **Linha 2** = Residentes
- **Linha 3** = Lemit
- **Linha 4** = Lifeshub
- **Linha 5** = Especialidade

## Passos de implementação

### Passo 1 — Migração SQL

Adicionar as 15 colunas à tabela `leads`:

```sql
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS enrich_one boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at_one timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_one timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_two boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at_two timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_two timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_three boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at_three timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_three timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_four boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at_four timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_four timestamptz,
  ADD COLUMN IF NOT EXISTS enrich_five boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_attempt_at_five timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at_five timestamptz;
```

Backfill: marcar `enrich_one = true` para leads que já foram enriquecidos na `lead_enrichments`:

```sql
UPDATE leads l
SET enrich_one = true,
    last_attempt_at_one = le.last_attempt_at,
    expires_at_one = le.expires_at
FROM lead_enrichments le
WHERE le.lead_id = l.id
  AND le.pipeline = 'enrich_v1'
  AND le.status IN ('concluido', 'alimentado');
```

Índices para buscas rápidas por linha:

```sql
CREATE INDEX IF NOT EXISTS idx_leads_enrich_one ON leads (enrich_one) WHERE enrich_one = false;
CREATE INDEX IF NOT EXISTS idx_leads_enrich_two ON leads (enrich_two) WHERE enrich_two = false;
CREATE INDEX IF NOT EXISTS idx_leads_enrich_three ON leads (enrich_three) WHERE enrich_three = false;
CREATE INDEX IF NOT EXISTS idx_leads_enrich_four ON leads (enrich_four) WHERE enrich_four = false;
CREATE INDEX IF NOT EXISTS idx_leads_enrich_five ON leads (enrich_five) WHERE enrich_five = false;
```

### Passo 2 — Atualizar Edge Function `enrich-lead`

Quando o enriquecimento conclui com sucesso, além de atualizar os campos do lead, setar as colunas da linha correspondente:

```text
pipeline "enrich_v1"        → enrich_one = true, last_attempt_at_one = now, expires_at_one = now + 12 meses
pipeline "enrich_residentes" → enrich_two = true, last_attempt_at_two = now, expires_at_two = now + 6 meses
pipeline "enrich_lemit"      → enrich_three = true, ...
pipeline "enrich_lifeshub"   → enrich_four = true, ...
pipeline "enrich_especialidade" → enrich_five = true, ...
```

A tabela `lead_enrichments` continua existindo para log detalhado (result_data, error_message, etc.), mas a busca de "quem precisa ser alimentado" passa a ser feita direto na `leads`.

### Passo 3 — Atualizar Edge Function `import-leads`

Ao criar um lead novo, já setar `enrich_one = false` (default). Se o import já traz status concluído, setar `enrich_one = true` + datas.

### Passo 4 — Atualizar Edge Function `query-leads-for-enrich`

Simplificar a query — em vez de fazer join com `lead_enrichments`, buscar direto:

```sql
SELECT * FROM leads WHERE enrich_one = false AND merged_into_id IS NULL LIMIT 500
```

Para pipeline 2: `WHERE enrich_two = false`, etc.

### Passo 5 — Atualizar `plan.md` e tipos TypeScript

O arquivo `types.ts` será atualizado automaticamente após a migração. Atualizar o `plan.md` com a nova abordagem.

## Tabela `lead_enrichments` — mantém ou remove?

Recomendo **manter** como tabela de log/histórico (guarda `result_data`, `error_message`, tentativas). As colunas boolean na `leads` são o "estado atual" para buscas rápidas. A `lead_enrichments` fica como auditoria.

## Impacto

- **3 edge functions** atualizadas: `enrich-lead`, `import-leads`, `query-leads-for-enrich`
- **1 migração** com 15 colunas + backfill + 5 índices
- **Zero quebra** — defaults são `false`, código existente continua funcionando até ser atualizado

