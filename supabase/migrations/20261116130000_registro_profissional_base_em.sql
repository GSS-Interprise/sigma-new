-- Comprovante do CFM no card do lead quente (16/11/2026): a função passa a dizer de quando é o dado da base do CFM
-- (cfm_medicos_staging.importado_em). O card mostra "fonte: base pública do CFM, atualizada em <mês>", porque a
-- situação vem da base importada, não de consulta do dia (a consulta ao vivo do CFM pede reCAPTCHA).
-- Mesma função de 20261108210000_registro_profissional.sql, com o campo novo 'base_em' e o conserto do médico sem CRM.

create or replace function public.lead_registro_profissional(p_lead_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_crm text; v_uf text; v_nome text;
  -- %rowtype (não record): médico sem CRM nunca entra no select, e um record vazio dava erro
  -- ("record v_cfm is not assigned yet") em vez de devolver cfm nulo.
  v_cfm cfm_medicos_staging%rowtype;
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
      'outras_inscricoes', v_outras,
      'base_em', v_cfm.importado_em) end,
    'cnes', v_cnes);
end;
$$;

revoke all on function public.lead_registro_profissional(uuid) from public, anon;
grant execute on function public.lead_registro_profissional(uuid) to authenticated, service_role;
