-- Insights de Conversas (F1): campos agregáveis extraídos das conversas.
-- Spec: docs/arquitetura/insights-de-conversas.md
alter table public.banco_interesse_leads
  add column if not exists forma_pagamento_preferida text,  -- por_plantao|por_producao|por_hora|fixo_mensal|misto
  add column if not exists objecoes text[] not null default '{}',  -- taxonomia fixa
  add column if not exists temas text[] not null default '{}';     -- tags livres emergentes

create index if not exists idx_bi_objecoes on public.banco_interesse_leads using gin (objecoes);
create index if not exists idx_bi_temas on public.banco_interesse_leads using gin (temas);
create index if not exists idx_bi_forma_pgto on public.banco_interesse_leads (forma_pagamento_preferida);
