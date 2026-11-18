-- Ajuste de escala também corrige as HORAS (Mavi, 18/11/2026): a Isabela (Ibirama, set/26) estava com 72 h e fez
-- 74 h; o ajuste só mudava o valor e o pedido de NF reenviado continuava dizendo 72 h.
--
-- Mesmo desenho do valor: o ajuste guarda os minutos a mais (positivo) ou a menos (negativo); o pagamento guarda a
-- base importada (minutos_produzidos) e a soma dos ajustes (minutos_ajustes), e total_horas_minutos passa a ser
-- base + ajustes. Quem lê total_horas_minutos (pedido de NF, telas) já recebe as horas corrigidas.

alter table public.financeiro_pagamento_ajustes
  add column if not exists minutos integer not null default 0;

-- ajuste só de horas (valor zero) agora é válido; ajuste sem valor e sem horas continua recusado
alter table public.financeiro_pagamento_ajustes drop constraint if exists financeiro_pagamento_ajustes_valor_check;
alter table public.financeiro_pagamento_ajustes
  add constraint financeiro_pagamento_ajustes_valor_check check (valor <> 0 or minutos <> 0);

alter table public.financeiro_pagamentos
  add column if not exists minutos_produzidos integer,
  add column if not exists minutos_ajustes integer not null default 0;

create or replace function public.fin_recalc_pagamento(p_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  -- linha sem base adota o total corrente como produção, ANTES de aplicar o ajuste
  update public.financeiro_pagamentos p
     set valor_produzido = p.valor_total + coalesce(p.valor_a_vista, 0) - coalesce(p.valor_ajustes, 0)
   where p.id = p_id
     and coalesce(p.valor_produzido, 0) = 0
     and p.valor_total + coalesce(p.valor_a_vista, 0) - coalesce(p.valor_ajustes, 0) > 0;

  -- mesma regra para as horas: lançamento antigo, sem base, adota as horas atuais como produzidas
  update public.financeiro_pagamentos p
     set minutos_produzidos = coalesce(p.total_horas_minutos, 0) - coalesce(p.minutos_ajustes, 0)
   where p.id = p_id
     and p.minutos_produzidos is null;

  update public.financeiro_pagamentos p
     set valor_ajustes   = coalesce((select sum(a.valor)   from public.financeiro_pagamento_ajustes a where a.pagamento_id = p_id), 0),
         minutos_ajustes = coalesce((select sum(a.minutos) from public.financeiro_pagamento_ajustes a where a.pagamento_id = p_id), 0),
         updated_at      = now()
   where p.id = p_id;

  -- sem trava: com base, deriva; sem base, o pagamento é o próprio ajuste
  update public.financeiro_pagamentos p
     set valor_total         = coalesce(p.valor_produzido, 0) - coalesce(p.valor_a_vista, 0) + coalesce(p.valor_ajustes, 0),
         total_horas_minutos = greatest(0, coalesce(p.minutos_produzidos, 0) + coalesce(p.minutos_ajustes, 0))
   where p.id = p_id;
end $function$;
