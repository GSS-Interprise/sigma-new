-- Universo do CFM conta também ÁREA DE ATUAÇÃO (Raul, 17/11/2026: "Eletrofisiologia Clínica Invasiva" dava 0 médicos).
-- No CFM a área de atuação vem dentro da especialidade-mãe, com caixa mista:
--   "&CARDIOLOGIA - RQE Nº: 70850 (Áreas de atuação: Estimulação Cardíaca ... - RQE Nº: 708502 / Eletrofisiologia
--    Clínica Invasiva - RQE Nº: 708501)"
-- Então, além do nome exato entre "&" (especialidade), casa o nome depois de ": " ou "/ " seguido de " -", sem
-- diferença de maiúscula (upper nos dois lados).

create or replace function public.campanha_assistente_universo_cfm(p_especialidade_ids uuid[], p_ufs text[] default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with nomes as (
    select upper(e.nome) as nome from especialidades e where e.id = any(coalesce(p_especialidade_ids, '{}'))
  ),
  medicos as (
    select distinct m.nu_crm, m.sg_uf
    from cfm_medicos_staging m
    join nomes n
      on m.especialidade like '%&' || n.nome || ' -%'
      or m.especialidade like '%&' || n.nome || '&%'
      or m.especialidade like '%&' || n.nome
      or upper(m.especialidade) like '%: ' || n.nome || ' -%'
      or upper(m.especialidade) like '%/ ' || n.nome || ' -%'
    where coalesce(m.situacao, '') !~* 'falecid|cassad|cancelad'
  )
  select jsonb_build_object(
    'brasil', (select count(*) from medicos),
    'nas_ufs', case when p_ufs is null or cardinality(p_ufs) = 0 then null
                    else (select count(*) from medicos where sg_uf = any(p_ufs)) end,
    'atualizado_em', (select max(importado_em) from cfm_medicos_staging)
  )
  where auth.uid() is not null;
$$;

revoke all on function public.campanha_assistente_universo_cfm(uuid[], text[]) from public, anon;
grant execute on function public.campanha_assistente_universo_cfm(uuid[], text[]) to authenticated, service_role;
