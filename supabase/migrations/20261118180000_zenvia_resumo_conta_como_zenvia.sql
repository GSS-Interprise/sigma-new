-- Disparos da Zenvia contados como a própria Zenvia conta (Raul, 18/11, conferido com o envio "Ultrassonografia" de
-- 17/11: 3.210 contatos, 1.745 "mensagens enviadas", 1.465 "falhas no envio"):
--   disparos  = mensagem que saiu (SENT, DELIVERED, READ ou NOT_DELIVERED: saiu e o WhatsApp não entregou);
--   falharam  = erro no envio (FAILED/REJECTED/ERROR: nem saiu, ex. campo do modelo em branco).
-- Antes "disparos" somava as falhas, e o dia 17 dava 3.210 em vez de 1.745.
create or replace view public.zenvia_resumo_dia as
with msg as (
  select message_id,
         min(evento_em) as primeiro_em,
         bool_or(status = 'READ') as lido,
         bool_or(status in ('DELIVERED', 'READ')) as entregue,
         bool_or(status in ('SENT', 'DELIVERED', 'READ', 'NOT_DELIVERED')) as saiu,
         bool_or(status in ('REJECTED', 'FAILED', 'ERROR')) as falhou
    from public.zenvia_eventos
   where tipo = 'MESSAGE_STATUS' and message_id is not null
   group by message_id
)
, envios as (
  select (primeiro_em at time zone 'America/Sao_Paulo')::date as dia,
         count(*) filter (where saiu) as disparos,
         count(*) filter (where entregue) as entregues,
         count(*) filter (where lido) as lidos,
         count(*) filter (where falhou and not saiu) as falharam
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
