-- T8 (14/10): renumerar os contratos que ficaram com buraco na sequência (78, 92, 94-96, 99, 102,
-- 103, 110). Decisão da Bianca (WhatsApp 14/10, 15:10: "Quero que vc renumere, seguindo a sequência")
-- com ok do Raul. A ordem entre os contratos é mantida; só fecham os buracos (79 vira 78 ... 114 vira 105).
--
-- contratos_renumeracao guarda o número antigo de cada contrato. Serve para traduzir referências
-- antigas: a planilha de ligação contrato × Conta Azul da Maria Vitória (Ligacao_Contratos, 12/10)
-- lista os contratos como "80 - Cliente - Unidade", ou seja, pelo número de antes.
-- Só o quadro da GSS (contratos); ages_contratos não muda.

create table if not exists public.contratos_renumeracao (
  id bigserial primary key,
  contrato_id uuid not null references public.contratos(id) on delete cascade,
  numero_antigo integer not null,
  numero_novo integer not null,
  motivo text,
  feito_em timestamptz not null default now()
);
alter table public.contratos_renumeracao enable row level security;
drop policy if exists contratos_renumeracao_select on public.contratos_renumeracao;
create policy contratos_renumeracao_select on public.contratos_renumeracao for select to authenticated using (true);
grant select on public.contratos_renumeracao to authenticated;
grant all on public.contratos_renumeracao to service_role;
grant usage, select on sequence public.contratos_renumeracao_id_seq to service_role;

do $$
begin
  -- roda uma vez só: se já houver registro de renumeração, não mexe de novo
  if exists (select 1 from contratos_renumeracao) then return; end if;

  create temp table _renum on commit drop as
  select id, codigo_interno as antigo, row_number() over (order by codigo_interno)::int as novo
    from contratos where codigo_interno is not null;
  delete from _renum where antigo = novo;

  insert into contratos_renumeracao (contrato_id, numero_antigo, numero_novo, motivo)
  select id, antigo, novo, 'fechar lacunas da sequência (pedido da Bianca, 14/10)' from _renum;

  -- duas etapas por causa do índice único: primeiro tira do caminho (negativo), depois grava o novo
  update contratos c set codigo_interno = -r.antigo from _renum r where c.id = r.id;
  update contratos c set codigo_interno = r.novo from _renum r where c.id = r.id;
end $$;
