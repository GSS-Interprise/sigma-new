-- Zenvia no Sigma (reunião com a Zenvia em 17/11; Raul, 18/11): a GSS dispara pela Zenvia campanhas de WhatsApp em
-- volume e a diretoria quer esses números no BI ao lado dos da Chakra. A Zenvia manda cada evento por webhook
-- (assinatura da API v2): MESSAGE_STATUS (enviado, entregue, lido, falhou) e MESSAGE (resposta do médico).
-- A edge zenvia-webhook grava aqui um registro por evento, cru (payload) e já normalizado.
-- Telefone: muitos contatos foram cadastrados na Zenvia sem o 55, e a resposta volta com o 55 (a própria Zenvia avisou
-- que o relatório dela "erra" as respostas por isso). telefone_norm sempre com 55, para casar envio e resposta.

create table if not exists public.zenvia_eventos (
  id bigint generated always as identity primary key,
  recebido_em timestamptz not null default now(),
  evento_id text,                 -- id do evento na Zenvia (o mesmo evento reenviado não duplica)
  tipo text not null,             -- MESSAGE_STATUS | MESSAGE
  canal text,                     -- whatsapp, sms...
  direcao text,                   -- OUT (nosso envio) | IN (resposta)
  message_id text,                -- id da mensagem na Zenvia (liga o status ao envio)
  status text,                    -- SENT, DELIVERED, READ, REJECTED, NOT_DELIVERED... (só em MESSAGE_STATUS)
  status_descricao text,
  evento_em timestamptz,          -- quando aconteceu na Zenvia
  remetente text,                 -- from
  destinatario text,              -- to
  telefone_norm text,             -- o telefone do médico, só dígitos e com 55
  texto text,                     -- texto da resposta (MESSAGE IN), quando houver
  payload jsonb not null
);

-- Índice inteiro (não parcial): o upsert onConflict da edge só casa com índice sem WHERE. Nulos não colidem.
create unique index if not exists zenvia_eventos_evento_uq on public.zenvia_eventos (evento_id);
create index if not exists zenvia_eventos_msg_idx on public.zenvia_eventos (message_id);
create index if not exists zenvia_eventos_tel_idx on public.zenvia_eventos (telefone_norm, evento_em);
create index if not exists zenvia_eventos_dia_idx on public.zenvia_eventos (evento_em);

alter table public.zenvia_eventos enable row level security;
-- Leitura para quem está logado (BI); escrita só pela edge (service_role).
drop policy if exists zenvia_eventos_ler on public.zenvia_eventos;
create policy zenvia_eventos_ler on public.zenvia_eventos for select to authenticated using (true);
grant select on public.zenvia_eventos to authenticated;
grant all on public.zenvia_eventos to service_role;

-- Um dia por linha, no fuso de Brasília: o que o BI precisa para comparar com a Chakra.
-- Cada mensagem conta uma vez no status mais alto que atingiu (lido > entregue > enviado; falhou à parte).
create or replace view public.zenvia_resumo_dia as
with msg as (
  select message_id,
         min(evento_em) filter (where direcao = 'OUT' or tipo = 'MESSAGE_STATUS') as primeiro_em,
         bool_or(status = 'READ') as lido,
         bool_or(status in ('DELIVERED', 'READ')) as entregue,
         bool_or(status in ('SENT', 'DELIVERED', 'READ')) as enviado,
         bool_or(status in ('REJECTED', 'NOT_DELIVERED', 'FAILED', 'ERROR')) as falhou
    from public.zenvia_eventos
   where tipo = 'MESSAGE_STATUS' and message_id is not null
   group by message_id
)
, envios as (
  select (primeiro_em at time zone 'America/Sao_Paulo')::date as dia,
         count(*) filter (where enviado or falhou) as disparos,
         count(*) filter (where entregue) as entregues,
         count(*) filter (where lido) as lidos,
         count(*) filter (where falhou and not entregue) as falharam
    from msg
   where primeiro_em is not null
   group by 1
),
respostas as (
  select (evento_em at time zone 'America/Sao_Paulo')::date as dia, count(distinct telefone_norm) as responderam
    from public.zenvia_eventos
   where tipo = 'MESSAGE' and direcao = 'IN'
   group by 1
)
select coalesce(e.dia, r.dia) as dia, coalesce(e.disparos, 0) as disparos, coalesce(e.entregues, 0) as entregues,
       coalesce(e.lidos, 0) as lidos, coalesce(e.falharam, 0) as falharam, coalesce(r.responderam, 0) as responderam
  from envios e full join respostas r on r.dia = e.dia;

grant select on public.zenvia_resumo_dia to authenticated, service_role;
