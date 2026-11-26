-- Cadastro de médico ainda podia mostrar erro cru de unicidade depois de 20261125210000 (pedido da Geisa, GSS, 25/11).
--
-- O lead tem dois índices únicos sobre o documento: idx_leads_chave_unica (CPF só com dígitos, ou nome + data de
-- nascimento) e idx_leads_cpf_unique (o CPF como foi digitado, inclusive em lead fundido). A migration anterior tirou
-- a chave dos fundidos, mas 71 fundidos seguem com o CPF; quem cadastra esse CPF de novo (pelo Corpo Clínico ou pelo
-- Adicionar Médico do Kanban, que não passam pela verificação de CPF da aba Leads) recebia
-- "duplicate key value violates unique constraint idx_leads_cpf_unique". Os dois índices continuam como estão: o
-- gatilho só avisa antes, com o nome do cadastro principal e o motivo (CPF ou nome + data de nascimento).
--
-- O aviso continua com o código 23505. O detail leva lead_existente=<id> para a tela abrir o cadastro certo.

create or replace function public.generate_lead_chave_unica()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_existente record;
  v_principal record;
  v_motivo text;
  v_achou boolean := false;
  v_cpf_informado boolean;
begin
  v_cpf_informado := new.cpf is not null and trim(new.cpf) != '';

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
  if v_cpf_informado then
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
      v_achou := true;
      v_motivo := case when v_cpf_informado then 'cpf' else 'nome_nascimento' end;
    end if;
  end if;

  -- Mesmo CPF, como foi digitado, guardado num lead fundido (idx_leads_cpf_unique): só checa se o CPF mudou.
  if not v_achou and v_cpf_informado
     and (tg_op = 'INSERT' or new.cpf is distinct from old.cpf) then
    -- o "is not null and trim" repete o predicado do índice parcial: sem ele o plano varre ~300 mil leads com CPF
    select id, nome, crm, merged_into_id into v_existente
      from leads where cpf = new.cpf and cpf is not null and trim(cpf) <> '' and id <> new.id limit 1;
    if found then
      v_achou := true;
      v_motivo := 'cpf';
    end if;
  end if;

  if v_achou then
    v_principal := v_existente;
    if v_existente.merged_into_id is not null then
      select id, nome, crm, merged_into_id into v_principal from leads where id = v_existente.merged_into_id;
      if not found then v_principal := v_existente; end if;
    end if;
    raise exception using
      errcode = '23505',
      message = format('Este médico já está cadastrado no Sigma: %s%s, com %s. Abra esse cadastro e atualize por lá, em vez de criar outro.',
                       coalesce(v_principal.nome, 'sem nome'),
                       case when v_principal.crm is not null and trim(v_principal.crm) != '' then ' (CRM ' || v_principal.crm || ')' else '' end,
                       case when v_motivo = 'cpf' then 'o mesmo CPF' else 'o mesmo nome e data de nascimento' end),
      detail = format('lead_existente=%s chave=%s', v_principal.id, v_motivo);
  end if;

  return new;
end;
$function$;
