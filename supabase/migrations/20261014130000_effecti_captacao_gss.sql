-- Captação da GSS pela API oficial do Effecti (14/10). A edge effecti-captacao cria os cards
-- pela api-licitacoes (mesmas regras dos captadores antigos) e enfileira os anexos aqui, para
-- baixar aos poucos: edital tem arquivo de 100+ páginas e a função tem tempo limite.
create table if not exists public.effecti_anexos_fila (
  id            uuid primary key default gen_random_uuid(),
  licitacao_id  uuid not null references public.licitacoes(id) on delete cascade,
  nome          text not null,
  url           text not null,
  status        text not null default 'pendente' check (status in ('pendente', 'baixado', 'erro')),
  tentativas    int not null default 0,
  erro          text,
  created_at    timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (licitacao_id, url)
);
create index if not exists idx_effecti_anexos_pendentes on public.effecti_anexos_fila (created_at) where status = 'pendente';
alter table public.effecti_anexos_fila enable row level security;
drop policy if exists "effecti anexos leitura" on public.effecti_anexos_fila;
create policy "effecti anexos leitura" on public.effecti_anexos_fila for select to authenticated using (true);
grant select on public.effecti_anexos_fila to authenticated;
grant all on public.effecti_anexos_fila to service_role;

-- token interno com que a captação chama a api-licitacoes (o valor nunca sai do banco)
insert into public.api_tokens (nome, token, ativo)
select 'effecti-captacao-gss', 'sigma_' || encode(gen_random_bytes(24), 'hex'), true
where not exists (select 1 from public.api_tokens where nome = 'effecti-captacao-gss');
