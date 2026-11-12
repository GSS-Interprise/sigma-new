-- Monitor dos números oficiais (docs/arquitetura/monitor-numeros-whatsapp.md), 12/11/2026.
-- O healthStatus da Meta mente (141006 preso por dias, "conectado" sem permissão): a disponibilidade
-- passa a vir de prova real (envio, sonda de permissão, tráfego do webhook).

create table if not exists public.whatsapp_monitor_checagens (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  tipo text not null check (tipo in ('trafego', 'sonda', 'teste_real')),
  -- ok | falha | sem_dado | aguardando (teste real esperando o webhook de entrega)
  resultado text not null check (resultado in ('ok', 'falha', 'sem_dado', 'aguardando')),
  categoria text,           -- permissao | pagamento | webhook | qualidade | destinatario | outro
  codigo text,
  detalhe text,
  message_id text,          -- teste real: id da mensagem na Meta, resolvido pelo webhook de status
  destino_fim text,         -- teste real: só os 4 últimos dígitos do destinatário
  em timestamptz not null default now()
);
create index if not exists whatsapp_monitor_checagens_fone_tipo_em on public.whatsapp_monitor_checagens (phone_e164, tipo, em desc);

-- Quem recebe o teste real (pessoa interna que aceitou receber). Rodízio: 1 por destinatário por dia.
create table if not exists public.whatsapp_monitor_destinos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  phone_e164 text not null unique,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

-- Último estado alertado por número e categoria: o alerta só sai quando muda de ok para falha.
create table if not exists public.whatsapp_monitor_alertas (
  phone_e164 text not null,
  categoria text not null,
  estado text not null check (estado in ('ok', 'falha')),
  detalhe text,
  atualizado_em timestamptz not null default now(),
  primary key (phone_e164, categoria)
);

alter table public.whatsapp_monitor_checagens enable row level security;
alter table public.whatsapp_monitor_destinos enable row level security;
alter table public.whatsapp_monitor_alertas enable row level security;
drop policy if exists "monitor leitura" on public.whatsapp_monitor_checagens;
create policy "monitor leitura" on public.whatsapp_monitor_checagens for select to authenticated using (true);
drop policy if exists "monitor alertas leitura" on public.whatsapp_monitor_alertas;
create policy "monitor alertas leitura" on public.whatsapp_monitor_alertas for select to authenticated using (true);
-- Tabela criada por SQL não ganha GRANT sozinha (incidente 18/05): sem isso as edges dão 42501.
grant select on public.whatsapp_monitor_checagens, public.whatsapp_monitor_alertas to authenticated;
grant all on public.whatsapp_monitor_checagens, public.whatsapp_monitor_destinos, public.whatsapp_monitor_alertas to service_role;

-- Destinatário inicial: o Raul (lead de teste usado nos envios reais). A GSS adiciona outros.
insert into public.whatsapp_monitor_destinos (nome, phone_e164)
select 'Raul (Pulse)', phone_e164 from public.leads where id = '8ce8af6a-724c-41cc-abbe-e24b4b4ddc4f' and phone_e164 is not null
on conflict (phone_e164) do nothing;

create or replace function public.whatsapp_numeros_recalcular_disponibilidade()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
begin
  with base as (
    select c.id, c.phone_e164, c.phone_number_id, c.status, c.quality_rating, c.name_status, i.id as instance_id
    from whatsapp_chakra_connections c
    left join lateral (
      select si.id from sigzap_instances si
      where si.provider = 'chakra' and si.phone_number = c.phone_e164
      order by si.updated_at desc nulls last limit 1
    ) i on true
  ),
  envio as (
    -- "received" em mensagem nossa é eco do celular (coexistência), não envio pela API.
    select b.id,
      count(m.*) filter (where m.message_status is distinct from 'received') as enviadas,
      count(m.*) filter (where m.message_status = 'failed'
                           and coalesce(m.provider_error_code, '') not in ('131049', '130472', '131026')) as falhas_nossas,
      max(m.sent_at) filter (where m.message_status in ('delivered', 'read')) as ultima_entrega,
      -- 131042 é a falha de pagamento de verdade (o 141006 do healthStatus fica preso e não vale).
      max(m.sent_at) filter (where m.message_status = 'failed'
                               and (m.provider_error_code = '131042' or m.provider_error_message ~* 'payment')) as ultima_falha_pagamento,
      max(m.sent_at) filter (where m.message_status in ('delivered', 'read') and m.sent_at > now() - interval '48 hours') as entrega_48h
    from base b
    left join sigzap_conversations sc on sc.instance_id = b.instance_id
    left join sigzap_messages m on m.conversation_id = sc.id and m.from_me and m.sent_at > now() - interval '7 days'
    group by b.id
  ),
  webhook as (
    select b.id,
      max(e.received_at) filter (where e.event_type in ('message', 'messages')) as ultimo_recebido,
      count(*) filter (where e.event_type in ('message', 'messages')) / 7.0 as recebidos_por_dia
    from base b
    left join whatsapp_chakra_webhook_events e on e.phone_number_id = b.phone_number_id and e.received_at > now() - interval '7 days'
    group by b.id
  ),
  sonda as (
    select distinct on (k.phone_e164) k.phone_e164, k.resultado, k.categoria, k.em
      from whatsapp_monitor_checagens k
     where k.tipo = 'sonda' and k.em > now() - interval '12 hours'
     order by k.phone_e164, k.em desc
  ),
  regra as (
    select b.*, e.enviadas, e.falhas_nossas, e.ultima_entrega, e.ultima_falha_pagamento, e.entrega_48h,
      w.ultimo_recebido, w.recebidos_por_dia,
      (s.resultado = 'falha' and s.categoria = 'permissao') as sem_permissao
    from base b join envio e on e.id = b.id join webhook w on w.id = b.id
    left join sonda s on s.phone_e164 = b.phone_e164
  ),
  calc as (
    select id,
      case
        when status = 'desconectado' then 'indisponivel'
        when coalesce(sem_permissao, false) then 'indisponivel'
        when upper(coalesce(quality_rating, '')) = 'RED' then 'indisponivel'
        when instance_id is null then 'indisponivel'
        when ultima_falha_pagamento > now() - interval '48 hours'
             and coalesce(entrega_48h, '-infinity') < ultima_falha_pagamento then 'atencao'
        when enviadas >= 10 and falhas_nossas::numeric / enviadas >= 0.2 then 'atencao'
        when recebidos_por_dia >= 5 and coalesce(ultimo_recebido, '-infinity') < now() - interval '12 hours' then 'atencao'
        when upper(coalesce(name_status, '')) = 'DECLINED' then 'atencao'
        when ultima_entrega is null or ultima_entrega < now() - interval '7 days' then 'atencao'
        else 'disponivel'
      end as disp,
      case
        when status = 'desconectado' then 'Desligado manualmente no Sigma.'
        when coalesce(sem_permissao, false) then 'A Meta recusou o acesso ao número. Reconectar pelo Sigma (Conectar número).'
        when upper(coalesce(quality_rating, '')) = 'RED' then 'Qualidade vermelha na Meta: risco de perder o número.'
        when instance_id is null then 'Nenhuma mensagem deste número chega ao Sigma desde a conexão.'
        when ultima_falha_pagamento > now() - interval '48 hours'
             and coalesce(entrega_48h, '-infinity') < ultima_falha_pagamento
          then 'Pagamento recusado pela Meta num envio real. Conferir a forma de pagamento desta conta no Meta Business.'
        when enviadas >= 10 and falhas_nossas::numeric / enviadas >= 0.2
          then round(100 * falhas_nossas::numeric / enviadas) || '% das mensagens falharam nos últimos 7 dias.'
        when recebidos_por_dia >= 5 and coalesce(ultimo_recebido, '-infinity') < now() - interval '12 hours'
          then 'Nada chega deste número há ' || round(extract(epoch from now() - ultimo_recebido) / 3600) || ' h.'
        when upper(coalesce(name_status, '')) = 'DECLINED' then 'Nome de exibição recusado: limite de envio reduzido.'
        when ultima_entrega is null or ultima_entrega < now() - interval '7 days' then 'Nenhuma entrega nos últimos 7 dias.'
        else 'Entregando normalmente.'
      end as motivo
    from regra
  )
  update whatsapp_chakra_connections c
     set disponibilidade = calc.disp, disponibilidade_motivo = calc.motivo, disponibilidade_em = now()
    from calc where calc.id = c.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.whatsapp_numeros_recalcular_disponibilidade() from public, anon;
grant execute on function public.whatsapp_numeros_recalcular_disponibilidade() to authenticated, service_role;
