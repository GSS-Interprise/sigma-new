-- Cadastro de médico travando com "duplicate key value violates unique constraint idx_leads_chave_unica" (equipe GSS,
-- 25/11/2026: "o médico não está na aba de leads e não consigo salvar").
--
-- A chave única do lead é o CPF (ou nome + data de nascimento), calculada pelo gatilho generate_lead_chave_unica.
-- Duas causas:
--   1) 204 leads fundidos em fusões antigas ainda guardavam a chave. Lead fundido não aparece em Leads, então o CPF
--      ficava preso num cadastro invisível. A fusão atual (merge_lead_cluster) já libera a chave e passa o CPF para o
--      cadastro principal; aqui o mesmo é feito para os antigos, e o gatilho passa a liberar a chave sempre que o lead
--      é fundido.
--   2) Quando o médico já existe de verdade, o erro do índice não dizia quem era. Agora o gatilho avisa com o nome do
--      cadastro que já existe (o principal, se o encontrado for fundido). Continua com o código 23505 (violação de
--      unicidade), então quem trata esse código segue funcionando; todas as telas que criam lead mostram a mensagem.

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

-- Fusões antigas: libera a chave do fundido e leva o CPF ao principal quando ele não tem (como faz merge_lead_cluster).
-- Um por vez: se o CPF já estiver em outro cadastro ativo, o principal fica sem ele e o fundido só perde a chave.
do $$
declare r record; v_ok int := 0; v_cpf int := 0;
begin
  for r in
    select s.id, s.cpf, s.nome, s.data_nascimento, s.merged_into_id as alvo
      from leads s where s.merged_into_id is not null and s.chave_unica is not null
     order by s.id
  loop
    update leads set chave_unica = null where id = r.id;
    v_ok := v_ok + 1;
    begin
      update leads t set cpf = r.cpf
       where t.id = r.alvo and t.merged_into_id is null and (t.cpf is null or trim(t.cpf) = '')
         and r.cpf is not null and trim(r.cpf) != '';
      if found then v_cpf := v_cpf + 1; end if;
    exception when unique_violation then
      null; -- o CPF já pertence a outro cadastro ativo: não move
    end;
  end loop;
  raise notice 'fundidos liberados: %, CPF levado ao principal: %', v_ok, v_cpf;
end $$;
