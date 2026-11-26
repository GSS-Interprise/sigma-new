-- Desfaz 20261126120000_leads_cpf_preso_em_fundido.sql: volta o gatilho como 20261125210000 deixou (sem a checagem
-- do CPF guardado em lead fundido e com a mensagem anterior). Os índices não foram tocados.

create or replace function public.generate_lead_chave_unica()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existente record;
  v_principal record;
begin
  -- Lead fundido não segura chave: o cadastro principal é que representa o médico.
  if new.merged_into_id is not null then
    new.chave_unica := null;
    return new;
  end if;

  -- On UPDATE: skip recalculation if CPF, nome and data_nascimento are unchanged
  if tg_op = 'UPDATE' then
    if (new.cpf is not distinct from old.cpf)
       and (new.nome is not distinct from old.nome)
       and (new.data_nascimento is not distinct from old.data_nascimento) then
      return new;
    end if;
  end if;

  -- (Re)calculate chave_unica
  if new.cpf is not null and trim(new.cpf) != '' then
    new.chave_unica := 'cpf_' || regexp_replace(new.cpf, '[^0-9]', '', 'g');
  elsif new.nome is not null and new.data_nascimento is not null then
    new.chave_unica := lower(trim(new.nome)) || '_' || new.data_nascimento;
  else
    new.chave_unica := null;
  end if;

  if new.chave_unica is not null then
    select id, nome, crm, merged_into_id into v_existente
      from leads where chave_unica = new.chave_unica and id <> new.id limit 1;
    if found then
      v_principal := v_existente;
      if v_existente.merged_into_id is not null then
        select id, nome, crm, merged_into_id into v_principal from leads where id = v_existente.merged_into_id;
        if not found then v_principal := v_existente; end if;
      end if;
      raise exception using
        errcode = '23505',
        message = format('Este médico já está cadastrado no Sigma: %s%s. Procure pelo nome em Leads e edite o cadastro que já existe.',
                         coalesce(v_principal.nome, 'sem nome'),
                         case when v_principal.crm is not null then ' (CRM ' || v_principal.crm || ')' else '' end),
        detail = format('lead_existente=%s chave=%s', v_principal.id, case when new.cpf is not null and trim(new.cpf) != '' then 'cpf' else 'nome_nascimento' end);
    end if;
  end if;

  return new;
end;
$function$;
