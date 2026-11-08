-- Números oficiais (Chakra): para que serve cada um e se dá para usar agora.
-- Plano docs/arquitetura/plano-goal-gss-dono-no-comando.md, Fase 0.2.
--
-- Por que existe: o painel da Chakra mostra "conectado" para todos, mas a Meta separa
-- o que o número consegue fazer (healthStatus.can_send_message por entidade) e o envio
-- real às vezes contradiz os dois (feedback 05/11: só envio real prova). A disponibilidade
-- junta as três fontes numa frase que o dono entende.

alter table public.whatsapp_chakra_connections
  add column if not exists uso text not null default 'prospeccao',
  add column if not exists disponibilidade text,
  add column if not exists disponibilidade_motivo text,
  add column if not exists disponibilidade_em timestamptz;

alter table public.whatsapp_chakra_connections
  drop constraint if exists whatsapp_chakra_connections_uso_check;
alter table public.whatsapp_chakra_connections
  add constraint whatsapp_chakra_connections_uso_check
  check (uso in ('prospeccao', 'financeiro', 'pessoal'));

-- Número da Amni: só automações financeiras (Raul, 08/11). Nunca entra em prospecção.
update public.whatsapp_chakra_connections set uso = 'financeiro' where phone_e164 = '+554799018860';

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
    select
      c.id,
      c.status,
      c.quality_rating,
      c.name_status,
      c.provider_payload -> 'phone' -> 'healthStatus' as health,
      i.id as instance_id
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
      count(m.*) filter (where m.message_status = 'failed') as falhas,
      max(m.sent_at) filter (where m.message_status in ('delivered', 'read')) as ultima_entrega
    from base b
    left join sigzap_conversations sc on sc.instance_id = b.instance_id
    left join sigzap_messages m on m.conversation_id = sc.id and m.from_me and m.sent_at > now() - interval '7 days'
    group by b.id
  ),
  regra as (
    select b.id,
      exists (
        select 1 from jsonb_array_elements(coalesce(b.health -> 'entities', '[]'::jsonb)) e
        where e ->> 'entity_type' = 'WABA' and e ->> 'can_send_message' = 'BLOCKED'
          and (e -> 'errors')::text like '%141006%'
      ) as pagamento_bloqueado,
      exists (
        select 1 from jsonb_array_elements(coalesce(b.health -> 'entities', '[]'::jsonb)) e
        where e ->> 'entity_type' in ('WABA', 'BUSINESS') and e ->> 'can_send_message' = 'BLOCKED'
          and (e -> 'errors')::text not like '%141006%'
      ) as conta_bloqueada,
      b.status, b.quality_rating, b.name_status, b.instance_id,
      e.enviadas, e.falhas, e.ultima_entrega
    from base b join envio e on e.id = b.id
  ),
  calc as (
    select id,
      case
        when status = 'desconectado' then 'indisponivel'
        when upper(coalesce(quality_rating, '')) = 'RED' then 'indisponivel'
        when conta_bloqueada then 'indisponivel'
        when instance_id is null then 'indisponivel'
        when pagamento_bloqueado then 'atencao'
        when enviadas >= 10 and falhas::numeric / enviadas >= 0.2 then 'atencao'
        when upper(coalesce(name_status, '')) = 'DECLINED' then 'atencao'
        when ultima_entrega is null or ultima_entrega < now() - interval '7 days' then 'atencao'
        else 'disponivel'
      end as disp,
      case
        when status = 'desconectado' then 'Desligado manualmente no Sigma.'
        when upper(coalesce(quality_rating, '')) = 'RED' then 'Qualidade vermelha na Meta: risco de perder o número.'
        when conta_bloqueada then 'A Meta bloqueou o envio da conta (não é pagamento). Ver o painel da Chakra.'
        when instance_id is null then 'Nenhuma mensagem deste número chega ao Sigma desde a conexão.'
        when pagamento_bloqueado then 'Pagamento recusado pela Meta (141006): campanha bloqueada; responder em até 24 h funciona.'
        when enviadas >= 10 and falhas::numeric / enviadas >= 0.2
          then round(100 * falhas::numeric / enviadas) || '% das mensagens falharam nos últimos 7 dias.'
        when upper(coalesce(name_status, '')) = 'DECLINED' then 'Nome de exibição recusado: limite de envio reduzido.'
        when ultima_entrega is null or ultima_entrega < now() - interval '7 days' then 'Nenhuma entrega nos últimos 7 dias.'
        else 'Entregando normalmente.'
      end as motivo
    from regra
  )
  update whatsapp_chakra_connections c
     set disponibilidade = calc.disp,
         disponibilidade_motivo = calc.motivo,
         disponibilidade_em = now()
    from calc
   where calc.id = c.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.whatsapp_numeros_recalcular_disponibilidade() from public, anon;
grant execute on function public.whatsapp_numeros_recalcular_disponibilidade() to authenticated, service_role;

-- Resumo por número para a tela Configurações › WhatsApp (lê tudo de uma vez).
create or replace function public.whatsapp_numeros_oficiais_painel()
returns table (
  connection_id uuid,
  phone_e164 text,
  display_name text,
  uso text,
  responsavel_id uuid,
  responsavel_nome text,
  plugin_id text,
  conta text,
  disponibilidade text,
  disponibilidade_motivo text,
  disponibilidade_em timestamptz,
  quality_rating text,
  name_status text,
  meta_pode_enviar text,
  enviadas_7d bigint,
  falhas_7d bigint,
  ultima_entrega timestamptz,
  templates_aprovados bigint,
  tem_template_padrao boolean,
  sender_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.phone_e164,
    c.display_name,
    c.uso,
    c.responsavel_id,
    p.nome_completo,
    c.plugin_id,
    -- Números conectados pela conta Chakra da Pulse (Raul) e não pela da GSS (08/11: só o da Amni).
    case when c.phone_e164 = '+554799018860' then 'Pulse' else 'GSS' end,
    c.disponibilidade,
    c.disponibilidade_motivo,
    c.disponibilidade_em,
    c.quality_rating,
    c.name_status,
    c.provider_payload -> 'phone' -> 'healthStatus' ->> 'can_send_message',
    coalesce(e.enviadas, 0),
    coalesce(e.falhas, 0),
    e.ultima_entrega,
    coalesce(t.aprovados, 0),
    coalesce(t.tem_padrao, false),
    s.id
  from whatsapp_chakra_connections c
  left join profiles p on p.id = c.responsavel_id
  left join lateral (
    select ws.id from whatsapp_official_senders ws
    where ws.provider = 'chakra' and ws.chakra_phone_number_id = c.phone_number_id
    limit 1
  ) s on true
  left join lateral (
    select
      count(m.*) filter (where m.message_status is distinct from 'received') as enviadas,
      count(m.*) filter (where m.message_status = 'failed') as falhas,
      max(m.sent_at) filter (where m.message_status in ('delivered', 'read')) as ultima_entrega
    from sigzap_instances si
    join sigzap_conversations sc on sc.instance_id = si.id
    join sigzap_messages m on m.conversation_id = sc.id and m.from_me and m.sent_at > now() - interval '7 days'
    where si.provider = 'chakra' and si.phone_number = c.phone_e164
  ) e on true
  left join lateral (
    -- Template é por conta (WABA); a cópia de cada número está em content_sid 'chakra:<plugin_id>:<id>'.
    select
      count(*) as aprovados,
      bool_or(wt.friendly_name = 'gss_oportunidade_sair_20261026') as tem_padrao
    from whatsapp_official_templates wt
    where wt.provider = 'chakra' and wt.approval_status = 'approved'
      and wt.content_sid like 'chakra:' || c.plugin_id || ':%'
  ) t on true
  where public.is_admin(auth.uid()) or public.has_captacao_permission(auth.uid(), 'seigzaps_config')
     or coalesce(auth.role(), '') = 'service_role';
$$;

revoke all on function public.whatsapp_numeros_oficiais_painel() from public, anon;
grant execute on function public.whatsapp_numeros_oficiais_painel() to authenticated, service_role;

select public.whatsapp_numeros_recalcular_disponibilidade();

-- Sincroniza a saúde na Chakra 3x por dia (7h, 12h, 17h BRT) e recalcula a cada hora
-- (as entregas mudam ao longo do dia, a saúde da Meta muda pouco).
select cron.unschedule(jobid) from cron.job where jobname in ('chakra-refresh-status', 'whatsapp-disponibilidade');

select cron.schedule('chakra-refresh-status', '0 10,15,20 * * *', $cron$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/chakra-connect',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"action":"refresh_status"}'::jsonb, timeout_milliseconds := 120000);
$cron$);

select cron.schedule('whatsapp-disponibilidade', '5 * * * *', $cron$
  select public.whatsapp_numeros_recalcular_disponibilidade();
$cron$);
