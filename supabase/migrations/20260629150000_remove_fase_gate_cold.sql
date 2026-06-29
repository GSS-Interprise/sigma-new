-- Remove a trava 'fase_invalida_para_cold' do pre_send_check (29/06).
-- Decisão Raul: os chips são AQUECIDOS EXTERNAMENTE pela equipe ANTES de plugar
-- ([[aquecimento-externo-pre-conexao]]). Logo, exigir fase 'pronto/producao' interna
-- pra cold não faz sentido — chip conectado já chega aquecido. O bloqueio estava
-- impedindo campanhas IA de disparar em chips novos (ex: "Bruna 2" fase=novo, embora
-- aquecido fora). Demais guards (pause, health, rate/min, rate/hora, reply rate) ficam.
create or replace function public.pre_send_check(p_chip_id uuid, p_to_jid text, p_conteudo_hash text, p_evento_origem text default 'cold_disparo'::text)
 returns jsonb language plpgsql as $function$
declare
  v_state          record;
  v_max_per_min    int;
  v_max_per_hour   int;
  v_min_delay_ms   int;
  v_max_delay_ms   int;
  v_health_th      int;
  v_health_hrs     int;
  v_reply_th       numeric;
  v_reply_min      int;
  v_reply_hrs      int;
  v_health         int;
  v_reply_rate     numeric;
  v_sent_today     int;
  v_sent_minute    int;
  v_sent_hour      int;
  v_delay_ms       int;
begin
  select max_per_min, max_per_hour, min_delay_ms, max_delay_ms
    into v_max_per_min, v_max_per_hour, v_min_delay_ms, v_max_delay_ms
    from public.antiban_rate_config where evento_origem = p_evento_origem;
  if not found then
    v_max_per_min := 3; v_max_per_hour := 15; v_min_delay_ms := 8000; v_max_delay_ms := 20000;
  end if;

  select health_pause_threshold, health_pause_hours, reply_rate_threshold, reply_rate_min_samples, reply_rate_pause_hours
    into v_health_th, v_health_hrs, v_reply_th, v_reply_min, v_reply_hrs
    from public.antiban_global_config where id = 1;
  if not found then
    v_health_th := 95; v_health_hrs := 2; v_reply_th := 0.05; v_reply_min := 50; v_reply_hrs := 6;
  end if;

  select * into v_state from public.chip_state where chip_id = p_chip_id;
  if not found then
    return jsonb_build_object('allow', false, 'reason', 'chip_state_missing');
  end if;

  -- Guard 1: pause ativa
  if v_state.paused_until is not null and v_state.paused_until > now() then
    return jsonb_build_object('allow', false, 'reason', 'paused: ' || coalesce(v_state.pause_reason, 'unknown'),
      'retry_in_ms', (extract(epoch from (v_state.paused_until - now())) * 1000)::int);
  end if;

  -- (REMOVIDO 29/06) Guard 2 'fase_invalida_para_cold' — aquecimento é externo (equipe
  -- aquece o chip antes de plugar). Chip conectado pode cold direto. Mantém só os guards
  -- de proteção real (pause/health/rate/reply).

  -- Guard 3: chip em aquecimento INTERNO só aceita evento de aquecimento (se a fase for
  -- explicitamente 'aquecimento'; default 'novo'/'pronto' passam normal pro cold)
  if v_state.fase = 'aquecimento' and p_evento_origem <> 'aquecimento' then
    return jsonb_build_object('allow', false, 'reason', 'fase_aquecimento_so_aceita_aquecimento');
  end if;

  -- Guard 4: health crítico auto-pause
  v_health := public.chip_health_score(p_chip_id);
  if v_health >= v_health_th then
    update public.chip_state set paused_until = now() + (v_health_hrs || ' hours')::interval,
      pause_reason = 'health_critical_' || v_health where chip_id = p_chip_id;
    return jsonb_build_object('allow', false, 'reason', 'health_critical', 'health_score', v_health);
  end if;

  -- Teto diário = só o 35/dia hardcoded no processor. Contagem só pra info.
  v_sent_today := public.chip_window_count(p_chip_id, interval '24 hours', null);

  -- Guard 6: rate por minuto
  v_sent_minute := public.chip_window_count(p_chip_id, interval '1 minute', null);
  if v_sent_minute >= v_max_per_min then
    return jsonb_build_object('allow', false, 'reason', 'rate_minute', 'sent_minute', v_sent_minute, 'retry_in_ms', 60000);
  end if;

  -- Guard 7: rate por hora
  v_sent_hour := public.chip_window_count(p_chip_id, interval '1 hour', null);
  if v_sent_hour >= v_max_per_hour then
    return jsonb_build_object('allow', false, 'reason', 'rate_hour', 'sent_hour', v_sent_hour, 'retry_in_ms', 600000);
  end if;

  -- Guard 8: reply rate crítico (threshold 0 hoje = efetivamente off; mantido)
  if p_evento_origem in ('cold_disparo', 'cadencia') then
    v_reply_rate := public.chip_reply_rate_24h(p_chip_id);
    if v_reply_rate is not null and v_reply_rate < v_reply_th
       and public.chip_window_count(p_chip_id, interval '24 hours', 'cold_disparo') >= v_reply_min then
      update public.chip_state set paused_until = now() + (v_reply_hrs || ' hours')::interval,
        pause_reason = 'reply_rate_critical' where chip_id = p_chip_id;
      return jsonb_build_object('allow', false, 'reason', 'reply_rate_critical', 'reply_rate', v_reply_rate);
    end if;
  end if;

  -- Delay gaussian
  if v_max_delay_ms = 0 then
    v_delay_ms := 0;
  else
    v_delay_ms := ((v_min_delay_ms + v_max_delay_ms) / 2.0
                  + ((random() + random() + random() + random() - 2.0) / 2.0 * (v_max_delay_ms - v_min_delay_ms) / 4.0))::int;
    v_delay_ms := greatest(v_min_delay_ms, least(v_max_delay_ms, v_delay_ms));
  end if;
  if v_health >= 60 then v_delay_ms := v_delay_ms * 2; end if;
  if v_health >= 75 then v_delay_ms := v_delay_ms * 5; end if;

  return jsonb_build_object('allow', true, 'delay_ms', v_delay_ms, 'health_score', v_health,
    'sent_today', coalesce(v_sent_today, 0), 'fase', v_state.fase);
end $function$;
