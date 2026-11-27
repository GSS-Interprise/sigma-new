-- Leitura automática dos PDFs de contrato (27/11/2026). A extração inicial (script local) deixou 36 PDFs escaneados sem
-- texto e não pegava contrato novo. A edge contratos-ler-anexos lê o texto do PDF e, quando o PDF é só imagem, faz OCR
-- pelo Gemini. Cron a cada 10 min: anexo novo entra na busca da IA dos contratos sem ninguém rodar nada.
alter table public.contrato_anexo_leitura
  add column if not exists metodo text check (metodo in ('texto', 'ocr')),
  add column if not exists tentativas int not null default 0;

-- Fila: PDF nunca lido; escaneado ainda sem OCR (só quando p_ocr); erro com menos de 3 tentativas, 1 h depois do último.
create or replace function public.contratos_anexos_para_ler(p_limite int default 3, p_ocr boolean default true)
returns table (id uuid, contrato_id uuid, arquivo_url text, arquivo_nome text)
language sql stable security definer set search_path = public as $$
  select a.id, a.contrato_id, a.arquivo_url, a.arquivo_nome
    from contrato_anexos a
    left join contrato_anexo_leitura l on l.anexo_id = a.id
   where a.arquivo_nome ilike '%.pdf'
     and a.contrato_id is not null
     and (l.anexo_id is null
          or (p_ocr and l.status = 'sem_texto' and l.metodo is distinct from 'ocr')
          or (l.status = 'erro' and l.tentativas < 3 and l.lido_em < now() - interval '1 hour'))
   order by (l.anexo_id is null) desc, a.id
   limit greatest(1, least(coalesce(p_limite, 3), 20));
$$;
revoke all on function public.contratos_anexos_para_ler(int, boolean) from public, anon, authenticated;
grant execute on function public.contratos_anexos_para_ler(int, boolean) to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'contratos-ler-anexos';
select cron.schedule('contratos-ler-anexos', '*/10 * * * *', $cron$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/contratos-ler-anexos',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"limite":3}'::jsonb, timeout_milliseconds := 150000);
$cron$);
