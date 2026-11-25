-- Fila do webhook da Chakra (25/11/2026). Doc: docs/arquitetura/chakra-webhook-fila.md.
--
-- Por quê: às 8h de 25/11 seis números entraram em coexistência e a Meta mandou o histórico e os ecos de cada um,
-- ~116 mil eventos em 3 h (o normal é ~300/h). O chakra-webhook processava cada evento antes de responder: estourou o
-- limite de chamadas do receive-whatsapp-messages ("Rate limit exceeded for function"), o tempo da requisição (504) e
-- o pool do banco. Resultado: ~19 mil eventos "failed" e ~40 mil parados em "received", que nunca seriam refeitos
-- (a nova tentativa da Chakra cai no event_hash único e é descartada como duplicata).
--
-- Desenho: o webhook só grava o evento (com prioridade) e responde 200; um worker reserva lotes com SKIP LOCKED
-- (dois workers nunca pegam o mesmo evento), com teto de eventos em andamento, nova tentativa com espera crescente e
-- "dead" depois de 6 tentativas. Mensagem ao vivo (prioridade 1) passa na frente de histórico e backlog.
-- Sem duplicar: o receiver confere provider + wa_message_id e o índice único (conversation_id, wa_message_id)
-- segura o resto; o histórico usa "on conflict do nothing".

alter table public.whatsapp_chakra_webhook_events
  add column if not exists tentativas int not null default 0,
  add column if not exists proxima_tentativa_em timestamptz not null default now(),
  add column if not exists reservado_em timestamptz,
  add column if not exists prioridade smallint not null default 5,
  add column if not exists waba_id text;

-- Só o que está na fila (received/retry/processing): índice pequeno mesmo com milhões de eventos processados.
create index if not exists idx_chakra_fila_pendentes
  on public.whatsapp_chakra_webhook_events (prioridade, proxima_tentativa_em, received_at)
  where processing_status in ('received', 'retry');
create index if not exists idx_chakra_fila_em_andamento
  on public.whatsapp_chakra_webhook_events (reservado_em)
  where processing_status = 'processing';

-- Reserva até p_limite eventos para um worker. Devolve vazio quando já há p_max_em_andamento em processamento
-- (teto global: vários workers acordados ao mesmo tempo num pico não derrubam o receiver nem o banco).
-- Reservado há mais de 5 min = worker morreu no meio: volta para a fila.
create or replace function public.chakra_fila_reservar(p_limite int default 20, p_max_em_andamento int default 40)
returns setof public.whatsapp_chakra_webhook_events
language plpgsql
security definer
set search_path = public
as $$
declare
  v_andamento int;
begin
  update whatsapp_chakra_webhook_events
     set processing_status = 'retry', proxima_tentativa_em = now(), reservado_em = null
   where processing_status = 'processing' and reservado_em < now() - interval '5 minutes';

  select count(*) into v_andamento from whatsapp_chakra_webhook_events where processing_status = 'processing';
  if v_andamento >= p_max_em_andamento then return; end if;

  return query
  update whatsapp_chakra_webhook_events e
     set processing_status = 'processing', reservado_em = now(), tentativas = e.tentativas + 1
   where e.id in (
     select id from whatsapp_chakra_webhook_events
      where processing_status in ('received', 'retry') and proxima_tentativa_em <= now()
      order by prioridade, proxima_tentativa_em, received_at
      limit least(p_limite, p_max_em_andamento - v_andamento)
      for update skip locked
   )
  returning e.*;
end;
$$;

-- Falha: volta para a fila com espera de 2^tentativas min (2, 4, 8, 16, 32); na 6ª vira 'failed' (morto, para olhar).
create or replace function public.chakra_fila_falhou(p_id uuid, p_erro text)
returns void
language sql
security definer
set search_path = public
as $$
  update whatsapp_chakra_webhook_events
     set processing_status = case when tentativas >= 6 then 'failed' else 'retry' end,
         proxima_tentativa_em = now() + make_interval(mins => least(60, power(2, tentativas)::int)),
         reservado_em = null,
         error_message = left(p_erro, 500)
   where id = p_id;
$$;

-- Painel rápido da fila (para a bateria e para o Sigma mostrar se o webhook está em dia).
create or replace function public.chakra_fila_resumo()
returns table(status text, prioridade smallint, eventos bigint, mais_antigo timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select processing_status, prioridade, count(*), min(received_at)
    from whatsapp_chakra_webhook_events
   where processing_status in ('received', 'retry', 'processing', 'failed')
     and received_at > now() - interval '7 days'
   group by 1, 2 order by 2, 1;
$$;

revoke all on function public.chakra_fila_reservar(int, int) from public, anon, authenticated;
revoke all on function public.chakra_fila_falhou(uuid, text) from public, anon, authenticated;
revoke all on function public.chakra_fila_resumo() from public, anon;
grant execute on function public.chakra_fila_reservar(int, int) to service_role;
grant execute on function public.chakra_fila_falhou(uuid, text) to service_role;
grant execute on function public.chakra_fila_resumo() to service_role, authenticated;

-- Backlog de 25/11: o que falhou ou ficou parado nos últimos 3 dias volta para a fila, com prioridade baixa (8) e
-- tentativas zeradas. O worker trata como histórico (só grava; sem IA, sem alerta, sem mexer em campanha).
update public.whatsapp_chakra_webhook_events
   set processing_status = 'retry', prioridade = 8, tentativas = 0, proxima_tentativa_em = now(), reservado_em = null,
       waba_id = coalesce(waba_id, payload->>'wabaId')
 where processing_status in ('failed', 'received')
   and received_at > now() - interval '3 days'
   and event_type not like '\_%';
