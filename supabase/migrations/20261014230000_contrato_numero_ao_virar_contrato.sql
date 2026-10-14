-- T8 do plano licitacoes-contratos-gss.md (14/10): número do contrato só quando vira contrato.
-- Bianca, reunião de 07/10 (01:07:24): "a sequência quebra, o 92 sumiu, pula para 94, 99". Causa:
-- o pré-contrato criado ao arrematar a licitação já reservava o número (MAX+1); quando a licitação
-- era cancelada/revogada o pré-contrato era apagado e o número sumia. E o MAX+1 sem trava podia
-- repetir número em duas gravações simultâneas.
--
-- Agora: pré-contrato fica sem número; o número nasce ao inserir um contrato de verdade ou quando o
-- pré-contrato deixa de ser pré-contrato, sob trava, e não repete. As lacunas que já existem
-- (78, 92, 94, 95, 96, 99, 102, 103, 110) ficam como estão até a Bianca decidir se renumera.

create or replace function public.contrato_proximo_numero()
returns integer language plpgsql set search_path = public as $$
declare n integer;
begin
  -- uma gravação por vez pega o próximo número (fim da repetição por concorrência)
  perform pg_advisory_xact_lock(hashtext('contratos.codigo_interno'));
  select coalesce(max(codigo_interno), 0) + 1 into n from contratos;
  return n;
end $$;

create or replace function public.generate_contrato_codigo_interno()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.status_contrato = 'Pre-Contrato' then
      new.codigo_interno := null;           -- pré-contrato não consome número
    elsif new.codigo_interno is null then
      new.codigo_interno := contrato_proximo_numero();
    end if;
  elsif tg_op = 'UPDATE' then
    -- pré-contrato que virou contrato recebe o número agora
    if new.codigo_interno is null and coalesce(new.status_contrato, '') <> 'Pre-Contrato' then
      new.codigo_interno := contrato_proximo_numero();
    end if;
  end if;
  return new;
end $$;

drop trigger if exists set_contrato_codigo_interno on public.contratos;
create trigger set_contrato_codigo_interno before insert or update of status_contrato, codigo_interno on public.contratos
  for each row execute function public.generate_contrato_codigo_interno();

-- número nunca se repete
create unique index if not exists contratos_codigo_interno_unico on public.contratos (codigo_interno) where codigo_interno is not null;
