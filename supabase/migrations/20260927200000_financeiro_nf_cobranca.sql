-- Cobrança de NF (27/09): o que mais importa para quem pede nota é saber quem já mandou,
-- quem não mandou e se a mensagem chegou. O WhatsApp devolve enviada → entregue → lida
-- para cada mensagem; guardamos o último estágio no pedido.

alter table public.financeiro_nf_solicitacoes
  add column if not exists entrega_status text,
  add column if not exists entrega_em     timestamptz;

create index if not exists idx_fin_nf_solic_msgid on public.financeiro_nf_solicitacoes(provider_message_id);

-- status chegam fora de ordem (o "entregue" pode vir depois do "lido"): só avança
create or replace function public.fin_nf_status_entrega(p_wamid text, p_status text, p_quando timestamptz default now())
returns void language plpgsql security definer set search_path = public as $$
declare
  rank_novo int := case lower(p_status) when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end;
begin
  if rank_novo = 0 or p_wamid is null then return; end if;
  update financeiro_nf_solicitacoes s
     set entrega_status = lower(p_status), entrega_em = p_quando
   where s.provider_message_id = p_wamid
     and (case coalesce(s.entrega_status, '') when 'sent' then 1 when 'delivered' then 2 when 'read' then 3 when 'failed' then 4 else 0 end) < rank_novo;
end $$;

grant execute on function public.fin_nf_status_entrega(text, text, timestamptz) to service_role;
