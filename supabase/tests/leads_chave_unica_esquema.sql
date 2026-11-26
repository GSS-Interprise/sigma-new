-- Esquema mínimo de public.leads para rodar supabase/tests/leads_chave_unica.sql fora de produção (PGlite ou Postgres
-- local vazio): só as colunas que o gatilho usa, os dois índices únicos como em produção (idx_leads_chave_unica de
-- 20260123191531 e idx_leads_cpf_unique de 20260223184151) e o gatilho. Depois dele, aplique as migrations
-- 20261125210000 e 20261126120000, nessa ordem. NÃO rode em produção (lá a tabela já existe).
create table public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  phone_e164 text,
  cpf text,
  crm text,
  data_nascimento date,
  merged_into_id uuid references public.leads(id),
  chave_unica text
);
create unique index idx_leads_chave_unica on public.leads (chave_unica) where chave_unica is not null;
create unique index idx_leads_cpf_unique on public.leads (cpf) where cpf is not null and trim(cpf) <> '';
create or replace function public.generate_lead_chave_unica() returns trigger language plpgsql as 'begin return new; end';
create trigger trigger_lead_chave_unica before insert or update on public.leads
  for each row execute function public.generate_lead_chave_unica();
