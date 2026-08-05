-- E4c (05/08) — o mesmo fechamento tem dois lados. O Carestream traz a MESMA quantidade
-- de exames da planilha de pagamento, mas ao preço do contrato com o cliente:
-- Airton, TC, 97 exames → R$ 34,65 cada (a receber) × R$ 20,63 cada (a pagar ao médico).
-- Então a fonte de import passa a declarar a direção.

alter table public.financeiro_import_config
  add column if not exists direcao    text not null default 'pagar' check (direcao in ('pagar','receber')),
  add column if not exists contrato_id uuid;

comment on column public.financeiro_import_config.direcao is
  'pagar = gera financeiro_pagamentos (custo com o médico). receber = gera financeiro_receber (receita do contrato).';

insert into public.financeiro_import_config
  (nome, fonte, formato, parser, aba, header_row, layout, mapa_colunas, direcao, ativo)
select 'Carestream — Fechamento do cliente', 'carestream', 'xlsx', 'carestream_resumo',
       'RESUMO MÉDICO', 1, 'linha', '{}'::jsonb, 'receber', true
where not exists (select 1 from public.financeiro_import_config where parser = 'carestream_resumo');

-- aponta pro mesmo cliente da Marieta (é o fechamento do contrato de radiologia dela)
update public.financeiro_import_config c
   set cliente_id = (select cliente_id from public.financeiro_import_config where nome = 'Marieta Radiologia')
 where c.parser = 'carestream_resumo' and c.cliente_id is null;

grant select, insert, update, delete on public.financeiro_receber to authenticated, service_role;
