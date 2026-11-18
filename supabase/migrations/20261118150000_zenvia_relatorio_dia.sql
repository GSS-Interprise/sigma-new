-- Histórico da Zenvia antes do webhook (Raul, 18/11): a API de relatórios (/v2/reports/message/entries) só dá
-- totais por dia, canal e tipo; o detalhe por mensagem só vem do webhook (zenvia_eventos) daqui para frente.
-- type 'notification' = modelo enviado (o disparo); 'message' = conversa (IN = médico escreveu, OUT = equipe respondeu).
-- Lido da API em 18/11 às 11h (BRT). Antes de 16/11 a conta de contrato não tinha envios (o resto foi na conta de teste
-- da Zenvia, que expirou). 18/11 ainda estava em andamento.
create table if not exists public.zenvia_relatorio_dia (
  dia date not null,
  canal text not null,
  tipo text not null,
  entrada int not null default 0,
  saida int not null default 0,
  lido_em timestamptz not null default now(),
  primary key (dia, canal, tipo)
);
alter table public.zenvia_relatorio_dia enable row level security;
drop policy if exists zenvia_relatorio_dia_ler on public.zenvia_relatorio_dia;
create policy zenvia_relatorio_dia_ler on public.zenvia_relatorio_dia for select to authenticated using (true);
grant select on public.zenvia_relatorio_dia to authenticated;
grant all on public.zenvia_relatorio_dia to service_role;

insert into public.zenvia_relatorio_dia (dia, canal, tipo, entrada, saida) values
  ('2026-11-16', 'whatsapp', 'message', 2, 0),
  ('2026-11-16', 'whatsapp', 'notification', 0, 1),
  ('2026-11-17', 'whatsapp', 'message', 777, 546),
  ('2026-11-17', 'whatsapp', 'notification', 0, 1336),
  ('2026-11-18', 'whatsapp', 'message', 31, 42)
on conflict (dia, canal, tipo) do update set entrada = excluded.entrada, saida = excluded.saida, lido_em = now();
