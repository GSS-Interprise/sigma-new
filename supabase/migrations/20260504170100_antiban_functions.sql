-- =====================================================================
-- Plano Aquecimento + Anti-Ban v1 — Sprint 1
-- SQL functions: warmup_limit, window_count, health_score, reply_rate,
-- pre_send_check (master gate), classify_disconnect
-- Doc: .claude/plano-aquecimento-anti-ban-v1.md §4.2-4.3
-- =====================================================================


-- ---------------------------------------------------------------------
-- chip_warmup_limit(chip_id) → int
-- Curva conservadora B2B BR: 10, 20, 35, 50, 60, 70, 80, ∞
-- Após dia 7, sem limite warm-up (rate_limit assume controle)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chip_warmup_limit(p_chip_id uuid)
RETURNS int LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_start date;
  v_day int;
  v_curve int[] := ARRAY[10, 20, 35, 50, 60, 70, 80];
BEGIN
  SELECT warmup_start_date INTO v_start
    FROM public.chip_state WHERE chip_id = p_chip_id;
  IF v_start IS NULL THEN RETURN 0; END IF;
  v_day := (CURRENT_DATE - v_start)::int + 1;
  IF v_day > 7 THEN RETURN 2147483647; END IF;
  IF v_day < 1 THEN RETURN 0; END IF;
  RETURN v_curve[v_day];
END $$;


-- ---------------------------------------------------------------------
-- chip_window_count(chip_id, window, origem) → int
-- Conta msgs em janela rolante; origem opcional pra filtrar tipo de envio
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chip_window_count(
  p_chip_id uuid,
  p_window interval,
  p_origem text DEFAULT NULL
) RETURNS int LANGUAGE sql STABLE AS $$
  SELECT COUNT(*)::int FROM public.chip_send_log
  WHERE chip_id = p_chip_id
    AND sent_at > now() - p_window
    AND status IN ('sent', 'delivered', 'read', 'queued')
    AND (p_origem IS NULL OR evento_origem = p_origem);
$$;


-- ---------------------------------------------------------------------
-- chip_health_score(chip_id) → int (0-100)
-- Soma weighted dos eventos das últimas 6h, com decay linear por idade
-- Pesos definidos via score_delta na inserção do evento
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chip_health_score(p_chip_id uuid)
RETURNS int LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_score int := 0;
BEGIN
  SELECT COALESCE(SUM(
    score_delta * GREATEST(0.0, 1.0 - EXTRACT(EPOCH FROM (now() - occurred_at)) / (6.0 * 3600.0))
  ), 0)::int INTO v_score
  FROM public.chip_health_event
  WHERE chip_id = p_chip_id
    AND occurred_at > now() - INTERVAL '6 hours';
  RETURN GREATEST(0, LEAST(100, v_score));
END $$;


-- ---------------------------------------------------------------------
-- chip_reply_rate_24h(chip_id) → numeric (0..1) ou NULL se sem disparos
-- % cold/cadência que receberam resposta nas últimas 24h
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chip_reply_rate_24h(p_chip_id uuid)
RETURNS numeric LANGUAGE sql STABLE AS $$
  WITH disparos AS (
    SELECT DISTINCT to_jid FROM public.chip_send_log
    WHERE chip_id = p_chip_id
      AND evento_origem IN ('cold_disparo', 'cadencia')
      AND sent_at > now() - INTERVAL '24 hours'
      AND status IN ('sent', 'delivered', 'read')
  ),
  com_reply AS (
    SELECT DISTINCT d.to_jid FROM disparos d
    JOIN public.chip_receive_log r ON r.chip_id = p_chip_id AND r.from_jid = d.to_jid
    WHERE r.recebido_em > now() - INTERVAL '24 hours'
  )
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM disparos) = 0 THEN NULL
    ELSE ((SELECT COUNT(*) FROM com_reply)::numeric
        / (SELECT COUNT(*) FROM disparos))
  END;
$$;


-- ---------------------------------------------------------------------
-- classify_disconnect(code, reason) → jsonb
-- Mapeia código de desconexão → ação recomendada (categoria, backoff, score)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.classify_disconnect(p_code int, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN CASE p_code
    WHEN 401 THEN jsonb_build_object(
      'category', 'fatal',
      'message', 'Logged out / device_removed (Meta forçou logout)',
      'should_reconnect', false,
      'should_pause_hours', 24,
      'score_delta', 60,
      'event_type', 'disconnect_401'
    )
    WHEN 408 THEN jsonb_build_object(
      'category', 'recoverable',
      'message', 'Connection timeout',
      'should_reconnect', true,
      'backoff_ms', 30000,
      'score_delta', 5,
      'event_type', 'disconnect_408'
    )
    WHEN 428 THEN jsonb_build_object(
      'category', 'recoverable',
      'message', 'Connection replaced',
      'should_reconnect', true,
      'backoff_ms', 60000,
      'score_delta', 10,
      'event_type', 'disconnect_428'
    )
    WHEN 429 THEN jsonb_build_object(
      'category', 'rate-limited',
      'message', 'Rate limited by Meta',
      'should_reconnect', true,
      'backoff_ms', 600000,
      'score_delta', 25,
      'event_type', 'disconnect_429'
    )
    WHEN 440 THEN jsonb_build_object(
      'category', 'fatal',
      'message', 'Logged out / replaced',
      'should_reconnect', false,
      'should_pause_hours', 12,
      'score_delta', 40,
      'event_type', 'disconnect_440'
    )
    WHEN 500 THEN jsonb_build_object(
      'category', 'recoverable',
      'message', 'Bad session, restart needed',
      'should_reconnect', true,
      'backoff_ms', 120000,
      'score_delta', 15,
      'event_type', 'disconnect_500'
    )
    WHEN 503 THEN jsonb_build_object(
      'category', 'recoverable',
      'message', 'Service unavailable',
      'should_reconnect', true,
      'backoff_ms', 180000,
      'score_delta', 5,
      'event_type', 'disconnect_503'
    )
    WHEN 515 THEN jsonb_build_object(
      'category', 'recoverable',
      'message', 'Stream restart required',
      'should_reconnect', true,
      'backoff_ms', 60000,
      'score_delta', 10,
      'event_type', 'disconnect_515'
    )
    WHEN 1000 THEN jsonb_build_object(
      'category', 'graceful',
      'message', 'Graceful close',
      'should_reconnect', true,
      'backoff_ms', 5000,
      'score_delta', 0,
      'event_type', 'disconnect_other'
    )
    ELSE jsonb_build_object(
      'category', 'unknown',
      'message', 'Unknown disconnect code: ' || COALESCE(p_code::text, 'NULL'),
      'should_reconnect', true,
      'backoff_ms', 60000,
      'score_delta', 5,
      'event_type', 'disconnect_other'
    )
  END;
END $$;


-- ---------------------------------------------------------------------
-- pre_send_check(chip_id, to_jid, conteudo_hash, evento_origem) → jsonb
-- ÚNICO ponto de entrada antes de qualquer envio.
-- Retorna: {allow: bool, delay_ms: int, reason: text, retry_in_ms: int, ...}
-- ---------------------------------------------------------------------
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
  -- 0. Limites por origem (cold/cadência são restritos; resposta_ia é
  --    mais permissivo pq imita conversa humana real em rajada; aquecimento
  --    é controlado pelo aquecedor-tick)
  CASE p_evento_origem
    WHEN 'resposta_ia' THEN
      v_max_per_min := 10;
      v_max_per_hour := 30;
      v_min_delay_ms := 0;     -- edge IA gera próprio typing/sleep
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
    ELSE  -- cold_disparo, cadencia, manual, healthcheck
      v_max_per_min := 3;
      v_max_per_hour := 15;
      v_min_delay_ms := 30000;
      v_max_delay_ms := 90000;
  END CASE;

  -- 1. Carrega estado do chip
  SELECT * INTO v_state FROM public.chip_state WHERE chip_id = p_chip_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'chip_state_missing');
  END IF;

  -- 2. Pausa ativa?
  IF v_state.paused_until IS NOT NULL AND v_state.paused_until > now() THEN
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'paused: ' || COALESCE(v_state.pause_reason, 'unknown'),
      'retry_in_ms', (EXTRACT(EPOCH FROM (v_state.paused_until - now())) * 1000)::int
    );
  END IF;

  -- 3. Fase incompatível com cold/cadência?
  IF p_evento_origem IN ('cold_disparo', 'cadencia')
     AND v_state.fase NOT IN ('producao', 'pronto') THEN
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'fase_invalida_para_cold: ' || v_state.fase
    );
  END IF;

  -- 4. Aquecimento só aceita evento_origem = aquecimento
  IF v_state.fase = 'aquecimento' AND p_evento_origem <> 'aquecimento' THEN
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'fase_aquecimento_so_aceita_aquecimento'
    );
  END IF;

  -- 5. Health score crítico → auto-pause 6h
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

  -- 6. Warm-up: limit diário (cold/cadência sob curva 7d)
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

  -- 7. Rate limit por minuto
  v_sent_minute := public.chip_window_count(p_chip_id, INTERVAL '1 minute', NULL);
  IF v_sent_minute >= v_max_per_min THEN
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'rate_minute',
      'sent_minute', v_sent_minute,
      'retry_in_ms', 60000
    );
  END IF;

  -- 8. Rate limit por hora
  v_sent_hour := public.chip_window_count(p_chip_id, INTERVAL '1 hour', NULL);
  IF v_sent_hour >= v_max_per_hour THEN
    RETURN jsonb_build_object(
      'allow', false,
      'reason', 'rate_hour',
      'sent_hour', v_sent_hour,
      'retry_in_ms', 600000
    );
  END IF;

  -- 9. Reply rate crítico (< 10% após 5+ cold em 24h) → pausa 24h
  IF p_evento_origem IN ('cold_disparo', 'cadencia') THEN
    v_reply_rate := public.chip_reply_rate_24h(p_chip_id);
    IF v_reply_rate IS NOT NULL AND v_reply_rate < 0.10
       AND public.chip_window_count(p_chip_id, INTERVAL '24 hours', 'cold_disparo') >= 5 THEN
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

  -- 10. Delay com aproximação Gaussian (média de 4 uniformes ≈ Box-Muller).
  -- Se min/max=0 (resposta_ia), delay=0 e a edge controla typing
  IF v_max_delay_ms = 0 THEN
    v_delay_ms := 0;
  ELSE
    v_delay_ms := ((v_min_delay_ms + v_max_delay_ms) / 2.0
                  + ((random() + random() + random() + random() - 2.0) / 2.0
                     * (v_max_delay_ms - v_min_delay_ms) / 4.0))::int;
    v_delay_ms := GREATEST(v_min_delay_ms, LEAST(v_max_delay_ms, v_delay_ms));
  END IF;

  -- 11. Reduz rate em score elevado (graceful degradation antes de pausar)
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
