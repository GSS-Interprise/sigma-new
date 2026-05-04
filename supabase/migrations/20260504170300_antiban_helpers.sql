-- =====================================================================
-- Plano Aquecimento + Anti-Ban v1 — Sprint 1
-- Funções auxiliares chamadas pelo helper TS evo-sender.ts e pelos crons
-- =====================================================================


-- ---------------------------------------------------------------------
-- chip_state_bump_send(chip_id, success) — atualiza contadores atomicamente
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chip_state_bump_send(p_chip_id uuid, p_success bool)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.chip_state
    SET last_send_at = now(),
        total_disparos_lifetime = total_disparos_lifetime + (CASE WHEN p_success THEN 1 ELSE 0 END),
        total_falhas_lifetime = total_falhas_lifetime + (CASE WHEN p_success THEN 0 ELSE 1 END)
    WHERE chip_id = p_chip_id;
END $$;


-- ---------------------------------------------------------------------
-- chip_state_bump_receive(chip_id) — atualiza last_receive_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chip_state_bump_receive(p_chip_id uuid)
RETURNS void LANGUAGE sql AS $$
  UPDATE public.chip_state SET last_receive_at = now() WHERE chip_id = p_chip_id;
$$;


-- ---------------------------------------------------------------------
-- chip_register_disconnect(chip_id, code, reason)
-- Registra evento de saúde a partir de código de desconexão.
-- Usa classify_disconnect pra decidir score/categoria/pause.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chip_register_disconnect(
  p_chip_id uuid,
  p_code int,
  p_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_class jsonb;
  v_score_delta int;
  v_event_type text;
  v_should_pause int;
BEGIN
  v_class := public.classify_disconnect(p_code, p_reason);
  v_score_delta := COALESCE((v_class->>'score_delta')::int, 5);
  v_event_type := COALESCE(v_class->>'event_type', 'disconnect_other');
  v_should_pause := COALESCE((v_class->>'should_pause_hours')::int, 0);

  -- Registra evento
  INSERT INTO public.chip_health_event (chip_id, tipo, detalhe, score_delta)
  VALUES (p_chip_id, v_event_type, jsonb_build_object('code', p_code, 'reason', p_reason, 'classification', v_class), v_score_delta);

  -- Pausa automaticamente se categoria fatal
  IF v_should_pause > 0 THEN
    UPDATE public.chip_state
      SET paused_until = now() + (v_should_pause || ' hours')::interval,
          pause_reason = 'auto_disconnect_' || p_code
      WHERE chip_id = p_chip_id;
  END IF;

  RETURN v_class;
END $$;


-- ---------------------------------------------------------------------
-- chip_health_monitor_tick() — chamado por pg_cron a cada 1 min
-- Recalcula health_score pra todos os chips ativos e expira pauses.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chip_health_monitor_tick()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_atualizados int := 0;
  v_despausados int := 0;
  v_queimados int := 0;
BEGIN
  -- 1. Atualiza score de todos os chips em fase ativa
  WITH updated AS (
    UPDATE public.chip_state cs
    SET health_score = public.chip_health_score(cs.chip_id)
    WHERE cs.fase IN ('aquecimento', 'pronto', 'producao', 'pausado')
    RETURNING chip_id, health_score
  )
  SELECT COUNT(*) INTO v_atualizados FROM updated;

  -- 2. Expira pauses cujo paused_until já passou
  UPDATE public.chip_state
    SET paused_until = NULL, pause_reason = NULL
    WHERE paused_until IS NOT NULL AND paused_until <= now();
  GET DIAGNOSTICS v_despausados = ROW_COUNT;

  -- 3. Marca como queimado quem score >= 95 + tempo de fase já passou
  UPDATE public.chip_state
    SET fase = 'queimado',
        fase_inicio_at = now()
    WHERE health_score >= 95
      AND fase NOT IN ('queimado', 'novo', 'setup');
  GET DIAGNOSTICS v_queimados = ROW_COUNT;

  RETURN jsonb_build_object(
    'atualizados', v_atualizados,
    'despausados', v_despausados,
    'queimados', v_queimados,
    'ts', now()
  );
END $$;


-- ---------------------------------------------------------------------
-- Cron job pra rodar o monitor a cada 1 min
-- ---------------------------------------------------------------------
SELECT cron.schedule(
  'chip-health-monitor-1min',
  '* * * * *',
  $$ SELECT public.chip_health_monitor_tick(); $$
);
