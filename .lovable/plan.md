## Plano: Drenar e estabilizar a fila de falhas de importação

Hoje a `import_leads_failed_queue` tem **104.187 itens pending** porque ninguém processa a fila depois da falha inicial. Distribuição dos erros:

- **TIMEOUT** — 96.558 (92,7%)
- **23505** (duplicate key) — 3.969 (3,8%)
- **42703** (coluna inexistente) — 3.657 (3,5%)
- **57014** (cancelamento) — 1
- **null** — 2

### O que vamos fazer (4 passos)

**1. Corrigir o bug de schema (erro 42703)**
O `import-leads` tenta gravar `leads.api_enrich_status`, coluna que não existe. Hoje toda chamada com payload de enriquecimento bate esse erro. Vamos remover a referência no código de `import-leads` (e qualquer outra função que escreva `api_enrich_status` direto em `leads`) — o status correto já vai para `lead_enrichments`. Isso zera o crescimento de erros 42703.

**2. Auto-resolver duplicatas (erro 23505)**
Quando o `process-failed-leads-queue` recebe `23505` no INSERT/UPDATE de `leads`, hoje ele só re-tenta. Vamos:
- Detectar `23505` → marcar imediatamente como `status='abandoned'`, `abandonment_reason='phone_conflict_unresolvable'` (ou `cpf_duplicate`), sem consumir tentativas extras.
- Antes de abandonar, tentar uma vez fazer merge no lead existente (buscar pelo telefone/CPF que conflitou e atualizar).

**3. Aumentar capacidade de processamento (erro TIMEOUT)**
A função processa em batch de 1000 itens sequencialmente, e cada item faz várias chamadas Supabase → estoura os 8s do `import-leads` original. Vamos:
- Reduzir `BATCH_SIZE` de 1000 → **100** por execução para caber no limite de 150s da edge function.
- No `process-failed-leads-queue`, paralelizar com `Promise.all` em lotes de 10 itens.
- Os TIMEOUTs antigos viram retentativas naturais (a função já tem backoff 5/20/60min).

**4. Criar o cron que faltava**
Agendar `process-failed-leads-queue` para rodar **a cada 1 minuto** via `pg_cron` + `pg_net`, autenticando com a `SUPABASE_ANON_KEY` (a função já aceita esse token).

A 100 itens/minuto = 6.000/hora → a fila atual drena em ~17h, e novas falhas são processadas quase em tempo real.

### Detalhes técnicos

```text
Fluxo após o plano:
  import-leads (8s)  ──falha──▶  import_leads_failed_queue
                                          │
                                          ▼
                    pg_cron (1min) ──▶ process-failed-leads-queue
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                       resolved       abandoned        pending
                                    (23505/max)      (retry 5/20/60min)
```

Arquivos/objetos afetados:
- `supabase/functions/import-leads/index.ts` — remover escrita de `api_enrich_status` em `leads`
- `supabase/functions/process-failed-leads-queue/index.ts` — handler 23505, batch 100, paralelismo
- nova migration: `cron.schedule('process-failed-leads-queue', '* * * * *', net.http_post(...))`

Não tocaremos no schema de `leads` nem em `lead_enrichments` — apenas código + cron.

### O que NÃO está no escopo

- Não vamos investigar por que o `import-leads` original estoura 8s (isso é otimização futura — a fila absorve).
- Não vamos mudar a lógica de matching (CPF/CNPJ/nome) — está correta.
- Não vamos apagar os 104k itens; eles serão processados/abandonados naturalmente.

### Resultado esperado

- Em ~24h: fila < 5k itens (apenas as falhas “vivas”).
- Erro 42703 zera imediatamente.
- Erro 23505 vira `abandoned` em 1 ciclo em vez de ocupar a fila.
- Novas falhas resolvidas em < 1 minuto.
