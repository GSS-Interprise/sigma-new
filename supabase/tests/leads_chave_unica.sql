-- Teste do banco: cadastro de médico repetido (gatilho generate_lead_chave_unica, migrations 20261125210000 e
-- 20261126120000). O médico repetido é barrado com mensagem clara e o id do cadastro que já existe; os índices
-- idx_leads_chave_unica e idx_leads_cpf_unique continuam valendo; cadastro novo salva.
-- Não deixa nada gravado: termina com erro de propósito ("TESTE_OK"), o que desfaz tudo.
-- Rodar: psql "$DB" -f supabase/tests/leads_chave_unica.sql
-- Sem banco à mão: node scripts/testes/leads-chave-unica-pglite.mjs (Postgres em WASM, só o esquema que importa).
do $$
declare
  v_ana uuid;
  v_bruno uuid;
  v_principal uuid;
  v_fundido uuid;
  v_novo uuid;
  v_msg text;
  v_detail text;
  v_estado text;
  v_n int;
begin
  -- 1) Cadastro novo com CPF salva e a chave é o CPF só com dígitos.
  insert into leads (nome, cpf, crm, phone_e164) values ('Zzteste Ana Souza', '901.234.567-01', '12345', '+5547900000001')
    returning id into v_ana;
  select count(*) into v_n from leads where id = v_ana and chave_unica = 'cpf_90123456701';
  if v_n <> 1 then raise exception 'FALHOU: lead novo com CPF não salvou com a chave do CPF'; end if;

  -- 2) Mesmo CPF digitado de outro jeito (só dígitos): barrado com o nome, o CRM e o id do cadastro que já existe.
  v_msg := null;
  begin
    insert into leads (nome, cpf, phone_e164) values ('Ana S.', '90123456701', '+5547900000002');
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail, v_estado = returned_sqlstate;
  end;
  if v_msg is null then raise exception 'FALHOU: CPF repetido foi aceito'; end if;
  if v_estado <> '23505' then raise exception 'FALHOU: CPF repetido saiu com o código %', v_estado; end if;
  if v_msg like '%duplicate key%' or v_msg like '%idx_leads%' then raise exception 'FALHOU: erro cru no CPF repetido: %', v_msg; end if;
  if v_msg not like '%Zzteste Ana Souza (CRM 12345)%' or v_msg not like '%mesmo CPF%' then
    raise exception 'FALHOU: mensagem do CPF repetido não diz quem é: %', v_msg;
  end if;
  if v_detail <> format('lead_existente=%s chave=cpf', v_ana) then raise exception 'FALHOU: detail do CPF repetido: %', v_detail; end if;

  -- 3) Sem CPF, a chave é nome + data de nascimento (sem diferença de maiúscula nem espaço nas pontas).
  insert into leads (nome, data_nascimento, phone_e164) values ('Zzteste Bruno Lima', '1980-05-17', '+5547900000003')
    returning id into v_bruno;
  v_msg := null;
  begin
    insert into leads (nome, data_nascimento, phone_e164) values ('  ZZTESTE BRUNO LIMA ', '1980-05-17', '+5547900000004');
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  end;
  if v_msg is null then raise exception 'FALHOU: nome + data de nascimento repetidos foram aceitos'; end if;
  if v_msg not like '%Zzteste Bruno Lima,%' or v_msg not like '%mesmo nome e data de nascimento%' then
    raise exception 'FALHOU: mensagem de nome + nascimento: %', v_msg;
  end if;
  if v_detail <> format('lead_existente=%s chave=nome_nascimento', v_bruno) then raise exception 'FALHOU: detail de nome + nascimento: %', v_detail; end if;

  -- 4) Mesmo nome com outra data de nascimento é outro médico: salva.
  insert into leads (nome, data_nascimento, phone_e164) values ('Zzteste Bruno Lima', '1991-02-03', '+5547900000005')
    returning id into v_novo;
  if v_novo is null then raise exception 'FALHOU: homônimo com outra data não salvou'; end if;

  -- 5) Editar o cadastro sem mexer no documento continua funcionando; trocar o CPF para o de outro médico é barrado.
  update leads set crm = '999' where id = v_bruno;
  v_msg := null;
  begin
    update leads set cpf = '901.234.567-01' where id = v_bruno;
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text;
  end;
  if v_msg is null or v_msg not like '%Zzteste Ana Souza%' then raise exception 'FALHOU: edição para CPF de outro médico: %', v_msg; end if;

  -- 6) CPF guardado num lead fundido (caso dos 71 de produção): barrado pelo idx_leads_cpf_unique, mas com o nome do
  --    cadastro principal no lugar do erro cru.
  insert into leads (nome, crm, phone_e164) values ('Zzteste Carla Principal', '555', '+5547900000006') returning id into v_principal;
  insert into leads (nome, cpf, phone_e164) values ('Zzteste Carla Antiga', '812.345.678-90', '+5547900000007') returning id into v_fundido;
  update leads set merged_into_id = v_principal where id = v_fundido;
  select count(*) into v_n from leads where id = v_fundido and chave_unica is null and cpf = '812.345.678-90';
  if v_n <> 1 then raise exception 'FALHOU: lead fundido devia soltar a chave e manter o CPF'; end if;
  v_msg := null;
  begin
    insert into leads (nome, cpf, phone_e164) values ('Zzteste Carla Nova', '812.345.678-90', '+5547900000008');
  exception when unique_violation then
    get stacked diagnostics v_msg = message_text, v_detail = pg_exception_detail;
  end;
  if v_msg is null then raise exception 'FALHOU: CPF do lead fundido foi aceito em cadastro novo'; end if;
  if v_msg like '%duplicate key%' then raise exception 'FALHOU: erro cru do idx_leads_cpf_unique: %', v_msg; end if;
  if v_msg not like '%Zzteste Carla Principal (CRM 555)%' then raise exception 'FALHOU: devia apontar o principal: %', v_msg; end if;
  if v_detail <> format('lead_existente=%s chave=cpf', v_principal) then raise exception 'FALHOU: detail do fundido: %', v_detail; end if;

  -- 7) O mesmo CPF do fundido em outro formato não bate em índice nenhum (o fundido não segura a chave): salva.
  insert into leads (nome, cpf, phone_e164) values ('Zzteste Carla Nova', '81234567890', '+5547900000009') returning id into v_novo;
  if v_novo is null then raise exception 'FALHOU: CPF liberado pelo fundido não salvou'; end if;

  -- 8) Nenhuma duplicata ficou, e os dois índices únicos seguem lá.
  select count(*) into v_n from (select chave_unica from leads where chave_unica is not null group by 1 having count(*) > 1) d;
  if v_n <> 0 then raise exception 'FALHOU: ficou chave repetida'; end if;
  select count(*) into v_n from pg_indexes
   where tablename = 'leads' and indexname in ('idx_leads_chave_unica', 'idx_leads_cpf_unique') and indexdef like 'CREATE UNIQUE INDEX%';
  if v_n <> 2 then raise exception 'FALHOU: índice único sumiu (achei %)', v_n; end if;

  raise exception 'TESTE_OK';
end $$;
