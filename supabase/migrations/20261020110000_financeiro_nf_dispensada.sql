-- Médico sem nada a pagar não recebe pedido de nota (Mavi, 20/10). O Lauro (Braço do Norte, setembro) recebeu
-- tudo à vista: a pagar R$ 0, mas o pedido de nota saiu (R$ 0, 108 horas) e ele ficou como "Pedida", pendente
-- e sujeito a cobrança. Agora o pagamento com a pagar zerado fica em nf_status 'dispensada' ("Sem nota · nada
-- a pagar"): sai do pedido, da cobrança e dos pendentes. Se o valor voltar a ser positivo, volta para "A pedir".
-- Nota já recebida não muda.
create or replace function public.fin_nf_dispensa_sem_valor()
returns trigger language plpgsql as $$
begin
  if coalesce(new.valor_total, 0) <= 0 and coalesce(new.nf_status, 'nao_solicitada') in ('nao_solicitada', 'solicitada') then
    new.nf_status := 'dispensada';
  elsif coalesce(new.valor_total, 0) > 0 and new.nf_status = 'dispensada' then
    new.nf_status := 'nao_solicitada';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fin_nf_dispensa_sem_valor on public.financeiro_pagamentos;
create trigger trg_fin_nf_dispensa_sem_valor
  before insert or update of valor_total, nf_status on public.financeiro_pagamentos
  for each row execute function public.fin_nf_dispensa_sem_valor();

-- os que já estão zerados (Lauro, setembro)
update public.financeiro_pagamentos set nf_status = 'dispensada'
 where coalesce(valor_total, 0) <= 0 and coalesce(nf_status, 'nao_solicitada') in ('nao_solicitada', 'solicitada');
