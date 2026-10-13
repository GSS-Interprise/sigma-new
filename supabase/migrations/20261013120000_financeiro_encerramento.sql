-- Encerramento do fechamento (13/10): até aqui nada gravava status = 'pago', então o mês ficava
-- em 'aprovado' para sempre. Agora o fechamento aprovado fecha sozinho quando o último pagamento
-- com valor a pagar é marcado como pago, venha a baixa do comprovante, do "Marcar como pago" ou
-- do Conta Azul. Pagamento com valor zero (já quitado à vista) não segura o encerramento.
alter table public.financeiro_fechamentos add column if not exists encerrado_em timestamptz;

create or replace function public.fin_fechamento_reavaliar(_fech uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s text; abertos int; com_valor int;
begin
  if _fech is null then return; end if;
  select status into s from financeiro_fechamentos where id = _fech for update;
  if s is null or s not in ('aprovado', 'pago') then return; end if;
  select count(*) filter (where coalesce(valor_total, 0) > 0 and status is distinct from 'pago'),
         count(*) filter (where coalesce(valor_total, 0) > 0)
    into abertos, com_valor
    from financeiro_pagamentos where fechamento_id = _fech;
  if s = 'aprovado' and com_valor > 0 and abertos = 0 then
    update financeiro_fechamentos set status = 'pago', encerrado_em = now(), updated_at = now() where id = _fech;
  elsif s = 'pago' and abertos > 0 then
    -- pagamento reaberto depois do encerramento: o mês volta a ficar em aberto
    update financeiro_fechamentos set status = 'aprovado', encerrado_em = null, updated_at = now() where id = _fech;
  end if;
end $$;

create or replace function public.fin_fechamento_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then perform fin_fechamento_reavaliar(old.fechamento_id); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.fechamento_id is distinct from old.fechamento_id) then
    perform fin_fechamento_reavaliar(new.fechamento_id);
  end if;
  return null;
end $$;

drop trigger if exists fin_fechamento_encerrar on public.financeiro_pagamentos;
create trigger fin_fechamento_encerrar
  after insert or delete or update of status, fechamento_id, valor_total on public.financeiro_pagamentos
  for each row execute function public.fin_fechamento_trg();

-- aprovar um mês cujos pagamentos já estavam todos pagos também encerra
create or replace function public.fin_fechamento_status_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'aprovado' and new.status is distinct from old.status then perform fin_fechamento_reavaliar(new.id); end if;
  return null;
end $$;

drop trigger if exists fin_fechamento_ao_aprovar on public.financeiro_fechamentos;
create trigger fin_fechamento_ao_aprovar
  after update of status on public.financeiro_fechamentos
  for each row execute function public.fin_fechamento_status_trg();

revoke all on function public.fin_fechamento_reavaliar(uuid) from public, anon, authenticated;
grant execute on function public.fin_fechamento_reavaliar(uuid) to service_role;
