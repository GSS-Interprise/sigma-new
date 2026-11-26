-- BI Raio-X: filtro de campanha (26/11/2026, Raul: "filtrar por campanha, antes da especialidade, para enxergar o
-- alcance de cada campanha, e os da Zenvia também"). p_campanha_ids (opcional, null = todas) entra nas 5 funções da
-- tela. A Zenvia é uma campanha só no Raio-X (id md5('zenvia'), como em _raiox_contatos). Com campanha escolhida o
-- e-mail fica de fora do alcance e do esforço: e-mail não pertence a uma campanha de WhatsApp.
-- _raiox_contatos fica como está (3 argumentos); a versão com campanha tem outro nome para não criar ambiguidade.
create or replace function public._raiox_contatos_c(p_especialidade_ids uuid[], p_ufs text[], p_desde date, p_campanha_ids uuid[])
returns table(lead_id uuid, campanha_id uuid, campanha_lead_id uuid, conversation_id uuid, primeiro_em timestamptz, entregue boolean,
              respondeu boolean, ultima_do_medico timestamptz, ultima_nossa timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select * from _raiox_contatos(p_especialidade_ids, p_ufs, p_desde) c
   where cardinality(coalesce(p_campanha_ids, '{}')) = 0 or c.campanha_id = any(p_campanha_ids);
$$;
revoke all on function public._raiox_contatos_c(uuid[], text[], date, uuid[]) from public, anon;

drop function if exists public.bi_raiox_funil(uuid[], text[], date);
CREATE OR REPLACE FUNCTION public.bi_raiox_funil(p_especialidade_ids uuid[], p_ufs text[] DEFAULT NULL::text[], p_desde date DEFAULT NULL::date, p_campanha_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'authentication_required'; end if;

  with escopo as materialized (select lead_id from _raiox_leads(p_especialidade_ids, p_ufs)),
  mercado as (
    select sg_uf, medicos from bi_mercado_cfm where especialidade_id = any(p_especialidade_ids)
  ),
  contatos as materialized (select * from _raiox_contatos_c(p_especialidade_ids, p_ufs, p_desde, p_campanha_ids)),
  por_medico as (
    select lead_id, bool_or(entregue) as entregue, bool_or(respondeu) as respondeu, min(primeiro_em) as primeiro_em
      from contatos group by 1
  ),
  email as (
    select distinct ee.lead_id
      from email_envios ee
      join escopo e on e.lead_id = ee.lead_id
     where ee.entregue_em is not null and ee.entregue_em >= coalesce(p_desde, '2000-01-01'::date) and cardinality(coalesce(p_campanha_ids, '{}')) = 0
  ),
  interesse as (
    select cl.lead_id,
           bool_or(cl.status::text = 'convertido') as convertido,
           bool_or(cl.status::text in ('quente', 'convertido') or cc.resultado = 'interessado') as interessado
      from campanha_leads cl
      join (select distinct lead_id from contatos) c on c.lead_id = cl.lead_id
      left join conversa_classificacao cc on cc.campanha_lead_id = cl.id
     where cardinality(coalesce(p_campanha_ids, '{}')) = 0 or cl.campanha_id = any(p_campanha_ids)
     group by 1
  )
  select jsonb_build_object(
    'mercado_brasil', (select coalesce(sum(medicos), 0) from mercado),
    'mercado_regiao', case when cardinality(coalesce(p_ufs, '{}')) = 0 then null
                           else (select coalesce(sum(medicos), 0) from mercado where sg_uf = any(p_ufs)) end,
    'base_crm', (select count(*) from escopo),
    'alcancados', (select count(*) from (select lead_id from por_medico where entregue union select lead_id from email) u),
    'alcancados_whatsapp', (select count(*) from por_medico where entregue),
    'alcancados_email', (select count(*) from email),
    'responderam', (select count(*) from por_medico where respondeu),
    'interessados', (select count(*) from interesse where interessado),
    'contratados', (select count(*) from interesse where convertido),
    'campanhas', (select count(distinct campanha_id) from contatos),
    'desde', (select min(primeiro_em) from por_medico),
    'classificadas', (select count(*) from conversa_classificacao cc join contatos c on c.campanha_lead_id = cc.campanha_lead_id),
    'cfm_atualizado_em', (select max(importado_em) from cfm_medicos_staging)
  ) into v;
  return v;
end;
$function$;
revoke all on function public.bi_raiox_funil(uuid[], text[], date, uuid[]) from public, anon;
grant execute on function public.bi_raiox_funil(uuid[], text[], date, uuid[]) to authenticated, service_role;

drop function if exists public.bi_raiox_objecoes(uuid[], text[], date);
CREATE OR REPLACE FUNCTION public.bi_raiox_objecoes(p_especialidade_ids uuid[], p_ufs text[] DEFAULT NULL::text[], p_desde date DEFAULT NULL::date, p_campanha_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'authentication_required'; end if;

  with cl as (
    select cc.*
      from conversa_classificacao cc
      join _raiox_contatos_c(p_especialidade_ids, p_ufs, p_desde, p_campanha_ids) c on c.campanha_lead_id = cc.campanha_lead_id
  ),
  obj as (select * from cl where resultado = 'objecao'),
  valores as (
    select valor_unidade, count(*) as n, percentile_cont(0.5) within group (order by valor_pedido) as mediana
      from cl where valor_pedido is not null and valor_unidade is not null group by 1
  )
  select jsonb_build_object(
    'classificadas', (select count(*) from cl),
    'com_motivo', (select count(*) from obj),
    'objecoes', coalesce((
      select jsonb_agg(x order by x.n desc) from (
        select o.objecao, count(*) as n,
               round(100.0 * count(*) / nullif((select count(*) from obj), 0)) as pct,
               (select o2.trecho from obj o2 where o2.objecao = o.objecao and o2.trecho is not null
                 order by o2.confianca desc nulls last, o2.classificado_em desc limit 1) as trecho
          from obj o group by o.objecao) x), '[]'::jsonb),
    'outros', jsonb_build_object(
      'sem_interesse', (select count(*) from cl where resultado = 'sem_interesse'),
      'filtro_secretaria', (select count(*) from cl where resultado = 'filtro_secretaria'),
      'indicacao', (select count(*) from cl where resultado = 'indicacao'),
      'contato_errado', (select count(*) from cl where resultado = 'contato_errado'),
      'fora_do_perfil', (select count(*) from cl where resultado = 'fora_do_perfil'),
      'desconfianca', (select count(*) from cl where resultado = 'desconfianca'),
      'interessado', (select count(*) from cl where resultado = 'interessado')),
    'valores', coalesce((select jsonb_agg(jsonb_build_object('unidade', valor_unidade, 'n', n, 'mediana', round(mediana::numeric))) from valores), '[]'::jsonb)
  ) into v;
  return v;
end;
$function$;
revoke all on function public.bi_raiox_objecoes(uuid[], text[], date, uuid[]) from public, anon;
grant execute on function public.bi_raiox_objecoes(uuid[], text[], date, uuid[]) to authenticated, service_role;

drop function if exists public.bi_raiox_destrava(uuid[], text[], date);
CREATE OR REPLACE FUNCTION public.bi_raiox_destrava(p_especialidade_ids uuid[], p_ufs text[] DEFAULT NULL::text[], p_desde date DEFAULT NULL::date, p_campanha_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o jsonb;
  v_regras jsonb := '[]'::jsonb;
  v_dist numeric;
  v_agenda numeric;
  v_indic int;
  v_valor jsonb;
  v_oferta numeric;
  v_nao_abordados bigint;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'authentication_required'; end if;
  o := bi_raiox_objecoes(p_especialidade_ids, p_ufs, p_desde);

  select (x ->> 'pct')::numeric into v_dist from jsonb_array_elements(o -> 'objecoes') x where x ->> 'objecao' = 'distancia';
  select (x ->> 'pct')::numeric into v_agenda from jsonb_array_elements(o -> 'objecoes') x where x ->> 'objecao' = 'agenda';
  v_indic := coalesce((o -> 'outros' ->> 'indicacao')::int, 0);
  select x into v_valor from jsonb_array_elements(o -> 'valores') x order by (x ->> 'n')::int desc limit 1;

  -- Oferta atual = mediana do valor das vagas abertas da especialidade (na região, se houver).
  -- vagas.valor é texto livre ("R$ 1.800 / 12 h"): pega o primeiro número no formato brasileiro.
  select percentile_cont(0.5) within group (order by
           replace(replace(substring(valor from '\d[\d\.]*(?:,\d+)?'), '.', ''), ',', '.')::numeric) into v_oferta
    from vagas where status in ('aberta', 'em_negociacao') and valor ~ '\d'
     and especialidade_id = any(p_especialidade_ids)
     and (cardinality(coalesce(p_ufs, '{}')) = 0 or uf = any(p_ufs));

  select count(*) into v_nao_abordados
    from _raiox_leads(p_especialidade_ids, p_ufs) l
   where not exists (select 1 from campanha_leads cl where cl.lead_id = l.lead_id);

  if coalesce(v_dist, 0) >= 30 then
    v_regras := v_regras || jsonb_build_object('regra', 'distancia', 'pct', v_dist, 'nao_abordados_na_regiao', v_nao_abordados);
  end if;
  if coalesce((v_valor ->> 'n')::int, 0) >= 10 then
    v_regras := v_regras || jsonb_build_object('regra', 'valor', 'n', (v_valor ->> 'n')::int, 'mediana', (v_valor ->> 'mediana')::numeric,
                                               'unidade', v_valor ->> 'unidade', 'oferta_atual', round(v_oferta));
  end if;
  if coalesce(v_agenda, 0) >= 20 then
    v_regras := v_regras || jsonb_build_object('regra', 'agenda', 'pct', v_agenda);
  end if;
  if v_indic > 0 then
    v_regras := v_regras || jsonb_build_object('regra', 'indicacao', 'n', v_indic);
  end if;

  return jsonb_build_object('regras', v_regras, 'nao_abordados_na_regiao', v_nao_abordados,
                            'classificadas', (o ->> 'classificadas')::int);
end;
$function$;
revoke all on function public.bi_raiox_destrava(uuid[], text[], date, uuid[]) from public, anon;
grant execute on function public.bi_raiox_destrava(uuid[], text[], date, uuid[]) to authenticated, service_role;

drop function if exists public.bi_raiox_gestao(uuid[], text[], date);
CREATE OR REPLACE FUNCTION public.bi_raiox_gestao(p_especialidade_ids uuid[], p_ufs text[] DEFAULT NULL::text[], p_desde date DEFAULT NULL::date, p_campanha_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'authentication_required'; end if;

  with c as (select * from _raiox_contatos_c(p_especialidade_ids, p_ufs, p_desde, p_campanha_ids)),
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
$function$;
revoke all on function public.bi_raiox_gestao(uuid[], text[], date, uuid[]) from public, anon;
grant execute on function public.bi_raiox_gestao(uuid[], text[], date, uuid[]) to authenticated, service_role;

drop function if exists public.bi_raiox_esforco(uuid[], text[], date);
CREATE OR REPLACE FUNCTION public.bi_raiox_esforco(p_especialidade_ids uuid[], p_ufs text[] DEFAULT NULL::text[], p_desde date DEFAULT NULL::date, p_campanha_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then raise exception 'authentication_required'; end if;

  with escopo as (select lead_id from _raiox_leads(p_especialidade_ids, p_ufs)),
  contatos as (select * from _raiox_contatos_c(p_especialidade_ids, p_ufs, p_desde, p_campanha_ids)),
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
         where ee.entregue_em is not null and ee.entregue_em >= coalesce(p_desde, '2000-01-01'::date) and cardinality(coalesce(p_campanha_ids, '{}')) = 0
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
$function$;
revoke all on function public.bi_raiox_esforco(uuid[], text[], date, uuid[]) from public, anon;
grant execute on function public.bi_raiox_esforco(uuid[], text[], date, uuid[]) to authenticated, service_role;
