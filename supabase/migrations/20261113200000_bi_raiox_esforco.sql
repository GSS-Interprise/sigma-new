-- Raio-X em modo apresentação, bloco "O esforço da equipe": série por semana e por canal, no mesmo escopo
-- (especialidade, UF, desde) das outras RPCs bi_raiox_* (20261109120000_bi_raiox.sql).
-- Desenho do bloco: docs/redesenho-2027/raio-x-apresentacao-dados.md.
--
-- Por semana (segunda-feira, horário de Brasília):
--   whatsapp_medicos    médicos com o 1º contato da campanha naquela semana (mesma regra do "alcançados" do funil,
--                       inclusive o legado da Evolution, que só tem data_primeiro_contato);
--   whatsapp_mensagens  mensagens nossas (from_me) nas conversas do escopo, follow-ups incluídos. O legado sem
--                       conversa ligada não entra aqui, por isso este número começa baixo em jun–ago/2026;
--   email               médicos com e-mail entregue (email_envios.entregue_em);
--   linkedin, instagram toques registrados em campanha_lead_touches (fila do dia ou motor), sem os pulados e os
--                       com erro. O LinkedIn só tem dado desde 11/11/2026; o Instagram, desde 13/11/2026.
create or replace function public.bi_raiox_esforco(p_especialidade_ids uuid[], p_ufs text[] default null, p_desde date default null)
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

  with escopo as (select lead_id from _raiox_leads(p_especialidade_ids, p_ufs)),
  contatos as (select * from _raiox_contatos(p_especialidade_ids, p_ufs, p_desde)),
  sem as (
    -- Semana em Brasília: date_trunc em timestamptz usaria UTC e jogaria domingo à noite na semana seguinte.
    select date_trunc('week', ts at time zone 'America/Sao_Paulo')::date as semana, canal, n
      from (
        select min(c.primeiro_em) as ts, 'whatsapp_medicos'::text as canal, 1 as n
          from contatos c where c.entregue group by c.lead_id
        union all
        select m.sent_at, 'whatsapp_mensagens', 1
          from sigzap_messages m
          join (select distinct conversation_id from contatos where conversation_id is not null) cv
            on cv.conversation_id = m.conversation_id
         where m.from_me and m.sent_at >= coalesce(p_desde, '2000-01-01'::date)
        union all
        select min(ee.entregue_em), 'email', 1
          from email_envios ee join escopo e on e.lead_id = ee.lead_id
         where ee.entregue_em is not null and ee.entregue_em >= coalesce(p_desde, '2000-01-01'::date)
         group by ee.lead_id
        union all
        select t.executado_em, t.canal, 1
          from campanha_lead_touches t
          join campanha_leads cl on cl.id = t.campanha_lead_id
          join escopo e on e.lead_id = cl.lead_id
         where t.canal in ('linkedin', 'instagram')
           and t.executado_em is not null and t.executado_em >= coalesce(p_desde, '2000-01-01'::date)
           and coalesce(t.resultado, '') <> 'pulado' and coalesce(t.resultado, '') !~* '^(erro|falh)'
      ) x
     where ts is not null
  ),
  por_semana as (
    select semana,
           count(*) filter (where canal = 'whatsapp_medicos')   as whatsapp_medicos,
           count(*) filter (where canal = 'whatsapp_mensagens') as whatsapp_mensagens,
           count(*) filter (where canal = 'email')              as email,
           count(*) filter (where canal = 'linkedin')           as linkedin,
           count(*) filter (where canal = 'instagram')          as instagram
      from sem group by semana
  )
  select jsonb_build_object(
    'semanas', coalesce((select jsonb_agg(to_jsonb(p) order by p.semana) from por_semana p), '[]'::jsonb),
    'totais', jsonb_build_object(
      'whatsapp_medicos',   (select coalesce(sum(whatsapp_medicos), 0) from por_semana),
      'whatsapp_mensagens', (select coalesce(sum(whatsapp_mensagens), 0) from por_semana),
      'email',              (select coalesce(sum(email), 0) from por_semana),
      'linkedin',           (select coalesce(sum(linkedin), 0) from por_semana),
      'instagram',          (select coalesce(sum(instagram), 0) from por_semana)),
    'desde', (select min(semana) from por_semana)
  ) into v;
  return v;
end;
$$;

revoke all on function public.bi_raiox_esforco(uuid[], text[], date) from public, anon;
grant execute on function public.bi_raiox_esforco(uuid[], text[], date) to authenticated, service_role;
