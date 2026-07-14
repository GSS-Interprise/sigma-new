-- PNCP v2 (14/07): a edge migrou pro endpoint de BUSCA e agora captura campos
-- ricos. Adiciona colunas + atualiza o cron pra 3x/dia com o novo corpo.

-- Campos novos que a /api/search entrega (o BI de vencedores usa tem_resultado).
alter table public.licitacoes_pncp_staging add column if not exists situacao        text;
alter table public.licitacoes_pncp_staging add column if not exists data_publicacao timestamptz;
alter table public.licitacoes_pncp_staging add column if not exists tem_resultado   boolean;

create index if not exists idx_pncp_staging_pub on public.licitacoes_pncp_staging (data_publicacao desc);
create index if not exists idx_pncp_staging_res on public.licitacoes_pncp_staging (tem_resultado) where tem_resultado;

-- Cron 3x/dia (11h/15h/19h UTC = 8h/12h/16h BR). Corpo novo: paginas por query.
do $cron$ begin perform cron.unschedule('licitacoes-pncp-sync-teste'); exception when others then null; end $cron$;
select cron.schedule('licitacoes-pncp-sync-teste', '0 11,15,19 * * *',
  $c$ select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/licitacoes-pncp-sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp1cHNiZ3RvZW9peGZva3pranJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNTQwODEsImV4cCI6MjA5MDczMDA4MX0.BKhpdlsDdH13j9pJYwZgvuOeBS10DDH5GehQ3efpqkw',
      'Content-Type', 'application/json'),
    body := jsonb_build_object('paginas', 6)
  ); $c$);
