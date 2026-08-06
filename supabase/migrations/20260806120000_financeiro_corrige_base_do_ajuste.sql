-- INCIDENTE 06/08 — o desconto virou o total.
-- A Mavi lançou -R$ 200 num médico de R$ 11.334,24 e o total ficou -R$ 200.
-- Causa: em E2 o valor_total passou a ser DERIVADO (produzido - à vista + ajustes), mas
-- só o importador novo preenche `valor_produzido`. Todo lançamento vindo do importador
-- antigo ou da geração por escalas ficou com produzido = 0 → o primeiro ajuste virava o
-- total inteiro. As 40 linhas da base estavam nessa condição; só uma foi tocada.

-- ── 1. recupera a base dos lançamentos que nunca tiveram produzido ──
-- Nesses imports `valor_hora_est` recebeu o mesmo valor do total, então serve de origem
-- para o médico já corrompido (a única linha cujo valor_total não é mais confiável).
update public.financeiro_pagamentos
   set valor_produzido = coalesce(nullif(valor_hora_est, 0), valor_total)
 where coalesce(valor_produzido, 0) = 0
   and coalesce(nullif(valor_hora_est, 0), valor_total) > 0;

-- ── 2. auto-heal: nenhuma linha futura repete o incidente ──
-- Antes de aplicar o ajuste, linha sem base adota o total corrente como produzido.
create or replace function public.fin_recalc_pagamento(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
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

  update public.financeiro_pagamentos p
     set valor_total = p.valor_produzido - coalesce(p.valor_a_vista, 0) + coalesce(p.valor_ajustes, 0)
   where p.id = p_id
     and coalesce(p.valor_produzido, 0) > 0;   -- sem base, não mexe no total
end $$;

-- ── 3. reconcilia a base inteira com a nova regra ──
update public.financeiro_pagamentos p
   set valor_ajustes = coalesce((select sum(a.valor)
                                   from public.financeiro_pagamento_ajustes a
                                  where a.pagamento_id = p.id), 0);

update public.financeiro_pagamentos
   set valor_total = valor_produzido - coalesce(valor_a_vista, 0) + coalesce(valor_ajustes, 0)
 where coalesce(valor_produzido, 0) > 0;
