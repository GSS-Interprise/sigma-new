-- Leitura por IA das respostas da Zenvia (27/11/2026, Raul: "só 18 respostas de médicos é muito pouco").
-- A conversas-classificar só lia conversas de campanha do Sigma (chave campanha_lead_id). As 950 respostas da Zenvia
-- (627 médicos) ficavam de fora, e o "Por que dizem não" do BI mostrava 0 na Zenvia. Agora a classificação aceita
-- uma conversa da Zenvia pela chave zenvia_telefone (telefone normalizado), com fila própria, e o BI junta essas
-- classificações pelo lead (a Zenvia não tem campanha_lead).
alter table public.conversa_classificacao alter column campanha_lead_id drop not null;
alter table public.conversa_classificacao add column if not exists zenvia_telefone text;
create unique index if not exists conversa_classificacao_zenvia_telefone_key on public.conversa_classificacao (zenvia_telefone);
alter table public.conversa_classificacao drop constraint if exists conversa_classificacao_chave_check;
alter table public.conversa_classificacao add constraint conversa_classificacao_chave_check
  check (campanha_lead_id is not null or zenvia_telefone is not null);
create index if not exists conversa_classificacao_lead_idx on public.conversa_classificacao (lead_id) where zenvia_telefone is not null;

-- Fila da Zenvia: médico que respondeu e ainda não foi lido, ou falou de novo depois da leitura. A mensagem de
-- abertura é modelo da Zenvia (o texto não vem no evento): entra como "[mensagem da GSS oferecendo a vaga]".
create or replace function public.zenvia_classificar_pendentes(p_limite int default 40)
returns table (zenvia_telefone text, lead_id uuid, especialidade_id uuid, ultima_do_medico timestamptz, conversa text)
language sql stable security definer set search_path = public as $$
  with resp as (
    select z.telefone_norm, max(z.evento_em) as ultima
      from zenvia_eventos z
     where z.tipo = 'MESSAGE' and z.direcao = 'IN' and coalesce(trim(z.texto), '') <> '' and z.telefone_norm is not null
     group by 1
  ),
  fila as (
    select r.*
      from resp r
      left join conversa_classificacao cc on cc.zenvia_telefone = r.telefone_norm
     where cc.id is null or cc.mensagens_ate < r.ultima
     order by r.ultima desc
     limit greatest(1, least(p_limite, 200))
  )
  select f.telefone_norm,
         (select z.lead_id from zenvia_eventos z where z.telefone_norm = f.telefone_norm and z.lead_id is not null limit 1),
         (select d.especialidade_id from zenvia_disparos d where d.telefone = f.telefone_norm and d.especialidade_id is not null
           order by d.primeiro_em limit 1),
         f.ultima,
         'GSS: [mensagem da GSS oferecendo plantao ou vaga]' || E'\n' ||
         (select string_agg(case when t.direcao = 'OUT' then 'GSS: ' else 'Médico: ' end || left(t.texto, 500), E'\n' order by t.evento_em)
            from (select x.direcao, x.texto, x.evento_em from zenvia_eventos x
                   where x.telefone_norm = f.telefone_norm and x.tipo = 'MESSAGE' and coalesce(trim(x.texto), '') <> ''
                   order by x.evento_em desc limit 30) t)
    from fila f;
$$;
revoke all on function public.zenvia_classificar_pendentes(int) from public, anon, authenticated;
grant execute on function public.zenvia_classificar_pendentes(int) to service_role;

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
  -- Zenvia escolhida no filtro (27/11, Maikon viu 1.017 no BI e 1.603 na campanha): conta como a campanha, por
  -- telefone, todos os que a campanha da especialidade alcançou, inclusive número fora do Sigma ou lead sem a
  -- especialidade cadastrada. A campanha é nacional: aqui o filtro de UF não se aplica. Sem a Zenvia no filtro, a
  -- conta segue por lead, como antes.
  zen as (
    select d.telefone, bool_or(d.entregue) as entregue, bool_or(d.respondeu) as respondeu, min(d.primeiro_em) as primeiro_em
      from zenvia_disparos d
     where md5('zenvia')::uuid = any(coalesce(p_campanha_ids, '{}')) and d.saiu
       and d.especialidade_id = any(p_especialidade_ids) and d.primeiro_em >= coalesce(p_desde, '2000-01-01'::date)
     group by 1
  ),
  por_medico as (
    select lead_id, bool_or(entregue) as entregue, bool_or(respondeu) as respondeu, min(primeiro_em) as primeiro_em
      from contatos
     where not (md5('zenvia')::uuid = any(coalesce(p_campanha_ids, '{}')) and campanha_id = md5('zenvia')::uuid)
     group by 1
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
    'alcancados', (select count(*) from (select lead_id from por_medico where entregue union select lead_id from email) u)
                  + (select count(*) from zen where entregue),
    'alcancados_whatsapp', (select count(*) from por_medico where entregue) + (select count(*) from zen where entregue),
    'alcancados_email', (select count(*) from email),
    'responderam', (select count(*) from por_medico where respondeu) + (select count(*) from zen where respondeu),
    'interessados', (select count(*) from interesse where interessado)
                    + (select count(*) from zen z join conversa_classificacao cc on cc.zenvia_telefone = z.telefone where cc.resultado = 'interessado'),
    'contratados', (select count(*) from interesse where convertido),
    'campanhas', (select count(distinct campanha_id) from contatos),
    'desde', (select min(x) from (select min(primeiro_em) x from por_medico union all select min(primeiro_em) from zen) m),
    'classificadas', (select count(*) from conversa_classificacao cc join contatos c on (c.campanha_lead_id = cc.campanha_lead_id or (c.campanha_lead_id is null and cc.zenvia_telefone is not null and cc.lead_id = c.lead_id))
                       where not (md5('zenvia')::uuid = any(coalesce(p_campanha_ids, '{}')) and c.campanha_id = md5('zenvia')::uuid))
                     + (select count(*) from zen z join conversa_classificacao cc on cc.zenvia_telefone = z.telefone),
    'cfm_atualizado_em', (select max(importado_em) from cfm_medicos_staging)
  ) into v;
  return v;
end;
$function$;
revoke all on function public.bi_raiox_funil(uuid[], text[], date, uuid[]) from public, anon;
grant execute on function public.bi_raiox_funil(uuid[], text[], date, uuid[]) to authenticated, service_role;

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

  -- Com a Zenvia no filtro, as respostas dela entram por telefone (como no funil), não pelo lead com a especialidade.
  with cl as (
    select distinct cc.*
      from conversa_classificacao cc
      join _raiox_contatos_c(p_especialidade_ids, p_ufs, p_desde, p_campanha_ids) c on (c.campanha_lead_id = cc.campanha_lead_id or (c.campanha_lead_id is null and cc.zenvia_telefone is not null and cc.lead_id = c.lead_id))
     where not (md5('zenvia')::uuid = any(coalesce(p_campanha_ids, '{}')) and c.campanha_id = md5('zenvia')::uuid)
    union
    select cc.*
      from conversa_classificacao cc
     where md5('zenvia')::uuid = any(coalesce(p_campanha_ids, '{}'))
       and cc.zenvia_telefone in (select d.telefone from zenvia_disparos d
                                   where d.especialidade_id = any(p_especialidade_ids) and d.primeiro_em >= coalesce(p_desde, '2000-01-01'::date))
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

