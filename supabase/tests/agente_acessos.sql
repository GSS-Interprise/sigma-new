-- Teste do banco: permissão por domínio e auditoria do protocolo do agente (migration 20261114120000;
-- docs/arquitetura/protocolo-agente-sigma.md §3e e §3f).
-- Roda contra o banco de verdade e NÃO deixa nada gravado: o bloco termina com erro de propósito, o que desfaz tudo.
-- Resultado esperado na mensagem de erro: "TESTE_OK".
-- Usa o domínio fictício "testesql", que o registro nunca terá.
-- Rodar: psql "$DB" -f supabase/tests/agente_acessos.sql   (ou pelo scratchpad sql.py)
do $$
declare
  v_admin uuid; v_dir uuid; v_comum uuid; d text[]; n int;
begin
  select r.user_id into v_admin from user_roles r where r.role = 'admin' limit 1;
  select r.user_id into v_dir from user_roles r where r.role = 'diretoria'
    and not exists (select 1 from user_roles x where x.user_id = r.user_id and x.role = 'admin') limit 1;
  select p.id into v_comum from profiles p where p.status = 'ativo' and not exists (
    select 1 from user_roles r where r.user_id = p.id and r.role in ('admin', 'diretoria')) limit 1;
  if v_admin is null or v_dir is null or v_comum is null then raise exception 'TESTE_PULADO: falta admin, diretoria ou usuário comum'; end if;

  -- 1) Semente: admin e diretoria veem escalas, como na T1. Usuário comum não vê nada.
  if not ('escalas' = any (agente_dominios_do_usuario(v_admin))) then raise exception 'FALHOU: admin sem escalas'; end if;
  if not ('escalas' = any (agente_dominios_do_usuario(v_dir))) then raise exception 'FALHOU: diretoria sem escalas'; end if;
  if cardinality(agente_dominios_do_usuario(v_comum)) <> 0 then raise exception 'FALHOU: usuário comum com domínio'; end if;

  -- 2) Usuário comum não lê a matriz, não chama a função da edge e não libera domínio.
  perform set_config('request.jwt.claims', json_build_object('sub', v_comum, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from agente_dominio_acessos;
  if n <> 0 then raise exception 'FALHOU: usuário comum leu a matriz (% linhas)', n; end if;
  begin
    perform agente_dominios_do_usuario(v_comum);
    raise exception 'FALHOU: authenticated chamou agente_dominios_do_usuario';
  exception when insufficient_privilege then null;
  end;
  begin
    perform agente_definir_acesso('diretoria', 'testesql', true);
    raise exception 'FALHOU: usuário comum liberou domínio';
  exception when others then
    if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  reset role;

  -- 3) Admin libera "testesql" só para diretoria: diretoria passa a ver, admin (sem papel diretoria) não.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform agente_definir_acesso('diretoria', 'testesql', true);
  perform agente_definir_acesso('diretoria', 'testesql', true); -- repetir não quebra
  select count(*) into n from agente_dominio_acessos where dominio = 'testesql';
  if n <> 1 then raise exception 'FALHOU: admin não vê a linha liberada (%)', n; end if;
  begin
    perform agente_definir_acesso('diretoria', 'Contratos!', true);
    raise exception 'FALHOU: aceitou id de domínio inválido';
  exception when others then
    if sqlerrm not like '%dominio_invalido%' then raise; end if;
  end;
  reset role;
  if not ('testesql' = any (agente_dominios_do_usuario(v_dir))) then raise exception 'FALHOU: diretoria não ganhou testesql'; end if;
  if exists (select 1 from user_roles where user_id = v_admin and role = 'diretoria') then null;
  elsif 'testesql' = any (agente_dominios_do_usuario(v_admin)) then raise exception 'FALHOU: admin ganhou domínio de outro papel';
  end if;
  if (select liberado_por from agente_dominio_acessos where papel = 'diretoria' and dominio = 'testesql') <> v_admin then
    raise exception 'FALHOU: liberado_por não gravou quem liberou';
  end if;

  -- 4) Bloquear tira o domínio.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform agente_definir_acesso('diretoria', 'testesql', false);
  reset role;
  if 'testesql' = any (agente_dominios_do_usuario(v_dir)) then raise exception 'FALHOU: bloqueio não tirou o domínio'; end if;

  -- 5) Auditoria: as colunas novas existem e aceitam o que a edge grava.
  insert into mcp_chamadas (user_id, metodo, ferramenta, dominio, protocolo_versao, resultado_hash, fonte_atualizada_em)
  values (v_admin, 'tools/call', 'teste_sql', 'testesql', '0.0.0', repeat('a', 64), now());
  if not exists (select 1 from mcp_chamadas where ferramenta = 'teste_sql' and resultado_hash = repeat('a', 64)) then
    raise exception 'FALHOU: auditoria não gravou as colunas novas';
  end if;

  raise exception 'TESTE_OK';
end $$;
