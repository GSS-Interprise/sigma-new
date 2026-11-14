-- Teste do banco: escada de ligação do SLA (migration 20261113210000). Não deixa nada gravado: termina com erro de
-- propósito ("TESTE_OK"), o que desfaz tudo. Rodar: psql "$DB" -f supabase/tests/sla_escada.sql
do $$
declare v_exame uuid; v_ok boolean := false;
begin
  -- 1) A chave existe e nasce desligada (só quem opera o SLA liga).
  if not exists (select 1 from config_lista_items where campo_nome = 'sla_escada_ligacao') then
    raise exception 'FALHOU: config sla_escada_ligacao não existe';
  end if;

  -- 2) Sem login não liga.
  begin
    perform sla_escada_ligar(true);
  exception when others then
    v_ok := sqlerrm like '%sem_permissao%';
  end;
  if not v_ok then raise exception 'FALHOU: sla_escada_ligar aceitou chamada sem permissão'; end if;

  -- 3) Passo da escada só de 1 a 4.
  insert into sla_exames (unidade, data_exame, hora_min, ordem, origem, hora_exame, inicio_em, vence_em, visto_primeiro_em, visto_ultimo_em)
  values ('teste', current_date, '00:00', 999999, 'ps', '00:00', now() - interval '3 hours', now() - interval '1 hour', now(), now())
  returning id into v_exame;
  insert into sla_alertas (exame_id, tipo, papel, canal, escada_passo) values (v_exame, 'vencido', 'plantonista', 'ligacao', 4);
  v_ok := false;
  begin
    insert into sla_alertas (exame_id, tipo, papel, canal, escada_passo) values (v_exame, 'vencido', 'plantonista', 'ligacao', 5);
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHOU: aceitou passo 5 na escada'; end if;

  -- 4) O cron das 7h (10 UTC) existe.
  if not exists (select 1 from cron.job where jobname = 'sla-indicadores-7h' and schedule = '0 10 * * *') then
    raise exception 'FALHOU: cron sla-indicadores-7h ausente';
  end if;

  raise exception 'TESTE_OK';
end $$;
