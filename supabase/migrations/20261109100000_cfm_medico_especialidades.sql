-- Fase 7.1 do plano GSS dono no comando (Raio-X do mercado): universo CFM normalizado.
-- cfm_medicos_staging.especialidade é texto livre com várias especialidades por médico:
--   "&CIRURGIA GERAL - RQE Nº: 103600& UROLOGIA - RQE Nº: 103601"
-- Aqui vira uma linha por (médico, especialidade) casada com especialidades.nome/aliases.
-- Casamento: nome exato vence alias (ex.: "DIAGNÓSTICO POR IMAGEM" é especialidade própria
-- e também alias de Radiologia; fica na própria). Comparação sem acento e sem caixa.

-- 1. Aliases para os textos antigos do CFM que não casavam (nomes de especialidade
--    de antes das resoluções CFM atuais). Idempotente: só acrescenta o que falta.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('CLÍNICA MÉDICA', 'medicina interna ou clinica medica'),
      ('CLÍNICA MÉDICA', 'medicina interna'),
      ('CANCEROLOGIA CIRÚRGICA', 'cancerologia/cancerologia cirurgica'),
      ('CANCEROLOGIA PEDIÁTRICA', 'cancerologia/cancerologia pediatrica'),
      ('PATOLOGIA CLÍNICA / MEDICINA LABORATORIAL', 'patologia clinica/medicina laboratorial'),
      ('MEDICINA DE FAMÍLIA E COMUNIDADE', 'medicina geral comunitaria'),
      ('PNEUMOLOGIA', 'tisiologia'),
      ('PNEUMOLOGIA', 'pneumologia e tisiologia'),
      ('INFECTOLOGIA', 'doencas infecciosas e parasitarias'),
      ('RADIOLOGIA E DIAGNÓSTICO POR IMAGEM', 'radiodiagnostico'),
      ('GERIATRIA', 'geriatria e gerontologia'),
      ('GENÉTICA MÉDICA', 'genetica clinica'),
      ('CIRURGIA VASCULAR', 'cirurgia vascular periferica'),
      ('MEDICINA INTENSIVA PEDIÁTRICA', 'terapia intensiva pediatrica'),
      ('ALERGIA E IMUNOLOGIA', 'alergia e imunopatologia'),
      ('ENDOSCOPIA RESPIRATÓRIA', 'endoscopia peroral vias aereas'),
      ('GINECOLOGIA E OBSTETRÍCIA', 'toco-ginecologia')
    ) v(nome, alias)
  loop
    update especialidades e
       set aliases = array_append(coalesce(e.aliases, '{}'), r.alias)
     where upper(e.nome) = upper(r.nome)
       and not (upper(unaccent(r.alias)) = any (
             select upper(unaccent(a)) from unnest(coalesce(e.aliases, '{}')) a));
  end loop;
end $$;

-- 2. Tabela normalizada.
create table if not exists public.cfm_medico_especialidades (
  nu_crm text not null,
  sg_uf text not null,
  especialidade_id uuid not null references public.especialidades(id) on delete cascade,
  rqe text,
  texto_cfm text not null,
  primary key (nu_crm, sg_uf, especialidade_id)
);
create index if not exists cfm_medico_especialidades_esp_uf on public.cfm_medico_especialidades (especialidade_id, sg_uf);

alter table public.cfm_medico_especialidades enable row level security;
drop policy if exists cfm_medico_especialidades_ler on public.cfm_medico_especialidades;
create policy cfm_medico_especialidades_ler on public.cfm_medico_especialidades
  for select to authenticated using (true);
grant select on public.cfm_medico_especialidades to authenticated;
grant all on public.cfm_medico_especialidades to service_role;

-- 3. Recarga (rodar de novo a cada importação do CFM). Devolve quantas linhas e quantos textos ficaram sem casar.
create or replace function public.cfm_especialidades_recarregar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_linhas bigint;
begin
  truncate cfm_medico_especialidades;

  with partes as (
    select m.nu_crm, m.sg_uf, trim(p) as parte
      from cfm_medicos_staging m, regexp_split_to_table(m.especialidade, '&') p
     where coalesce(m.especialidade, '') <> ''
  ),
  itens as (
    select nu_crm, sg_uf,
           upper(trim(regexp_replace(parte, '\s*-\s*RQE.*$', ''))) as texto,
           nullif(substring(parte from 'RQE\s*N\S*\s*:?\s*(\d+)'), '') as rqe
      from partes
     where parte <> ''
  ),
  chaves as (
    select e.id, upper(unaccent(trim(e.nome))) as k, 1 as prioridade from especialidades e
    union all
    select e.id, upper(unaccent(trim(a))), 2 from especialidades e, unnest(coalesce(e.aliases, '{}')) a
  ),
  casado as (
    select distinct on (i.nu_crm, i.sg_uf, i.texto) i.nu_crm, i.sg_uf, i.texto, i.rqe, c.id as especialidade_id
      from itens i
      join chaves c on c.k = upper(unaccent(i.texto))
     order by i.nu_crm, i.sg_uf, i.texto, c.prioridade
  )
  insert into cfm_medico_especialidades (nu_crm, sg_uf, especialidade_id, rqe, texto_cfm)
  select distinct on (nu_crm, sg_uf, especialidade_id) nu_crm, sg_uf, especialidade_id, rqe, texto
    from casado
   order by nu_crm, sg_uf, especialidade_id, rqe nulls last;

  get diagnostics v_linhas = row_count;
  return jsonb_build_object('linhas', v_linhas,
    'textos_sem_casamento', (select coalesce(sum(n), 0) from cfm_especialidades_sem_casamento));
end;
$$;
revoke all on function public.cfm_especialidades_recarregar() from public, anon, authenticated;
grant execute on function public.cfm_especialidades_recarregar() to service_role;

-- 4. Relatório do que não casou (para manter os aliases).
create or replace view public.cfm_especialidades_sem_casamento as
with partes as (
  select upper(trim(regexp_replace(trim(p), '\s*-\s*RQE.*$', ''))) as texto
    from cfm_medicos_staging m, regexp_split_to_table(m.especialidade, '&') p
   where coalesce(m.especialidade, '') <> '' and trim(p) <> ''
),
chaves as (
  select upper(unaccent(trim(nome))) as k from especialidades
  union
  select upper(unaccent(trim(a))) from especialidades, unnest(coalesce(aliases, '{}')) a
)
select texto, count(*) as n
  from partes
 where upper(unaccent(texto)) not in (select k from chaves)
 group by texto;
revoke all on public.cfm_especialidades_sem_casamento from public, anon, authenticated;
grant select on public.cfm_especialidades_sem_casamento to service_role;

-- 5. Universo do assistente de campanha passa a usar a tabela normalizada
--    (antes: LIKE pelo nome exato; perdia "GINECOLOGIA", "OBSTETRÍCIA", "TOCO-GINECOLOGIA" etc.).
create or replace function public.campanha_assistente_universo_cfm(p_especialidade_ids uuid[], p_ufs text[] default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with medicos as (
    select distinct me.nu_crm, me.sg_uf
      from cfm_medico_especialidades me
      join cfm_medicos_staging m on m.nu_crm = me.nu_crm and m.sg_uf = me.sg_uf
     where me.especialidade_id = any(coalesce(p_especialidade_ids, '{}'))
       and coalesce(m.situacao, '') !~* 'falecid|cassad|cancelad'
  )
  select jsonb_build_object(
    'brasil', (select count(*) from medicos),
    'nas_ufs', case when p_ufs is null or cardinality(p_ufs) = 0 then null
                    else (select count(*) from medicos where sg_uf = any(p_ufs)) end,
    'atualizado_em', (select max(importado_em) from cfm_medicos_staging)
  )
  where auth.uid() is not null or coalesce(auth.role(), '') = 'service_role';
$$;

select public.cfm_especialidades_recarregar();
