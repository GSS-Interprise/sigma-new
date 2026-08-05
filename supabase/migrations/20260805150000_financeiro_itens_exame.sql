-- E4a (05/08) — fechamentos de radiologia (Marieta, CEPON): matriz médico × tipo de exame.
-- Diferente do plantão, o item de radiologia NÃO tem data: é o agregado do mês por tipo
-- (TC, RX, USG…). Então `data_plantao` deixa de ser obrigatório e o item ganha
-- descrição/quantidade/valor unitário. A mesma tabela passa a carregar os dois mundos.

alter table public.financeiro_pagamento_itens
  alter column data_plantao drop not null,
  alter column hora_inicio  drop not null,
  alter column hora_fim     drop not null;

alter table public.financeiro_pagamento_itens
  add column if not exists descricao      text,     -- 'TC', 'RX', 'DOPPLER'… (radiologia)
  add column if not exists quantidade     numeric,  -- nº de exames no mês
  add column if not exists valor_unitario numeric;

comment on column public.financeiro_pagamento_itens.descricao is
  'Tipo de exame no fechamento de radiologia. Nulo em plantão (que usa data_plantao/setor).';

-- Acréscimos/Descontos que já vêm na planilha viram ajustes de verdade. Marcar a origem
-- é o que permite reimportar sem apagar o que a Mavi lançou na mão.
alter table public.financeiro_pagamento_ajustes
  add column if not exists origem text not null default 'manual';  -- manual | import

insert into public.financeiro_ajuste_categorias (nome, sinal) values
  ('Acréscimo (planilha)', 'mais'),
  ('Desconto (planilha)',  'menos')
on conflict (nome) do nothing;
