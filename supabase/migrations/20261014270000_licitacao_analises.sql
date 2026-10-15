-- T6 do plano licitacoes-contratos-gss.md (14/10): análise de edital pelo modelo da Bianca.
-- O modelo foi reconstruído a partir das análises que a equipe já colava no card a partir do Gem do
-- Gemini (229 cards da GSS com análise copiada do Gemini; 45 com as fontes). Cada análise gerada fica
-- guardada aqui, com o histórico, e a equipe decide o que leva para a "Decorrência de Análise" do card.
-- A edge licitacao-analise-edital grava em segundo plano (status processando → pronta | erro), porque
-- um edital grande pode levar mais de um minuto na IA.

create table if not exists public.licitacao_analises (
  id uuid primary key default gen_random_uuid(),
  licitacao_id uuid not null references public.licitacoes(id) on delete cascade,
  status text not null default 'processando' check (status in ('processando', 'pronta', 'erro')),
  html text,
  faltou jsonb not null default '[]'::jsonb,       -- o que o edital não informa (a IA não inventa)
  anexos jsonb not null default '[]'::jsonb,       -- arquivos lidos: [{bucket, path, nome}]
  modelo text,
  erro text,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);
create index if not exists idx_licitacao_analises_card on public.licitacao_analises (licitacao_id, criado_em desc);

alter table public.licitacao_analises enable row level security;
drop policy if exists licitacao_analises_select on public.licitacao_analises;
create policy licitacao_analises_select on public.licitacao_analises for select to authenticated using (true);
grant select on public.licitacao_analises to authenticated;
grant all on public.licitacao_analises to service_role;
