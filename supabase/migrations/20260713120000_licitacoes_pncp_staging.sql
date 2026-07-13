-- TESTE 2 DIAS: staging da captura do PNCP pra comparar com a Effecti antes de cortar.
create table if not exists public.licitacoes_pncp_staging (
  id uuid primary key default gen_random_uuid(),
  numero_controle_pncp text unique,
  objeto text,
  orgao text,
  cnpj_orgao text,
  uf text,
  municipio text,
  valor_estimado numeric,
  modalidade text,
  data_abertura timestamptz,
  data_encerramento timestamptz,
  url_pncp text,
  palavras_match text[],
  raw jsonb,
  capturado_em timestamptz not null default now()
);
create index if not exists idx_pncp_staging_capt on public.licitacoes_pncp_staging (capturado_em desc);
create index if not exists idx_pncp_staging_uf on public.licitacoes_pncp_staging (uf);

alter table public.licitacoes_pncp_staging enable row level security;
drop policy if exists "le staging pncp" on public.licitacoes_pncp_staging;
create policy "le staging pncp" on public.licitacoes_pncp_staging
  for select to authenticated
  using (public.is_admin(auth.uid())
      or public.has_role(auth.uid(),'diretoria'::app_role)
      or public.has_role(auth.uid(),'lideres'::app_role)
      or public.has_role(auth.uid(),'licitador'::app_role)
      or public.has_role(auth.uid(),'lider_licitacao'::app_role));
grant select, insert, update, delete on public.licitacoes_pncp_staging to authenticated, service_role;

-- Cron 2x/dia (11h e 17h UTC = 8h e 14h BR) durante o teste. Remover/desagendar após validar.
do $cron$ begin perform cron.unschedule('licitacoes-pncp-sync-teste'); exception when others then null; end $cron$;
select cron.schedule('licitacoes-pncp-sync-teste', '0 11,17 * * *',
  $c$ select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/licitacoes-pncp-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1cHNiZ3RvZW9peGZva3pranJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTQwODEsImV4cCI6MjA5MDczMDA4MX0.BKhpdlsDdH13j9pJYwZgvuOeBS10DDH5GehQ3efpqkw',
      'Content-Type', 'application/json'),
    body := jsonb_build_object('dias', 3)
  ); $c$);
