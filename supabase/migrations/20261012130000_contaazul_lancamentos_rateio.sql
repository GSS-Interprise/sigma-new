-- Espelho do Conta Azul: divisão completa de cada lançamento (12/10).
-- A receita vinda de venda tem DUAS categorias: o serviço (valor líquido) e "Impostos Retidos
-- em Vendas" (valor 0, com o imposto no valor bruto). A listagem devolve as categorias sem
-- valor e fora de ordem, então gravar "a primeira" punha imposto retido como categoria em
-- 741 receitas. O detalhe da parcela traz a divisão; estas colunas guardam o resultado.
alter table public.contaazul_lancamentos
  add column if not exists valor_bruto      numeric(14,2),
  add column if not exists impostos_retidos numeric(14,2),
  add column if not exists rateio           jsonb,
  add column if not exists origem           text,
  add column if not exists detalhado_em     timestamptz;

comment on column public.contaazul_lancamentos.valor_bruto is 'Valor antes dos impostos retidos. Igual a total quando não há retenção.';
comment on column public.contaazul_lancamentos.impostos_retidos is 'Impostos retidos na fonte (categoria Impostos Retidos em Vendas). valor_bruto - impostos_retidos = total.';
comment on column public.contaazul_lancamentos.rateio is 'Divisão completa por categoria e centro de custo, como veio do detalhe da parcela.';

-- lançamento de uma categoria só não tem o que dividir: bruto = total, sem chamada extra
update public.contaazul_lancamentos
   set valor_bruto = total, impostos_retidos = 0
 where valor_bruto is null and jsonb_array_length(coalesce(dados->'categorias', '[]'::jsonb)) <= 1;

create index if not exists idx_ca_lanc_detalhar on public.contaazul_lancamentos (detalhado_em)
  where valor_bruto is null;

-- Lançamentos com divisão gravada que foram alterados no Conta Azul depois do último detalhe.
-- (comparar duas colunas da mesma linha não cabe no filtro do PostgREST)
create or replace function public.contaazul_lancamentos_a_redetalhar(p_limite int default 50)
returns table (ca_id text, total numeric)
language sql stable security definer set search_path to 'public'
as $$
  select l.ca_id, l.total from contaazul_lancamentos l
   where l.detalhado_em is not null and l.data_alteracao is not null and l.data_alteracao > l.detalhado_em
   order by l.data_alteracao desc limit greatest(p_limite, 0);
$$;
revoke all on function public.contaazul_lancamentos_a_redetalhar(int) from public, anon, authenticated;
grant execute on function public.contaazul_lancamentos_a_redetalhar(int) to service_role;
