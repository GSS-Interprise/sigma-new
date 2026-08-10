-- 10/08 — as horas precisam da mesma decomposição do valor.
-- Pedido da Mavi: "se ele trabalhou 100 horas e recebeu 50 à vista, tenho que subtrair
-- essas 50 horas e mostrar 50 restantes. Na solicitação da nota não basta mandar o valor
-- descontado — o médico reclama que ainda constam as 100 horas."
--
-- `total_horas_minutos` continua sendo a PRODUÇÃO do mês (não muda de significado, para
-- não quebrar quem já lê o campo). O que se paga passa a ser produção − à vista.

alter table public.financeiro_pagamentos
  add column if not exists horas_a_vista_minutos integer not null default 0;

comment on column public.financeiro_pagamentos.horas_a_vista_minutos is
  'Parcela de total_horas_minutos que já foi quitada à vista. Horas a pagar = total_horas_minutos - horas_a_vista_minutos.';

-- No relatório Completo dá para saber exatamente quais plantões foram à vista, então
-- reconstrói o valor para o que já está importado.
update public.financeiro_pagamentos p
   set horas_a_vista_minutos = coalesce((
         select sum(i.carga_horaria_minutos)
           from public.financeiro_pagamento_itens i
          where i.pagamento_id = p.id and i.pago_a_vista
       ), 0)
 where exists (select 1 from public.financeiro_pagamento_itens i
                where i.pagamento_id = p.id and i.pago_a_vista);
