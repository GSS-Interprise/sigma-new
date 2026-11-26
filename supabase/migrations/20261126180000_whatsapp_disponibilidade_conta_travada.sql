-- Números WhatsApp: conta travada pela Meta (131031) vira Não usar, e 131052 (erro de mídia do destinatário) sai da
-- conta de falhas nossas. Auditoria de 26/11/2026.
CREATE OR REPLACE FUNCTION public.whatsapp_numeros_recalcular_disponibilidade()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
                           and coalesce(m.provider_error_code, '') not in ('131049', '130472', '131026', '131052')) as falhas_nossas,
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
  -- Conta travada pela Meta (131031 "Business Account locked", 26/11): o 9713-2474 falhou em tudo desde 18/11 e o
  -- 93618-3761 desde 24/11, e a tela mostrava só "Atenção". Vem dos status do webhook, que cobrem todo envio (alerta,
  -- campanha, teste), não só as conversas. Travado = 131031 nas últimas 24 h e nenhuma entrega depois dele.
  trava as (
    select b.id,
      max(e.received_at) filter (where coalesce(e.payload->'item'->'errors'->0->>'code', e.payload->'statuses'->0->'errors'->0->>'code') = '131031') as ultima_trava,
      max(e.received_at) filter (where coalesce(e.payload->'item'->>'status', e.payload->'statuses'->0->>'status') in ('delivered', 'read')) as ultima_entrega_meta
    from base b
    left join whatsapp_chakra_webhook_events e on e.phone_number_id = b.phone_number_id and e.event_type = 'statuses'
      and e.received_at > now() - interval '24 hours'
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
      (s.resultado = 'falha' and s.categoria = 'permissao') as sem_permissao,
      (t.ultima_trava is not null and coalesce(t.ultima_entrega_meta, '-infinity') < t.ultima_trava) as travada
    from base b join envio e on e.id = b.id join webhook w on w.id = b.id join trava t on t.id = b.id
    left join sonda s on s.phone_e164 = b.phone_e164
  ),
  calc as (
    select id,
      case
        when status = 'desconectado' then 'indisponivel'
        when coalesce(sem_permissao, false) then 'indisponivel'
        when upper(coalesce(quality_rating, '')) = 'RED' then 'indisponivel'
        when travada then 'indisponivel'
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
        when travada then 'A Meta travou a conta deste número (131031): nada é entregue. Ver a qualidade da conta e o pagamento no Meta Business.'
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
$function$;

select public.whatsapp_numeros_recalcular_disponibilidade();
