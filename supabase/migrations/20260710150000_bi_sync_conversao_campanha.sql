-- FIX BI (auditoria diretoria): fechar a desconexão entre o fechamento real (lead vira
-- médico no corpo clínico → leads.data_conversao, feito na aba Conversão do Prontuário)
-- e o card da campanha (campanha_leads.status='convertido'). Antes o funil mostrava 6
-- porque o fluxo do Prontuário nunca marcava o card.

-- (1) Trigger: quando um lead É CONVERTIDO (data_conversao passa de null p/ preenchido),
-- marca os cards de campanha dele como convertido. Só na TRANSIÇÃO real (não em reimport).
create or replace function public.tg_sync_conversao_campanha() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.data_conversao is not null and old.data_conversao is null then
    update public.campanha_leads
      set status = 'convertido', data_status = now()
      where lead_id = new.id and status <> 'convertido';
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_conversao_campanha on public.leads;
create trigger trg_sync_conversao_campanha
  after update of data_conversao on public.leads
  for each row execute function public.tg_sync_conversao_campanha();

-- (2) Backfill SELETIVO retroativo: só os convertidos ORGÂNICOS (têm canal_conversao ou
-- responsável registrado). Exclui a importação em massa de dez/2025 (sem canal/responsável),
-- que são médicos pré-existentes, NÃO conversões da prospecção.
update public.campanha_leads cl
  set status = 'convertido', data_status = now()
  from public.leads l
  where cl.lead_id = l.id
    and l.data_conversao is not null
    and (l.canal_conversao is not null or l.convertido_por is not null)
    and cl.status <> 'convertido';
