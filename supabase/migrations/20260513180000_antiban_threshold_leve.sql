-- =====================================================================
-- Afrouxa thresholds do anti-ban — falsos positivos estavam pausando
-- chips saudáveis por horas/dias.
--
-- Mudanças no public.pre_send_check:
--   Guard 4 (health_critical):
--     Antes: health >= 85 → pausa 6h
--     Agora: health >= 95 → pausa 2h
--     Justificativa: health 85-94 é "atenção", não "crítico". Pausar
--     6h por isso descarta capacidade demais.
--
--   Guard 8 (reply_rate_critical):
--     Antes: reply_rate < 0.10 AND envios >= 20 → pausa 24h
--     Agora: reply_rate < 0.05 AND envios >= 50 → pausa 6h
--     Justificativa: prospecção B2B de vagas médicas tem reply rate
--     baixo natural — 10% em 20 disparos é frio cedo demais pra pausar
--     24h. 5% em 50 disparos já é amostra que sustenta a decisão, e
--     6h é tempo suficiente pra chip "respirar" sem perder o dia.
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
  -- Limites por origem
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
    ELSE  -- cold_disparo, cadencia
      v_max_per_min := 3;
      v_max_per_hour := 15;
      v_min_delay_ms := 30000;
      v_max_delay_ms := 90000;
  END CASE;

  -- Guard 1: chip existe e ativo
  SELECT cs.*, c.connection_state, c.pode_disparar INTO v_state
    FROM public.chip_state cs
    JOIN public.chips c ON c.id = cs.chip_id
    WHERE cs.chip_id = p_chip_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'chip_not_found');
  END IF;

  -- Guard 2: connection state open
  IF v_state.connection_state IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'chip_offline',
      'connection_state', v_state.connection_state);
  END IF;

  -- Guard 3: pausa ativa
  IF v_state.paused_until IS NOT NULL AND v_state.paused_until > now() THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'paused',
      'pause_reason', v_state.pause_reason, 'until', v_state.paused_until);
  END IF;

  -- Guard 4: health critical AFROUXADO — só pausa em casos extremos
  v_health := public.chip_health_score(p_chip_id);
  IF v_health >= 95 THEN
    UPDATE public.chip_state SET paused_until = now() + INTERVAL '2 hours',
      pause_reason = 'health_critical_' || v_health WHERE chip_id = p_chip_id;
    RETURN jsonb_build_object('allow', false, 'reason', 'health_critical', 'health_score', v_health);
  END IF;

  -- Guard 5: warmup daily limit (SÓ cold/cadência — manual não respeita curva)
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

  -- Guard 8: reply rate crítico AFROUXADO — exige mais amostra e pausa mais curta
  IF p_evento_origem IN ('cold_disparo', 'cadencia') THEN
    v_reply_rate := public.chip_reply_rate_24h(p_chip_id);
    IF v_reply_rate IS NOT NULL AND v_reply_rate < 0.05
       AND public.chip_window_count(p_chip_id, INTERVAL '24 hours', 'cold_disparo') >= 50 THEN
      UPDATE public.chip_state SET paused_until = now() + INTERVAL '6 hours',
        pause_reason = 'reply_rate_critical' WHERE chip_id = p_chip_id;
      RETURN jsonb_build_object('allow', false, 'reason', 'reply_rate_critical', 'reply_rate', v_reply_rate);
    END IF;
  END IF;

  -- Delay
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
