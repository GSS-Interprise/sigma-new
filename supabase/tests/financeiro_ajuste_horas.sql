-- Teste do banco: ajuste de escala corrige as horas do pagamento (migration 20261118140000_financeiro_ajuste_horas.sql,
-- gatilho trg_fin_ajuste_recalc de 20260804170000). Caso da Mavi (18/11): Isabela, Ibirama, set/26, 72 h → fez 74 h.
-- Não deixa nada gravado: termina com erro de propósito ("TESTE_OK"), o que desfaz tudo.
-- Rodar: psql "$DB" -f supabase/tests/financeiro_ajuste_horas.sql
-- Sem banco à mão: node scripts/testes/financeiro-ajuste-horas-pglite.mjs (Postgres em WASM, só o esquema que importa).
do $$
declare
  v_ok boolean;
  v_escala uuid;
  v_gestao uuid;
  v_pag uuid;
  v_aj uuid;
  v_aj2 uuid;
  v_legado uuid;
  v_novo uuid;
  r record;
begin
  select id into v_escala from financeiro_ajuste_categorias where nome = 'Correção de escala';
  if v_escala is null then
    insert into financeiro_ajuste_categorias (nome, sinal) values ('Correção de escala', 'ambos') returning id into v_escala;
  end if;
  select id into v_gestao from financeiro_ajuste_categorias where nome = 'Gestão';
  if v_gestao is null then
    insert into financeiro_ajuste_categorias (nome, sinal) values ('Gestão', 'mais') returning id into v_gestao;
  end if;

  -- pagamento importado como o financeiro-importar-fechamento grava: base de horas em minutos_produzidos
  insert into financeiro_pagamentos (profissional_nome, mes_referencia, ano_referencia, unidade, total_plantoes,
    total_horas_minutos, minutos_produzidos, minutos_ajustes, valor_produzido, valor_a_vista, valor_ajustes,
    valor_total, status, fonte, arquivo_origem)
  values ('Zzteste Isabela', 9, 2026, 'UTI', 6, 72 * 60, 72 * 60, 0, 11592, 0, 0, 11592, 'pendente', 'import',
    '[cfg:zz] Zzteste Ibirama - setembro')
  returning id into v_pag;

  -- 1) 72 h + ajuste de +2 h = 74 h; o valor anda junto
  insert into financeiro_pagamento_ajustes (pagamento_id, categoria_id, valor, minutos, justificativa)
  values (v_pag, v_escala, 322, 120, 'fez 74 h') returning id into v_aj;
  select * into r from financeiro_pagamentos where id = v_pag;
  if r.total_horas_minutos <> 74 * 60 then raise exception 'FALHOU: 72h + 2h deu % min', r.total_horas_minutos; end if;
  if r.minutos_produzidos <> 72 * 60 then raise exception 'FALHOU: a base mudou para % min', r.minutos_produzidos; end if;
  if r.valor_total <> 11914 then raise exception 'FALHOU: valor com o ajuste deu %', r.valor_total; end if;

  -- 2) editar o mesmo ajuste não duplica: +2 h vira +3 h → 75 h (e não 77 h); salvar igual mantém
  update financeiro_pagamento_ajustes set minutos = 180, valor = 483 where id = v_aj;
  if (select total_horas_minutos from financeiro_pagamentos where id = v_pag) <> 75 * 60 then
    raise exception 'FALHOU: edição de +2h para +3h somou de novo';
  end if;
  update financeiro_pagamento_ajustes set minutos = 180, valor = 483 where id = v_aj;
  if (select total_horas_minutos from financeiro_pagamentos where id = v_pag) <> 75 * 60 then
    raise exception 'FALHOU: salvar o ajuste sem mudança mexeu nas horas';
  end if;

  -- 3) 72 h − 2 h = 70 h
  update financeiro_pagamento_ajustes set minutos = -120, valor = -322 where id = v_aj;
  select * into r from financeiro_pagamentos where id = v_pag;
  if r.total_horas_minutos <> 70 * 60 then raise exception 'FALHOU: 72h − 2h deu % min', r.total_horas_minutos; end if;
  if r.valor_total <> 11270 then raise exception 'FALHOU: valor com o desconto deu %', r.valor_total; end if;

  -- 4) nunca negativo: tirar 100 h de 72 h para em 0
  update financeiro_pagamento_ajustes set minutos = -100 * 60 where id = v_aj;
  if (select total_horas_minutos from financeiro_pagamentos where id = v_pag) <> 0 then
    raise exception 'FALHOU: horas ficaram negativas';
  end if;
  update financeiro_pagamento_ajustes set minutos = 120, valor = 322 where id = v_aj;

  -- 5) ajuste só de valor (gestão) preserva as horas
  insert into financeiro_pagamento_ajustes (pagamento_id, categoria_id, valor, justificativa)
  values (v_pag, v_gestao, 200, 'gestão da escala') returning id into v_aj2;
  select * into r from financeiro_pagamentos where id = v_pag;
  if r.total_horas_minutos <> 74 * 60 then raise exception 'FALHOU: ajuste só de valor mexeu nas horas (% min)', r.total_horas_minutos; end if;
  if r.valor_total <> 12114 then raise exception 'FALHOU: ajuste só de valor deu %', r.valor_total; end if;

  -- 6) ajuste vazio (sem valor e sem horas) continua recusado pelo banco
  v_ok := false;
  begin
    insert into financeiro_pagamento_ajustes (pagamento_id, categoria_id, valor, minutos, justificativa)
    values (v_pag, v_escala, 0, 0, 'vazio');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'FALHOU: ajuste vazio foi aceito'; end if;

  -- 7) ajuste só de horas vale
  update financeiro_pagamento_ajustes set valor = 0 where id = v_aj;
  if (select total_horas_minutos from financeiro_pagamentos where id = v_pag) <> 74 * 60 then
    raise exception 'FALHOU: ajuste só de horas não contou';
  end if;
  update financeiro_pagamento_ajustes set valor = 322 where id = v_aj;

  -- 8) o pedido de NF lê total_horas_minutos (COLUNAS_PAGAMENTO em financeiro-nf-enviar/texto.ts): é a carga corrigida
  if (select total_horas_minutos from financeiro_pagamentos where id = v_pag) = (select minutos_produzidos from financeiro_pagamentos where id = v_pag) then
    raise exception 'FALHOU: pedido de NF leria a base antiga';
  end if;

  -- 9) reimportar o fechamento, nos passos do financeiro-importar-fechamento: guarda os ajustes manuais, apaga o
  --    pagamento, grava o novo com a base do arquivo e minutos_ajustes = 0, e devolve os ajustes com os minutos
  create temp table zz_ajustes_salvos on commit drop as
    select categoria_id, valor, minutos, justificativa, criado_por, created_at
      from financeiro_pagamento_ajustes where pagamento_id = v_pag and origem = 'manual';
  delete from financeiro_pagamentos where id = v_pag;
  insert into financeiro_pagamentos (profissional_nome, mes_referencia, ano_referencia, unidade, total_plantoes,
    total_horas_minutos, horas_a_vista_minutos, minutos_produzidos, minutos_ajustes, valor_produzido, valor_a_vista,
    valor_ajustes, valor_total, status, fonte, arquivo_origem)
  values ('Zzteste Isabela', 9, 2026, 'UTI', 6, 72 * 60, 0, 72 * 60, 0, 11592, 0, 0, 11592, 'pendente', 'import',
    '[cfg:zz] Zzteste Ibirama - setembro')
  returning id into v_novo;
  insert into financeiro_pagamento_ajustes (pagamento_id, categoria_id, valor, minutos, justificativa, criado_por, created_at)
    select v_novo, categoria_id, valor, coalesce(minutos, 0), justificativa, criado_por, created_at from zz_ajustes_salvos;
  select * into r from financeiro_pagamentos where id = v_novo;
  if r.total_horas_minutos <> 74 * 60 then raise exception 'FALHOU: reimport perdeu os minutos do ajuste (% min)', r.total_horas_minutos; end if;
  if r.minutos_ajustes <> 120 then raise exception 'FALHOU: reimport somou % min de ajuste', r.minutos_ajustes; end if;
  if r.valor_total <> 12114 then raise exception 'FALHOU: reimport deu valor %', r.valor_total; end if;

  -- 10) apagar o ajuste devolve as horas da base
  delete from financeiro_pagamento_ajustes where pagamento_id = v_novo and minutos <> 0;
  if (select total_horas_minutos from financeiro_pagamentos where id = v_novo) <> 72 * 60 then
    raise exception 'FALHOU: apagar o ajuste não devolveu as 72h';
  end if;

  -- 11) lançamento de antes da migration (minutos_produzidos nulo) adota as horas atuais como base no 1º ajuste
  insert into financeiro_pagamentos (profissional_nome, mes_referencia, ano_referencia, total_horas_minutos, valor_produzido, valor_total)
  values ('Zzteste Legado', 9, 2026, 72 * 60, 11592, 11592) returning id into v_legado;
  update financeiro_pagamentos set minutos_produzidos = null where id = v_legado;
  insert into financeiro_pagamento_ajustes (pagamento_id, categoria_id, valor, minutos, justificativa)
  values (v_legado, v_escala, 322, 120, 'legado +2h');
  select * into r from financeiro_pagamentos where id = v_legado;
  if r.minutos_produzidos <> 72 * 60 or r.total_horas_minutos <> 74 * 60 then
    raise exception 'FALHOU: legado ficou com base % e total %', r.minutos_produzidos, r.total_horas_minutos;
  end if;

  raise exception 'TESTE_OK';
end $$;
