-- Fase 7.3 do plano GSS dono no comando: funções do Raio-X do mercado médico.
-- Spec: docs/arquitetura/bi-raio-x-mercado-medico.md, seções 4 a 6.
-- Escopo comum: médicos (leads) com a especialidade em lead_especialidades ou leads.especialidade_id,
-- na região (leads.uf) quando p_ufs é dado. p_desde corta pelo 1º envio da campanha.
-- "Alcançado" = mensagem entregue (nunca "enviada"), regra da spec para não inflar número.

create or replace function public._raiox_leads(p_especialidade_ids uuid[], p_ufs text[])
returns table (lead_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select l.id
    from leads l
   where (cardinality(coalesce(p_ufs, '{}')) = 0 or l.uf = any(p_ufs))
     and (l.especialidade_id = any(p_especialidade_ids)
          or exists (select 1 from lead_especialidades le where le.lead_id = l.id and le.especialidade_id = any(p_especialidade_ids)));
$$;
revoke all on function public._raiox_leads(uuid[], text[]) from public, anon, authenticated;

-- Um registro por médico em campanha (campanha_lead) com o 1º contato desde p_desde.
-- Três gerações de dado, do mais confiável ao menos:
--   1. mensagens ligadas por sigzap_messages.campanha_lead_id (Chakra, com status de entrega);
--   2. só campanha_leads.conversa_id (parte dos envios de nov/2026): entrega lida da conversa;
--   3. legado Evolution (jun–ago/2026): só data_primeiro_contato. O envio teve sucesso, mas sem
--      recibo de entrega nem conversa ligada; conta como alcançado e a resposta vem do status.
create or replace function public._raiox_contatos(p_especialidade_ids uuid[], p_ufs text[], p_desde date)
returns table (lead_id uuid, campanha_id uuid, campanha_lead_id uuid, conversation_id uuid, primeiro_em timestamptz,
               entregue boolean, respondeu boolean, ultima_do_medico timestamptz, ultima_nossa timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with escopo as (select lead_id from _raiox_leads(p_especialidade_ids, p_ufs)),
  base as (
    select cl.id as campanha_lead_id, cl.lead_id, cl.campanha_id, cl.data_primeiro_contato, cl.conversa_id, cl.status::text as st
      from campanha_leads cl join escopo e on e.lead_id = cl.lead_id
  ),
  ligadas as (
    select m.campanha_lead_id, min(m.sent_at) as primeiro,
           (array_agg(m.conversation_id order by m.sent_at))[1] as conv,
           bool_or(m.message_status in ('delivered', 'read')) as entregue
      from sigzap_messages m join base b on b.campanha_lead_id = m.campanha_lead_id
     where m.from_me
     group by 1
  ),
  envios as (
    select b.lead_id, b.campanha_id, b.campanha_lead_id, b.st,
           coalesce(l.primeiro, b.data_primeiro_contato) as primeiro_em,
           coalesce(l.conv, b.conversa_id) as conversation_id,
           case when l.campanha_lead_id is not null then l.entregue
                when b.conversa_id is not null then exists (
                  select 1 from sigzap_messages x where x.conversation_id = b.conversa_id and x.from_me and x.message_status in ('delivered', 'read'))
                else true end as entregue,
           (l.campanha_lead_id is null and b.conversa_id is null) as legado
      from base b left join ligadas l on l.campanha_lead_id = b.campanha_lead_id
     where coalesce(l.primeiro, b.data_primeiro_contato) >= coalesce(p_desde, '2000-01-01'::date)
  )
  select v.lead_id, v.campanha_id, v.campanha_lead_id, v.conversation_id, v.primeiro_em, v.entregue,
         r.ultima is not null or (v.legado and v.st in ('em_conversa', 'quente', 'convertido')), r.ultima, n.ultima
    from envios v
    left join lateral (select max(x.sent_at) as ultima from sigzap_messages x
                        where x.conversation_id = v.conversation_id and not x.from_me and x.sent_at > v.primeiro_em) r on true
    left join lateral (select max(x.sent_at) as ultima from sigzap_messages x
                        where x.conversation_id = v.conversation_id and x.from_me) n on true;
$$;
revoke all on function public._raiox_contatos(uuid[], text[], date) from public, anon, authenticated;

-- Blocos 1 a 3: mercado, o que já fizemos, como o mercado responde.
create or replace function public.bi_raiox_funil(p_especialidade_ids uuid[], p_ufs text[] default null, p_desde date default null)
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

  with mercado as (
    select me.nu_crm, me.sg_uf
      from cfm_medico_especialidades me
      join cfm_medicos_staging m on m.nu_crm = me.nu_crm and m.sg_uf = me.sg_uf
     where me.especialidade_id = any(p_especialidade_ids)
       and coalesce(m.situacao, '') !~* 'falecid|cassad|cancelad'
     group by 1, 2
  ),
  contatos as (select * from _raiox_contatos(p_especialidade_ids, p_ufs, p_desde)),
  por_medico as (
    select lead_id, bool_or(entregue) as entregue, bool_or(respondeu) as respondeu, min(primeiro_em) as primeiro_em
      from contatos group by 1
  ),
  email as (
    select distinct ee.lead_id
      from email_envios ee
      join (select lead_id from _raiox_leads(p_especialidade_ids, p_ufs)) e on e.lead_id = ee.lead_id
     where ee.entregue_em is not null and ee.entregue_em >= coalesce(p_desde, '2000-01-01'::date)
  ),
  interesse as (
    select cl.lead_id,
           bool_or(cl.status::text = 'convertido') as convertido,
           bool_or(cl.status::text in ('quente', 'convertido') or cc.resultado = 'interessado') as interessado
      from campanha_leads cl
      join (select distinct lead_id from contatos) c on c.lead_id = cl.lead_id
      left join conversa_classificacao cc on cc.campanha_lead_id = cl.id
     group by 1
  )
  select jsonb_build_object(
    'mercado_brasil', (select count(*) from mercado),
    'mercado_regiao', case when cardinality(coalesce(p_ufs, '{}')) = 0 then null
                           else (select count(*) from mercado where sg_uf = any(p_ufs)) end,
    'base_crm', (select count(*) from _raiox_leads(p_especialidade_ids, p_ufs)),
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
$$;

-- Bloco 4: por que dizem não (só existe com a classificação da 7.2).
create or replace function public.bi_raiox_objecoes(p_especialidade_ids uuid[], p_ufs text[] default null, p_desde date default null)
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

  with cl as (
    select cc.*
      from conversa_classificacao cc
      join _raiox_contatos(p_especialidade_ids, p_ufs, p_desde) c on c.campanha_lead_id = cc.campanha_lead_id
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
$$;

-- Bloco 5: o que destrava. Regras fixas sobre os números (spec §4), não texto livre da IA.
create or replace function public.bi_raiox_destrava(p_especialidade_ids uuid[], p_ufs text[] default null, p_desde date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
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
$$;

-- Modo gestão (só GSS): médicos esperando resposta nossa, tempo da 1ª resposta, por campanha.
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
  tempo as (
    select extract(epoch from (
             (select min(x.sent_at) from sigzap_messages x
               where x.conversation_id = cc.conversation_id and x.from_me and x.sent_at > p.medico_em) - p.medico_em)) / 60 as minutos
      from primeira_resposta p join c cc on cc.campanha_lead_id = p.campanha_lead_id
  )
  select jsonb_build_object(
    'esperando_resposta', (select count(*) from esperando),
    'esperando', coalesce((
      select jsonb_agg(x order by x.ultima_do_medico) from (
        select e.conversation_id, e.ultima_do_medico, coalesce(l.nome, 'Sem nome') as nome, ca.nome as campanha
          from esperando e left join leads l on l.id = e.lead_id left join campanhas ca on ca.id = e.campanha_id
         order by e.ultima_do_medico limit 20) x), '[]'::jsonb),
    'mediana_primeira_resposta_min', (select round(percentile_cont(0.5) within group (order by minutos)::numeric) from tempo where minutos is not null),
    'sem_resposta_nossa', (select count(*) from tempo where minutos is null),
    'por_campanha', coalesce((
      select jsonb_agg(x order by x.alcancados desc) from (
        select ca.id, ca.nome, count(*) filter (where c.entregue) as alcancados,
               count(*) filter (where c.respondeu) as responderam,
               count(*) filter (where not c.entregue) as nao_entregues
          from c join campanhas ca on ca.id = c.campanha_id
         group by 1, 2) x), '[]'::jsonb)
  ) into v;
  return v;
end;
$$;

revoke all on function public.bi_raiox_funil(uuid[], text[], date) from public, anon;
revoke all on function public.bi_raiox_objecoes(uuid[], text[], date) from public, anon;
revoke all on function public.bi_raiox_destrava(uuid[], text[], date) from public, anon;
revoke all on function public.bi_raiox_gestao(uuid[], text[], date) from public, anon;
grant execute on function public.bi_raiox_funil(uuid[], text[], date) to authenticated, service_role;
grant execute on function public.bi_raiox_objecoes(uuid[], text[], date) to authenticated, service_role;
grant execute on function public.bi_raiox_destrava(uuid[], text[], date) to authenticated, service_role;
grant execute on function public.bi_raiox_gestao(uuid[], text[], date) to authenticated, service_role;
