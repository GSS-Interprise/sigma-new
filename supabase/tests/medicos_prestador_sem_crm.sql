-- Teste do banco: prestador de serviço sem CRM (migration 20261118160000) e vínculo do lançamento do fechamento
-- ao salvar o cadastro, sem reimportar (gatilho trg_financeiro_vincular_medico, migration 20261027130000).
-- Não deixa nada gravado: termina com erro de propósito ("TESTE_OK"), o que desfaz tudo.
-- Rodar: psql "$DB" -f supabase/tests/medicos_prestador_sem_crm.sql
-- Sem banco à mão: node scripts/testes/prestador-sem-crm-pglite.mjs (Postgres em WASM, só o esquema que importa).
do $$
declare
  v_ok boolean;
  v_prestador uuid;
  v_medico uuid;
  v_outro uuid;
  v_pag_prestador uuid;
  v_pag_estranho uuid;
  v_pag_ja_ligado uuid;
  v_pag_ambiguo uuid;
  v_vinculado uuid;
begin
  -- 1) Médico continua com CRM obrigatório: sem CRM, CRM vazio ou só espaços não entra.
  v_ok := false;
  begin
    insert into medicos (nome_completo, email, telefone) values ('Zzteste Sem Crm', 'a@teste.invalid', '47999990000');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHOU: médico sem CRM foi aceito'; end if;

  v_ok := false;
  begin
    insert into medicos (nome_completo, crm, email, telefone) values ('Zzteste Crm Vazio', '   ', 'a@teste.invalid', '47999990000');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHOU: médico com CRM só de espaços foi aceito'; end if;

  -- 2) Médico com CRM segue entrando como antes.
  insert into medicos (nome_completo, crm, especialidade, email, telefone)
  values ('Zzmedico Zzteste', 'ZZT-99999', array['Pediatria'], 'm@teste.invalid', '47999990001')
  returning id into v_medico;
  if (select prestador_nao_medico from medicos where id = v_medico) then
    raise exception 'FALHOU: médico novo nasceu marcado como prestador';
  end if;

  -- 3) Lançamentos do fechamento já importados, "sem cadastro" (medico_id nulo).
  insert into financeiro_pagamentos (profissional_nome, mes_referencia, ano_referencia, unidade)
  values ('ZZPRESTADORA DA SILVA ZZTESTÉ', 9, 2026, 'Zzteste') returning id into v_pag_prestador;
  insert into financeiro_pagamentos (profissional_nome, mes_referencia, ano_referencia, unidade)
  values ('Zzoutra Pessoa Zzteste', 9, 2026, 'Zzteste') returning id into v_pag_estranho;
  insert into financeiro_pagamentos (profissional_nome, mes_referencia, ano_referencia, unidade, medico_id)
  values ('Zzprestadora Zzteste', 10, 2026, 'Zzteste', v_medico) returning id into v_pag_ja_ligado;

  -- 4) Prestador sem CRM e sem especialidade entra (e dois prestadores sem CRM não brigam no unique do CRM).
  insert into medicos (nome_completo, prestador_nao_medico, email, telefone)
  values ('Zzprestadora Maria Zzteste', true, 'p@teste.invalid', '47999990002')
  returning id into v_prestador;
  insert into medicos (nome_completo, prestador_nao_medico, email, telefone)
  values ('Zzsegundo Prestador Zzteste', true, 'p2@teste.invalid', '47999990003');

  -- 5) O lançamento "sem cadastro" com o mesmo primeiro e último nome (sem acento, maiúsculas, "da") ligou sozinho.
  select medico_id into v_vinculado from financeiro_pagamentos where id = v_pag_prestador;
  if v_vinculado is distinct from v_prestador then
    raise exception 'FALHOU: lançamento sem cadastro não ligou ao prestador (medico_id = %)', v_vinculado;
  end if;

  -- 6) Outro nome não liga; lançamento já ligado a outro cadastro não muda.
  if (select medico_id from financeiro_pagamentos where id = v_pag_estranho) is not null then
    raise exception 'FALHOU: ligou lançamento de outra pessoa';
  end if;
  if (select medico_id from financeiro_pagamentos where id = v_pag_ja_ligado) is distinct from v_medico then
    raise exception 'FALHOU: mexeu em lançamento que já tinha cadastro';
  end if;

  -- 7) Homônimo (mesmo primeiro e último nome de quem já está no cadastro): não liga, fica para a tela.
  insert into financeiro_pagamentos (profissional_nome, mes_referencia, ano_referencia, unidade)
  values ('Zzprestadora Zzteste', 11, 2026, 'Zzteste') returning id into v_pag_ambiguo;
  insert into medicos (nome_completo, prestador_nao_medico, email, telefone)
  values ('Zzprestadora Outra Zzteste', true, 'p3@teste.invalid', '47999990004')
  returning id into v_outro;
  if (select medico_id from financeiro_pagamentos where id = v_pag_ambiguo) is not null then
    raise exception 'FALHOU: ligou lançamento de nome ambíguo';
  end if;

  -- 8) Desmarcar "prestador" de quem não tem CRM é barrado (não vira médico sem CRM pela edição).
  v_ok := false;
  begin
    update medicos set prestador_nao_medico = false where id = v_prestador;
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHOU: cadastro sem CRM deixou de ser prestador'; end if;

  raise exception 'TESTE_OK';
end $$;
