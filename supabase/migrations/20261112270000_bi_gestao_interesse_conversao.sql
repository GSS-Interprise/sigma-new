-- Fase 8.4 (BI do Maikon): por campanha, % interessado, % convertido e tempo até a 1ª resposta nossa (IA ou pessoa).
-- Mesma função de 20261112100000, só o bloco por_campanha cresce.

create or replace function public.bi_raiox_gestao(p_especialidade_ids uuid[], p_ufs text[] default null, p_desde date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'authentication_required'; end if;

  with c as (select * from _raiox_contatos(p_especialidade_ids, p_ufs, p_desde)),
  esperando as (
    select c.* from c
     where c.respondeu and c.ultima_do_medico < now() - interval '2 hours'
       and (c.ultima_nossa is null or c.ultima_nossa < c.ultima_do_medico)
  ),
  primeira_resposta as (
    select c.campanha_lead_id,
           (select min(x.sent_at) from sigzap_messages x
             where x.conversation_id = c.conversation_id and not x.from_me and x.sent_at > c.primeiro_em) as medico_em
      from c where c.respondeu
  ),
  -- Fase 8.4 (BI do Maikon): 1ª resposta nossa de qualquer autor (pessoa ou IA), por campanha.
  tempo_qualquer as (
    select cc.campanha_id, extract(epoch from (
             (select min(x.sent_at) from sigzap_messages x
               where x.conversation_id = cc.conversation_id and x.from_me and x.sent_at > p.medico_em) - p.medico_em)) / 60 as minutos
      from primeira_resposta p join c cc on cc.campanha_lead_id = p.campanha_lead_id
  ),
  tempo as (
    select extract(epoch from (
             (select min(x.sent_at) from sigzap_messages x
               where x.conversation_id = cc.conversation_id and x.from_me and x.sent_at > p.medico_em
               and x.sent_by_user_id is not null) - p.medico_em)) / 60 as minutos
      from primeira_resposta p join c cc on cc.campanha_lead_id = p.campanha_lead_id
  )
  select jsonb_build_object(
    'esperando_resposta', (select count(*) from esperando),
    'esperando', coalesce((
      select jsonb_agg(x order by x.ultima_do_medico desc) from (
        select e.conversation_id, e.ultima_do_medico, coalesce(l.nome, 'Sem nome') as nome, ca.nome as campanha
          from esperando e left join leads l on l.id = e.lead_id left join campanhas ca on ca.id = e.campanha_id
         order by e.ultima_do_medico desc limit 20) x), '[]'::jsonb),
    'mediana_primeira_resposta_min', (select round(percentile_cont(0.5) within group (order by minutos)::numeric) from tempo where minutos is not null),
    'sem_resposta_nossa', (select count(*) from tempo where minutos is null),
    'por_campanha', coalesce((
      select jsonb_agg(x order by x.alcancados desc) from (
        select ca.id, ca.nome, count(*) filter (where c.entregue) as alcancados,
               count(*) filter (where c.respondeu) as responderam,
               count(*) filter (where f.so_falhou) as falharam,
               -- interessado = a IA ou a equipe marcou quente (status ou alerta enviado); convertido = status convertido
               count(*) filter (where cl.status in ('quente', 'convertido') or cl.metadados ? 'alerta_quente_em') as interessados,
               count(*) filter (where cl.status = 'convertido') as convertidos,
               (select round(percentile_cont(0.5) within group (order by t.minutos)::numeric)
                  from tempo_qualquer t where t.campanha_id = ca.id and t.minutos is not null) as resposta_min
          from c join campanhas ca on ca.id = c.campanha_id
          join campanha_leads cl on cl.id = c.campanha_lead_id
          -- Mesma regra do Resumo da campanha: falhou = todas as mensagens do médico falharam.
          left join lateral (select bool_and(m.message_status = 'failed') as so_falhou from sigzap_messages m
                              where m.campanha_lead_id = c.campanha_lead_id and m.from_me) f on true
         group by 1, 2) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

revoke all on function public.bi_raiox_gestao(uuid[], text[], date) from public, anon;
grant execute on function public.bi_raiox_gestao(uuid[], text[], date) to authenticated, service_role;
