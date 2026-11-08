-- Fase 5.2 (revista em 08/11): "registro profissional" na ficha do médico.
-- CFM: vem da base já importada (cfm_medicos_staging) — sem consulta nova. A foto do CFM exige
--      reCAPTCHA (API buscar_foto) e por isso não é buscada automaticamente.
-- CNES: vínculos (onde trabalha, CBO, carga horária) pela API pública do CNES, edge medico-cnes,
--       guardados aqui para não consultar de novo a cada abertura da ficha.

create table if not exists public.medico_cnes (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  status text not null check (status in ('ok', 'ambiguo', 'nao_encontrado', 'erro')),
  cns text,
  nome_cnes text,
  competencia text,
  vinculos jsonb not null default '[]'::jsonb,
  -- Homônimos: quando o nome bate com mais de um profissional, a pessoa escolhe pelo CNS.
  candidatos jsonb not null default '[]'::jsonb,
  erro text,
  consultado_em timestamptz not null default now(),
  consultado_por uuid
);

alter table public.medico_cnes enable row level security;
drop policy if exists medico_cnes_ler on public.medico_cnes;
create policy medico_cnes_ler on public.medico_cnes for select to authenticated using (true);
grant select on public.medico_cnes to authenticated;
grant all on public.medico_cnes to service_role;

-- Tudo que a ficha mostra no bloco "Registro profissional", numa chamada.
create or replace function public.lead_registro_profissional(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_crm text; v_uf text; v_nome text;
  v_cfm record;
  v_esp jsonb := '[]'::jsonb;
  v_outras jsonb := '[]'::jsonb;
  v_cnes jsonb;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'authentication_required';
  end if;

  select regexp_replace(split_part(coalesce(crm, ''), '/', 1), '\D', '', 'g'),
         upper(coalesce(nullif(split_part(coalesce(crm, ''), '/', 2), ''), uf)),
         nome
    into v_crm, v_uf, v_nome
    from leads where id = p_lead_id;

  if v_crm <> '' then
    select * into v_cfm from cfm_medicos_staging where nu_crm = v_crm and sg_uf = v_uf;
  end if;

  if v_cfm.nu_crm is not null then
    -- "&CIRURGIA GERAL - RQE Nº: 15443& CANCEROLOGIA - RQE Nº: 2665" → [{nome, rqe}]
    select coalesce(jsonb_agg(jsonb_build_object(
             'nome', trim(regexp_replace(parte, '\s*-\s*RQE.*$', '')),
             'rqe', nullif(substring(parte from 'RQE[^0-9]*([0-9]+)'), ''))), '[]'::jsonb)
      into v_esp
      from unnest(string_to_array(coalesce(v_cfm.especialidade, ''), '&')) parte
     where trim(parte) <> '';

    -- Outras inscrições do mesmo médico (mesmo nome, outra UF).
    select coalesce(jsonb_agg(jsonb_build_object('uf', sg_uf, 'crm', nu_crm, 'situacao', situacao) order by sg_uf), '[]'::jsonb)
      into v_outras
      from cfm_medicos_staging
     where nm_medico = v_cfm.nm_medico and not (nu_crm = v_cfm.nu_crm and sg_uf = v_cfm.sg_uf);
  end if;

  select to_jsonb(c) - 'lead_id' into v_cnes from medico_cnes c where c.lead_id = p_lead_id;

  return jsonb_build_object(
    'crm', nullif(v_crm, ''),
    'uf', v_uf,
    'cfm', case when v_cfm.nu_crm is null then null else jsonb_build_object(
      'nome', v_cfm.nm_medico,
      'situacao', v_cfm.situacao,
      'tipo_inscricao', v_cfm.tipo_inscricao,
      'dt_inscricao', v_cfm.dt_inscricao,
      'prim_inscricao_uf', v_cfm.prim_inscricao_uf,
      'especialidades', v_esp,
      'outras_inscricoes', v_outras) end,
    'cnes', v_cnes);
end;
$$;

revoke all on function public.lead_registro_profissional(uuid) from public, anon;
grant execute on function public.lead_registro_profissional(uuid) to authenticated, service_role;
