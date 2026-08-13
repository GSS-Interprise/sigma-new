-- =====================================================================
-- cron_health - quem vigia os vigias.
--
-- POR QUE EXISTE: em 13/08 descobrimos que o cron `analise-robo-effecti`
-- falhava TODO DIA desde 02/08 com statement timeout. Doze dias de serie
-- perdidos. O erro estava registrado em cron.job_run_details desde o
-- primeiro dia, legivel e completo - ninguem consulta essa tabela.
--
-- A ironia: ja existiam DOIS monitores no projeto (crawl_health para
-- captacao, consumo_health para entrega) e nenhum dos dois vigiava os
-- crons. O modo de falha que a gente vinha perseguindo a sessao inteira -
-- "sucesso silencioso" - aconteceu no proprio andaime de vigilancia.
--
-- Este arquivo fecha isso: le cron.job_run_details, resume por job, e
-- registra em crawl_health para aparecer junto dos outros alertas.
-- =====================================================================

-- Retrato de cada job: ultima execucao, taxa de falha recente, silencio.
create or replace view cron_health as
with ult as (
  select distinct on (jobid) jobid, status, start_time, end_time,
         left(coalesce(return_message, ''), 200) msg
    from cron.job_run_details
   where start_time > now() - interval '14 days'
   order by jobid, start_time desc
),
hist as (
  select jobid,
         count(*)                                          rodadas_14d,
         count(*) filter (where status = 'failed')          falhas_14d,
         max(start_time) filter (where status = 'succeeded') ultimo_sucesso
    from cron.job_run_details
   where start_time > now() - interval '14 days'
   group by jobid
)
select j.jobid, j.jobname, j.schedule, j.active,
       u.status                                            ultimo_status,
       u.start_time::timestamp(0)                          ultima_execucao,
       round(extract(epoch from (now() - u.start_time)) / 3600, 1) horas_desde,
       h.ultimo_sucesso::timestamp(0)                      ultimo_sucesso,
       h.rodadas_14d, h.falhas_14d,
       u.msg                                               ultima_mensagem,
       case
         -- job ativo que nunca rodou, ou parou de rodar
         when j.active and u.start_time is null                   then 'NUNCA_RODOU'
         when j.active and u.start_time < now() - interval '48 hours' then 'SILENCIO'
         -- falhou na ultima e nao teve sucesso recente: quebrado
         when u.status = 'failed'
              and (h.ultimo_sucesso is null
                   or h.ultimo_sucesso < now() - interval '48 hours') then 'QUEBRADO'
         when u.status = 'failed'                                 then 'FALHA_ISOLADA'
         -- roda, mas falha muito: instavel
         when h.rodadas_14d >= 5
              and h.falhas_14d::numeric / h.rodadas_14d > 0.3      then 'INSTAVEL'
         else 'ok'
       end as alerta
  from cron.job j
  left join ult  u on u.jobid = j.jobid
  left join hist h on h.jobid = j.jobid
 where j.active;

grant select on cron_health to authenticated, service_role;

comment on view cron_health is
  'Saude dos crons. QUEBRADO = falhou e nao tem sucesso ha 48h (foi o caso do '
  'analise-robo-effecti, 12 dias caido sem ninguem ver). SILENCIO = ativo mas '
  'parou de executar. INSTAVEL = roda, mas falha em mais de 30% das vezes.';

-- Registra o estado dos crons no crawl_health, para o alerta aparecer no
-- mesmo lugar que os outros. Um registro por job problematico.
create or replace function registrar_saude_crons()
returns int language plpgsql
security definer set search_path to 'public', 'cron' as $$
declare
  n int := 0;
  r record;
begin
  for r in select * from cron_health where alerta <> 'ok'
  loop
    insert into crawl_health (fonte, chave, observado, esperado_min, detalhe)
    values ('cron:' || r.jobname, r.alerta,
            -- observado = sucessos recentes; piso 1 faz o alerta acender
            coalesce(r.rodadas_14d, 0) - coalesce(r.falhas_14d, 0), 1,
            jsonb_build_object(
              'jobid', r.jobid, 'schedule', r.schedule,
              'ultimo_status', r.ultimo_status,
              'horas_desde', r.horas_desde,
              'falhas_14d', r.falhas_14d, 'rodadas_14d', r.rodadas_14d,
              'mensagem', r.ultima_mensagem));
    n := n + 1;
  end loop;

  -- registra tambem o batimento geral: quantos jobs estao ok. Assim da pra
  -- distinguir "nenhum alerta porque esta tudo bem" de "nenhum alerta porque
  -- o proprio monitor parou" - que e exatamente a falha que ele existe para
  -- pegar.
  insert into crawl_health (fonte, chave, observado, esperado_min, detalhe)
  select 'cron:_monitor', '-', count(*) filter (where alerta = 'ok'), 1,
         jsonb_build_object('total_jobs', count(*),
                            'com_alerta', count(*) filter (where alerta <> 'ok'))
    from cron_health;

  return n;
end $$;

grant execute on function registrar_saude_crons() to authenticated, service_role;
