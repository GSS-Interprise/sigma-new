-- Teste do banco: escalas do Dr. Escala e acesso do MCP dos sócios (migrations 20261113150000, 20261113160000 e
-- 20261114100000; docs/arquitetura/claude-socios-gss.md).
-- Roda contra o banco de verdade e NÃO deixa nada gravado: tudo acontece dentro de um bloco que termina com erro de
-- propósito, o que desfaz o que foi escrito. Resultado esperado na mensagem de erro: "TESTE_OK".
-- Usa ids negativos e junho de 2001 (sem horário de verão), que o Dr. Escala nunca devolve, para não tocar na escala real.
-- Rodar: psql "$DB" -f supabase/tests/drescala_mcp.sql   (ou pelo scratchpad q.py)
do $$
declare
  s1 uuid; s2 uuid; s3 uuid; r jsonb; n int; v_data date; v_uid uuid; v_admin uuid;
  locais jsonb := '[{"id":-9001,"nome":"TESTE SQL HOSPITAL","cidade":"Itajaí","uf":"SC"},
                    {"id":-9002,"nome":"EMPRESA LOCAL TESTE SQL"}]';
  setores jsonb := '[{"id":-9101,"local_id":-9001,"nome":"UTI"},{"id":-9102,"local_id":-9002,"nome":"PS"}]';
  -- A: noturno que começa 23h de 09/06 em Brasília (02h UTC de 10/06) -> dia 09/06. B: diurno. C: furo no local de teste.
  pa jsonb := '{"id":-1,"local_id":-9001,"setor_id":-9101,"inicio":"2001-06-10T02:00:00Z","fim":"2001-06-10T14:00:00Z",
               "profissional_id":7,"profissional_nome":"Ana Teste","situacao":"Designado","tipo":"Normal","furo":false}';
  pb jsonb := '{"id":-2,"local_id":-9001,"setor_id":-9101,"inicio":"2001-06-11T10:00:00Z","furo":true}';
  pc jsonb := '{"id":-3,"local_id":-9002,"setor_id":-9102,"inicio":"2001-06-11T10:00:00Z","furo":true}';
begin
  -- 1) Primeira carga: grava locais, setores e 3 plantões; fecha ok e conta o furo.
  s1 := drescala_abrir_sync(null, '2001-06-01', '2001-06-30', array[-9001, -9002]::bigint[]);
  r := drescala_gravar_lote(s1, locais, setores, jsonb_build_array(pa, pb, pc));
  if r <> '{"locais":2,"setores":2,"plantoes":3}'::jsonb then raise exception 'FALHOU: lote %', r; end if;
  r := drescala_fechar_sync(s1, true);
  if (r ->> 'furos')::int <> 2 or (r ->> 'removidos')::int <> 0 then raise exception 'FALHOU: fechar 1 %', r; end if;
  select data into v_data from drescala_plantoes where id = -1;
  if v_data <> '2001-06-09' then raise exception 'FALHOU: plantão noturno caiu no dia % (esperado 09/06, hora de Brasília)', v_data; end if;

  -- 2) A view dos sócios esconde o local de teste do Dr. Escala (tinha furo falso) e traz hospital e setor.
  select count(*) into n from drescala_escala_v where id in (-1, -2, -3);
  if n <> 2 then raise exception 'FALHOU: view mostrou % plantões (esperado 2, sem o local de teste)', n; end if;
  if not exists (select 1 from drescala_escala_v where id = -1 and hospital = 'TESTE SQL HOSPITAL' and setor = 'UTI') then
    raise exception 'FALHOU: view sem nome de hospital/setor';
  end if;

  -- 3) Segunda carga só vê o A: fechar ok apaga do período (e só dos locais pedidos) o que sumiu do Dr. Escala.
  s2 := drescala_abrir_sync(null, '2001-06-01', '2001-06-30', array[-9001, -9002]::bigint[]);
  perform drescala_gravar_lote(s2, null, null, jsonb_build_array(pa || '{"profissional_nome":"Ana Trocada"}'));
  r := drescala_fechar_sync(s2, true);
  if (r ->> 'removidos')::int <> 2 then raise exception 'FALHOU: removidos % (esperado 2)', r; end if;
  if (select profissional_nome from drescala_plantoes where id = -1) <> 'Ana Trocada' then raise exception 'FALHOU: troca de médico não gravou'; end if;

  -- 4) Carga com erro não apaga nada (senão um 429 no meio zeraria a escala).
  s3 := drescala_abrir_sync(null, '2001-06-01', '2001-06-30', array[-9001]::bigint[]);
  r := drescala_fechar_sync(s3, false, 'teste');
  if (r ->> 'removidos')::int <> 0 or not exists (select 1 from drescala_plantoes where id = -1) then
    raise exception 'FALHOU: sync com erro apagou plantão %', r;
  end if;
  if (select status from drescala_sincronizacoes where id = s3) <> 'erro' then raise exception 'FALHOU: status da sync com erro'; end if;

  -- 5) Sync fechada não aceita mais lote nem fechamento.
  begin
    perform drescala_gravar_lote(s3, null, null, jsonb_build_array(pb));
    raise exception 'FALHOU: lote em sync fechada';
  exception when others then
    if sqlerrm not like '%sync_invalida%' then raise; end if;
  end;

  -- 6) Cron da carga agendado 06h/12h/18h de Brasília e rotina_pegar devolvendo à fila só depois de 20 min.
  if not exists (select 1 from cron.job where jobname = 'drescala-escalas' and schedule = '0 9,15,21 * * *' and active) then
    raise exception 'FALHOU: cron drescala-escalas';
  end if;
  if pg_get_functiondef('public.rotina_pegar(text,text[],integer)'::regprocedure) not like '%20 minutes%' then
    raise exception 'FALHOU: rotina_pegar sem os 20 min';
  end if;

  -- 7) Acesso pela API pública (papel authenticated) de quem NÃO é admin, diretoria nem coordenador de escalas.
  select p.id into v_uid from profiles p where p.status = 'ativo' and not exists (
    select 1 from user_roles r where r.user_id = p.id and r.role::text in ('admin', 'diretoria', 'coordenador_escalas')) limit 1;
  select r.user_id into v_admin from user_roles r where r.role::text = 'admin' limit 1;
  if v_uid is null or v_admin is null then raise exception 'TESTE_PULADO: falta usuário comum ou admin'; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from drescala_plantoes where id = -1;
  if n <> 0 then raise exception 'FALHOU: usuário comum leu a escala'; end if;
  begin
    perform mcp_gerar_token('teste');
    raise exception 'FALHOU: usuário comum gerou token do MCP';
  exception when others then
    if sqlerrm not like '%sem_permissao%' then raise; end if;
  end;
  begin
    perform drescala_gravar_lote(s1, null, null, null);
    raise exception 'FALHOU: authenticated chamou a gravação do robô';
  exception when insufficient_privilege then null;
  end;
  begin
    perform token_hash from mcp_tokens limit 1;
    raise exception 'FALHOU: authenticated leu o hash do token';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from mcp_oauth_codigos limit 1;
    raise exception 'FALHOU: authenticated leu códigos OAuth';
  exception when insufficient_privilege then null;
  end;
  reset role;

  -- 8) Admin lê a escala, gera o próprio token (hash guardado, token em claro só na resposta) e revoga.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  set local role authenticated;
  if not exists (select 1 from drescala_escala_v where id = -1) then raise exception 'FALHOU: admin não leu a escala'; end if;
  declare tok text; tid uuid;
  begin
    tok := mcp_gerar_token('TESTE SQL');
    if tok !~ '^sgm_[0-9a-f]{48}$' then raise exception 'FALHOU: formato do token %', left(tok, 8); end if;
    select id into tid from mcp_tokens where nome = 'TESTE SQL' and user_id = v_admin and revogado_em is null;
    update mcp_tokens set revogado_em = now() where id = tid;
    if not exists (select 1 from mcp_tokens where id = tid and revogado_em is not null) then raise exception 'FALHOU: dono não revogou'; end if;
    reset role;
    if not exists (select 1 from mcp_tokens where id = tid and token_hash = encode(extensions.digest(tok, 'sha256'), 'hex') and origem = 'manual') then
      raise exception 'FALHOU: hash do token não confere';
    end if;
  end;

  raise exception 'TESTE_OK';
end $$;
