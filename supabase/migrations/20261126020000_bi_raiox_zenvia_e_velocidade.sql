-- Raio-X do BI com a Zenvia e mais rápido (25/11/2026).
--
-- 1) A Zenvia entra no Raio-X: _raiox_contatos soma, por lead do escopo, os envios da Zenvia (zenvia_eventos com o lead
--    achado por fn_zenvia_evento_lead): entregue = status DELIVERED/READ; respondeu = MESSAGE IN depois do 1º envio.
--    Todo o Raio-X que usa _raiox_contatos (funil, esforço, objeções, destrava, gestão) passa a contar a Zenvia.
--    A Zenvia não tem campanha no Sigma: as linhas dela levam um campanha_id fixo (md5('zenvia')), sem campanha_lead_id
--    (não entram em "interessados"/"contratados", que vêm do Kanban da campanha).
-- 2) Velocidade: o funil levava 2,6 s em Pediatria. A contagem do mercado (CFM, ~800 mil médicos) vira tabela
--    pré-calculada (bi_mercado_cfm, recalculada no domingo e depois de cada importação do CFM, quem importar chama
--    bi_mercado_cfm_atualizar()); o funil passa a buscar o escopo de leads uma vez só.

create table if not exists public.bi_mercado_cfm (
  especialidade_id uuid not null,
  sg_uf text not null,
  medicos int not null,
  atualizado_em timestamptz not null default now(),
  primary key (especialidade_id, sg_uf)
);
grant select, insert, update, delete on public.bi_mercado_cfm to service_role;
grant select on public.bi_mercado_cfm to authenticated;
alter table public.bi_mercado_cfm enable row level security;
drop policy if exists bi_mercado_cfm_ler on public.bi_mercado_cfm;
create policy bi_mercado_cfm_ler on public.bi_mercado_cfm for select to authenticated using (true);

create or replace function public.bi_mercado_cfm_atualizar()
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  delete from bi_mercado_cfm;
  insert into bi_mercado_cfm (especialidade_id, sg_uf, medicos)
  select me.especialidade_id, me.sg_uf, count(distinct me.nu_crm)
    from cfm_medico_especialidades me
    join cfm_medicos_staging m on m.nu_crm = me.nu_crm and m.sg_uf = me.sg_uf
   where coalesce(m.situacao, '') !~* 'falecid|cassad|cancelad'
   group by 1, 2;
  get diagnostics v = row_count;
  return v;
end $$;
revoke all on function public.bi_mercado_cfm_atualizar() from public, anon, authenticated;
grant execute on function public.bi_mercado_cfm_atualizar() to service_role;
select public.bi_mercado_cfm_atualizar();

do $$ begin
  perform cron.unschedule('bi-mercado-cfm-semanal') where exists (select 1 from cron.job where jobname = 'bi-mercado-cfm-semanal');
  perform cron.schedule('bi-mercado-cfm-semanal', '0 6 * * 0', 'select public.bi_mercado_cfm_atualizar()');
end $$;

create or replace function public._raiox_contatos(p_especialidade_ids uuid[], p_ufs text[], p_desde date)
returns table (lead_id uuid, campanha_id uuid, campanha_lead_id uuid, conversation_id uuid, primeiro_em timestamptz,
               entregue boolean, respondeu boolean, ultima_do_medico timestamptz, ultima_nossa timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with escopo as materialized (select lead_id from _raiox_leads(p_especialidade_ids, p_ufs)),
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
  ),
  -- Zenvia: um contato por lead, do 1º envio às respostas depois dele.
  zenvia as (
    select z.lead_id,
           min(z.evento_em) filter (where z.tipo = 'MESSAGE_STATUS' or z.direcao = 'OUT') as primeiro_em,
           bool_or(z.tipo = 'MESSAGE_STATUS' and z.status in ('DELIVERED', 'READ')) as entregue,
           max(z.evento_em) filter (where z.tipo = 'MESSAGE' and z.direcao = 'IN') as ultima_in,
           max(z.evento_em) filter (where z.tipo = 'MESSAGE_STATUS' or z.direcao = 'OUT') as ultima_out
      from zenvia_eventos z join escopo e on e.lead_id = z.lead_id
     group by 1
  )
  select v.lead_id, v.campanha_id, v.campanha_lead_id, v.conversation_id, v.primeiro_em, v.entregue,
         r.ultima is not null or (v.legado and v.st in ('em_conversa', 'quente', 'convertido')), r.ultima, n.ultima
    from envios v
    left join lateral (select max(x.sent_at) as ultima from sigzap_messages x
                        where x.conversation_id = v.conversation_id and not x.from_me and x.sent_at > v.primeiro_em) r on true
    left join lateral (select max(x.sent_at) as ultima from sigzap_messages x
                        where x.conversation_id = v.conversation_id and x.from_me) n on true
  union all
  select z.lead_id, md5('zenvia')::uuid, null::uuid, null::uuid, z.primeiro_em, coalesce(z.entregue, false),
         z.ultima_in > z.primeiro_em, case when z.ultima_in > z.primeiro_em then z.ultima_in end, z.ultima_out
    from zenvia z
   where z.primeiro_em is not null and z.primeiro_em >= coalesce(p_desde, '2000-01-01'::date);
$$;
revoke all on function public._raiox_contatos(uuid[], text[], date) from public, anon, authenticated;

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

  with escopo as materialized (select lead_id from _raiox_leads(p_especialidade_ids, p_ufs)),
  mercado as (
    select sg_uf, medicos from bi_mercado_cfm where especialidade_id = any(p_especialidade_ids)
  ),
  contatos as materialized (select * from _raiox_contatos(p_especialidade_ids, p_ufs, p_desde)),
  por_medico as (
    select lead_id, bool_or(entregue) as entregue, bool_or(respondeu) as respondeu, min(primeiro_em) as primeiro_em
      from contatos group by 1
  ),
  email as (
    select distinct ee.lead_id
      from email_envios ee
      join escopo e on e.lead_id = ee.lead_id
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
$$;
revoke all on function public.bi_raiox_funil(uuid[], text[], date) from public, anon;
grant execute on function public.bi_raiox_funil(uuid[], text[], date) to authenticated, service_role;
