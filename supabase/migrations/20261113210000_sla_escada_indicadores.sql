-- SLA de laudos: escada de ligação depois do vencido e indicadores do dia (docs/arquitetura/sla-laudos-radiologia.md).
-- Escada (sla-alertas, ação "exames", cron 2 min): vencido sem ninguém assumir → liga ao plantonista, de novo ao
-- plantonista, ao coordenador e à diretoria (só quem está escalado no horário), 3 min entre um e outro. Só a tecla 1,
-- o "Assumir laudo" do WhatsApp ou a tela param. Desligada até alguém ligar: config sla_escada_ligacao = 'true'
-- (além de sla_alertas_ativo, que liga os avisos em geral).
-- Indicadores (sla-alertas, ação "indicadores"): e-mail às 7h de Brasília com o período das 7h de ontem às 7h de hoje.

alter table public.sla_alertas add column if not exists escada_passo int check (escada_passo between 1 and 4);
create index if not exists sla_alertas_escada on public.sla_alertas (exame_id, escada_passo) where escada_passo is not null;

insert into public.config_lista_items (campo_nome, valor)
select 'sla_escada_ligacao', 'false'
 where not exists (select 1 from public.config_lista_items where campo_nome = 'sla_escada_ligacao');

-- Quem opera o SLA (Wagner, Brenda, admin) liga e desliga a escada pela aba Escala, como os avisos.
create or replace function public.sla_escada_ligar(p_ativo boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not sla_pode_operar(auth.uid()) then raise exception 'sem_permissao'; end if;
  update config_lista_items set valor = case when p_ativo then 'true' else 'false' end where campo_nome = 'sla_escada_ligacao';
  return p_ativo;
end;
$$;
revoke all on function public.sla_escada_ligar(boolean) from public, anon;
grant execute on function public.sla_escada_ligar(boolean) to authenticated;

select cron.unschedule(jobname) from cron.job where jobname = 'sla-indicadores-7h';
select cron.schedule('sla-indicadores-7h', '0 10 * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/sla-alertas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"indicadores"}'::jsonb, timeout_milliseconds := 60000);
$$);
