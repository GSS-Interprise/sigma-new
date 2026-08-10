-- 10/08 — ajuste em pagamento SEM produção não somava.
-- A Mavi lançou +R$ 10.000 ("Fixo") na Ketilyn, que veio do importador antigo com
-- R$ 0,00, e o total continuou R$ 0,00.
--
-- Causa: a trava `valor_produzido > 0` no recálculo (criada em 06/08 para não destruir
-- o total de linhas legadas sem base) também bloqueava o caso legítimo de um pagamento
-- que é só ajuste. O auto-heal logo acima já resolve o caso legado — quando ele não
-- dispara é porque não há base a preservar, e aí derivar é o certo.

create or replace function public.fin_recalc_pagamento(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- linha sem base adota o total corrente como produção, ANTES de aplicar o ajuste
  update public.financeiro_pagamentos p
     set valor_produzido = p.valor_total + coalesce(p.valor_a_vista, 0) - coalesce(p.valor_ajustes, 0)
   where p.id = p_id
     and coalesce(p.valor_produzido, 0) = 0
     and p.valor_total + coalesce(p.valor_a_vista, 0) - coalesce(p.valor_ajustes, 0) > 0;

  update public.financeiro_pagamentos p
     set valor_ajustes = coalesce((select sum(a.valor)
                                     from public.financeiro_pagamento_ajustes a
                                    where a.pagamento_id = p_id), 0),
         updated_at    = now()
   where p.id = p_id;

  -- sem trava: com base, deriva; sem base, o pagamento é o próprio ajuste
  update public.financeiro_pagamentos p
     set valor_total = coalesce(p.valor_produzido, 0) - coalesce(p.valor_a_vista, 0) + coalesce(p.valor_ajustes, 0)
   where p.id = p_id;
end $$;

-- reconcilia quem ficou para trás (a Ketilyn e qualquer outro no mesmo caso)
update public.financeiro_pagamentos
   set valor_total = coalesce(valor_produzido, 0) - coalesce(valor_a_vista, 0) + coalesce(valor_ajustes, 0)
 where valor_total <> coalesce(valor_produzido, 0) - coalesce(valor_a_vista, 0) + coalesce(valor_ajustes, 0);
