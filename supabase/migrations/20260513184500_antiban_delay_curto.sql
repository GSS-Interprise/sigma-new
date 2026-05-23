-- =====================================================================
-- Reduz delay gaussian pra cold_disparo e cadencia.
--
-- Mudança no public.pre_send_check:
--   cold_disparo/cadencia delay min: 30000ms → 8000ms
--   cold_disparo/cadencia delay max: 90000ms → 20000ms
--
-- Justificativa:
--   - Edge Function tem timeout de 60s (MAX_EXECUTION 50s).
--   - Delay médio de 60s estourava o execution e matava o processor
--     antes de enviar 1 lead.
--   - 8-20s entre disparos do MESMO chip ainda passa por humano (médico
--     digitando outro contato 10s depois).
--   - Anti-ban tem outras camadas que protegem: rate por minuto (3/min
--     cold), rate por hora (15/h cold), warmup curve, reply rate.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.pre_send_check(
  p_chip_id uuid,
  p_evento_origem text DEFAULT 'cold_disparo'
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_state record;
  v_health int;
  v_reply_rate numeric;
  v_warmup_limit int;
  v_sent_today int;
  v_sent_minute int;
  v_sent_hour int;
  v_delay_ms int;
  v_max_per_min int;
  v_max_per_hour int;
  v_min_delay_ms int;
  v_max_delay_ms int;
BEGIN
  CASE p_evento_origem
    WHEN 'resposta_ia' THEN
      v_max_per_min := 10;
      v_max_per_hour := 30;
      v_min_delay_ms := 0;
      v_max_delay_ms := 0;
    WHEN 'manual' THEN
      v_max_per_min := 20;
      v_max_per_hour := 150;
      v_min_delay_ms := 0;
      v_max_delay_ms := 0;
    WHEN 'qa_relay', 'opt_out', 'handoff' THEN
      v_max_per_min := 5;
      v_max_per_hour := 30;
      v_min_delay_ms := 1000;
      v_max_delay_ms := 3000;
    ELSE  -- cold_disparo, cadencia — DELAY REDUZIDO 8-20s
      v_max_per_min := 3;
      v_max_per_hour := 15;
      v_min_delay_ms := 8000;
      v_max_delay_ms := 20000;
  END CASE;

  SELECT cs.*, c.connection_state, c.pode_disparar INTO v_state
    FROM public.chip_state cs
    JOIN public.chips c ON c.id = cs.chip_id
    WHERE cs.chip_id = p_chip_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'chip_not_found');
  END IF;

  IF v_state.connection_state IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'chip_offline',
      'connection_state', v_state.connection_state);
  END IF;

  IF v_state.paused_until IS NOT NULL AND v_state.paused_until > now() THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'paused',
      'pause_reason', v_state.pause_reason, 'until', v_state.paused_until);
  END IF;

  -- Guard 4: health critical (já afrouxado em 20260513180000)
  v_health := public.chip_health_score(p_chip_id);
  IF v_health >= 95 THEN
    UPDATE public.chip_state SET paused_until = now() + INTERVAL '2 hours',
      pause_reason = 'health_critical_' || v_health WHERE chip_id = p_chip_id;
    RETURN jsonb_build_object('allow', false, 'reason', 'health_critical', 'health_score', v_health);
  END IF;

  -- Guard 5: warmup daily limit
  IF v_state.fase IN ('producao', 'pronto')
     AND p_evento_origem IN ('cold_disparo', 'cadencia') THEN
    v_warmup_limit := public.chip_warmup_limit(p_chip_id);
    v_sent_today := public.chip_window_count(p_chip_id, INTERVAL '24 hours', NULL);
    IF v_sent_today >= v_warmup_limit THEN
      RETURN jsonb_build_object('allow', false, 'reason', 'warmup_daily_limit',
        'sent_today', v_sent_today, 'limit', v_warmup_limit);
    END IF;
  END IF;

  -- Guard 6: rate por minuto
  v_sent_minute := public.chip_window_count(p_chip_id, INTERVAL '1 minute', NULL);
  IF v_sent_minute >= v_max_per_min THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'rate_minute',
      'sent_minute', v_sent_minute, 'retry_in_ms', 60000);
  END IF;

  -- Guard 7: rate por hora
  v_sent_hour := public.chip_window_count(p_chip_id, INTERVAL '1 hour', NULL);
  IF v_sent_hour >= v_max_per_hour THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'rate_hour',
      'sent_hour', v_sent_hour, 'retry_in_ms', 600000);
  END IF;

  -- Guard 8: reply rate critical (já afrouxado em 20260513180000)
  IF p_evento_origem IN ('cold_disparo', 'cadencia') THEN
    v_reply_rate := public.chip_reply_rate_24h(p_chip_id);
    IF v_reply_rate IS NOT NULL AND v_reply_rate < 0.05
       AND public.chip_window_count(p_chip_id, INTERVAL '24 hours', 'cold_disparo') >= 50 THEN
      UPDATE public.chip_state SET paused_until = now() + INTERVAL '6 hours',
        pause_reason = 'reply_rate_critical' WHERE chip_id = p_chip_id;
      RETURN jsonb_build_object('allow', false, 'reason', 'reply_rate_critical', 'reply_rate', v_reply_rate);
    END IF;
  END IF;

  -- Delay gaussian (0 pra manual/resposta_ia, 8-20s pra cold/cadencia)
  IF v_max_delay_ms = 0 THEN
    v_delay_ms := 0;
  ELSE
    v_delay_ms := ((v_min_delay_ms + v_max_delay_ms) / 2.0
                  + ((random() + random() + random() + random() - 2.0) / 2.0
                     * (v_max_delay_ms - v_min_delay_ms) / 4.0))::int;
    IF v_delay_ms < v_min_delay_ms THEN v_delay_ms := v_min_delay_ms; END IF;
    IF v_delay_ms > v_max_delay_ms THEN v_delay_ms := v_max_delay_ms; END IF;
  END IF;

  RETURN jsonb_build_object('allow', true, 'delay_ms', v_delay_ms);
END $$;
