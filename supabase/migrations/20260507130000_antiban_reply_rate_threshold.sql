-- =====================================================================
-- Anti-Ban — Sobe threshold do auto-pause por reply_rate_critical
--
-- Problema: regra original (5 cold sem resposta em 24h → pausa 24h)
-- mata chips B2B BR onde médicos respondem em horas/dias, não segundos.
-- Sample de 5 é ruído estatístico — 20 é sinal real.
--
-- Diff: cold_disparo window_count threshold 5 → 20
-- =====================================================================

CREATE OR REPLACE FUNCTION public.pre_send_check(
  p_chip_id uuid,
  p_to_jid text,
  p_conteudo_hash text,
  p_evento_origem text
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_state record;
  v_warmup_limit int;
  v_sent_today int;
  v_sent_minute int;
  v_sent_hour int;
  v_health int;
  v_reply_rate numeric;
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
    WHEN 'qa_relay', 'opt_out', 'handoff' THEN
      v_max_per_min := 5;
      v_max_per_hour := 25;
      v_min_delay_ms := 1000;
      v_max_delay_ms := 4000;
    WHEN 'aquecimento' THEN
      v_max_per_min := 5;
      v_max_per_hour := 25;
      v_min_delay_ms := 5000;
      v_max_delay_ms := 30000;
    ELSE
      v_max_per_min := 3;
      v_max_per_hour := 15;
      v_min_delay_ms := 30000;
      v_max_delay_ms := 90000;
  END CASE;

  SELECT * INTO v_state FROM public.chip_state WHERE chip_id = p_chip_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'chip_state_missing');
  END IF;

  IF v_state.paused_until IS NOT NULL AND v_state.paused_until > now() THEN
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'paused: ' || COALESCE(v_state.pause_reason, 'unknown'),
      'retry_in_ms', (EXTRACT(EPOCH FROM (v_state.paused_until - now())) * 1000)::int
    );
  END IF;

  IF p_evento_origem IN ('cold_disparo', 'cadencia')
     AND v_state.fase NOT IN ('producao', 'pronto') THEN
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'fase_invalida_para_cold: ' || v_state.fase
    );
  END IF;

  IF v_state.fase = 'aquecimento' AND p_evento_origem <> 'aquecimento' THEN
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'fase_aquecimento_so_aceita_aquecimento'
    );
  END IF;

  v_health := public.chip_health_score(p_chip_id);
  IF v_health >= 85 THEN
    UPDATE public.chip_state
      SET paused_until = now() + INTERVAL '6 hours',
          pause_reason = 'health_critical_' || v_health
      WHERE chip_id = p_chip_id;
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'health_critical',
      'health_score', v_health
    );
  END IF;

  IF v_state.fase IN ('producao', 'pronto')
     AND p_evento_origem IN ('cold_disparo', 'cadencia') THEN
    v_warmup_limit := public.chip_warmup_limit(p_chip_id);
    v_sent_today := public.chip_window_count(p_chip_id, INTERVAL '24 hours', NULL);
    IF v_sent_today >= v_warmup_limit THEN
      RETURN jsonb_build_object(
        'allow', false,
        'reason', 'warmup_daily_limit',
        'sent_today', v_sent_today,
        'limit', v_warmup_limit
      );
    END IF;
  END IF;

  v_sent_minute := public.chip_window_count(p_chip_id, INTERVAL '1 minute', NULL);
  IF v_sent_minute >= v_max_per_min THEN
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'rate_minute',
      'sent_minute', v_sent_minute,
      'retry_in_ms', 60000
    );
  END IF;

  v_sent_hour := public.chip_window_count(p_chip_id, INTERVAL '1 hour', NULL);
  IF v_sent_hour >= v_max_per_hour THEN
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'rate_hour',
      'sent_hour', v_sent_hour,
      'retry_in_ms', 600000
    );
  END IF;

  -- Reply rate crítico: threshold 20 cold (era 5) — sample mínimo pra
  -- ser estatisticamente relevante em B2B BR onde médico responde em horas.
  IF p_evento_origem IN ('cold_disparo', 'cadencia') THEN
    v_reply_rate := public.chip_reply_rate_24h(p_chip_id);
    IF v_reply_rate IS NOT NULL AND v_reply_rate < 0.10
       AND public.chip_window_count(p_chip_id, INTERVAL '24 hours', 'cold_disparo') >= 20 THEN
      UPDATE public.chip_state
        SET paused_until = now() + INTERVAL '24 hours',
            pause_reason = 'reply_rate_critical'
        WHERE chip_id = p_chip_id;
      RETURN jsonb_build_object(
        'allow', false,
        'reason', 'reply_rate_critical',
        'reply_rate', v_reply_rate
      );
    END IF;
  END IF;

  IF v_max_delay_ms = 0 THEN
    v_delay_ms := 0;
  ELSE
    v_delay_ms := ((v_min_delay_ms + v_max_delay_ms) / 2.0
                  + ((random() + random() + random() + random() - 2.0) / 2.0
                     * (v_max_delay_ms - v_min_delay_ms) / 4.0))::int;
    v_delay_ms := GREATEST(v_min_delay_ms, LEAST(v_max_delay_ms, v_delay_ms));
  END IF;

  IF v_health >= 60 THEN v_delay_ms := v_delay_ms * 2; END IF;
  IF v_health >= 75 THEN v_delay_ms := v_delay_ms * 5; END IF;

  RETURN jsonb_build_object(
    'allow', true,
    'delay_ms', v_delay_ms,
    'health_score', v_health,
    'sent_today', COALESCE(v_sent_today, 0),
    'warmup_limit', COALESCE(v_warmup_limit, 2147483647),
    'fase', v_state.fase
  );
END $$;
