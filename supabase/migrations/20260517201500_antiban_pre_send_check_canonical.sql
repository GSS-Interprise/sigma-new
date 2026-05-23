-- =====================================================================
-- Consolida pre_send_check em UMA única assinatura (4-arg) lendo da
-- antiban_rate_config + antiban_global_config.
--
-- Estado pré-migration (descoberto em runtime, 17/05):
--   - 2-arg (p_chip_id, p_evento_origem) — refatorada em 20260517195210
--     mas NINGUÉM CHAMA (não é a assinatura que evo-sender.ts usa).
--   - 4-arg (p_chip_id, p_to_jid, p_conteudo_hash, p_evento_origem) —
--     a "real" usada por evo-sender.ts. Estava com valores hardcoded.
--
-- Mudança aqui:
--   1. DROP da 2-arg (não usada, evita confusão futura).
--   2. CREATE OR REPLACE da 4-arg lendo da config + preservando todas
--      as features extras: aquecimento, fase guard, health degradation
--      multiplier, campos extras no return jsonb.
-- =====================================================================

DROP FUNCTION IF EXISTS public.pre_send_check(uuid, text);

CREATE OR REPLACE FUNCTION public.pre_send_check(
  p_chip_id        uuid,
  p_to_jid         text,
  p_conteudo_hash  text,
  p_evento_origem  text DEFAULT 'cold_disparo'
)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
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
  v_warmup_limit   int;
  v_sent_today     int;
  v_sent_minute    int;
  v_sent_hour      int;
  v_delay_ms       int;
BEGIN
  -- Carrega rate config da tabela (fallback aos defaults se row sumir)
  SELECT max_per_min, max_per_hour, min_delay_ms, max_delay_ms
    INTO v_max_per_min, v_max_per_hour, v_min_delay_ms, v_max_delay_ms
    FROM public.antiban_rate_config WHERE evento_origem = p_evento_origem;

  IF NOT FOUND THEN
    -- evento_origem desconhecido — usa defaults de cold_disparo
    v_max_per_min  := 3;
    v_max_per_hour := 15;
    v_min_delay_ms := 8000;
    v_max_delay_ms := 20000;
  END IF;

  -- Carrega thresholds globais
  SELECT health_pause_threshold, health_pause_hours,
         reply_rate_threshold, reply_rate_min_samples, reply_rate_pause_hours
    INTO v_health_th, v_health_hrs, v_reply_th, v_reply_min, v_reply_hrs
    FROM public.antiban_global_config WHERE id = 1;

  IF NOT FOUND THEN
    v_health_th  := 95;
    v_health_hrs := 2;
    v_reply_th   := 0.05;
    v_reply_min  := 50;
    v_reply_hrs  := 6;
  END IF;

  SELECT * INTO v_state FROM public.chip_state WHERE chip_id = p_chip_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'chip_state_missing');
  END IF;

  -- Guard 1: pause ativa
  IF v_state.paused_until IS NOT NULL AND v_state.paused_until > now() THEN
    RETURN jsonb_build_object('allow', false,
      'reason', 'paused: ' || COALESCE(v_state.pause_reason, 'unknown'),
      'retry_in_ms', (EXTRACT(EPOCH FROM (v_state.paused_until - now())) * 1000)::int);
  END IF;

  -- Guard 2: cold/cadência exige chip em produção/pronto
  IF p_evento_origem IN ('cold_disparo', 'cadencia')
     AND v_state.fase NOT IN ('producao', 'pronto') THEN
    RETURN jsonb_build_object('allow', false,
      'reason', 'fase_invalida_para_cold: ' || v_state.fase);
  END IF;

  -- Guard 3: chip em aquecimento só aceita evento_origem='aquecimento'
  IF v_state.fase = 'aquecimento' AND p_evento_origem <> 'aquecimento' THEN
    RETURN jsonb_build_object('allow', false,
      'reason', 'fase_aquecimento_so_aceita_aquecimento');
  END IF;

  -- Guard 4: health crítico auto-pause
  v_health := public.chip_health_score(p_chip_id);
  IF v_health >= v_health_th THEN
    UPDATE public.chip_state
      SET paused_until = now() + (v_health_hrs || ' hours')::interval,
          pause_reason = 'health_critical_' || v_health
      WHERE chip_id = p_chip_id;
    RETURN jsonb_build_object('allow', false, 'reason', 'health_critical', 'health_score', v_health);
  END IF;

  -- Guard 5: warmup daily limit (só cold/cadência)
  IF v_state.fase IN ('producao', 'pronto')
     AND p_evento_origem IN ('cold_disparo', 'cadencia') THEN
    v_warmup_limit := public.chip_warmup_limit(p_chip_id);
    v_sent_today   := public.chip_window_count(p_chip_id, INTERVAL '24 hours', NULL);
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

  -- Guard 8: reply rate crítico (só cold/cadência)
  IF p_evento_origem IN ('cold_disparo', 'cadencia') THEN
    v_reply_rate := public.chip_reply_rate_24h(p_chip_id);
    IF v_reply_rate IS NOT NULL
       AND v_reply_rate < v_reply_th
       AND public.chip_window_count(p_chip_id, INTERVAL '24 hours', 'cold_disparo') >= v_reply_min THEN
      UPDATE public.chip_state
        SET paused_until = now() + (v_reply_hrs || ' hours')::interval,
            pause_reason = 'reply_rate_critical'
        WHERE chip_id = p_chip_id;
      RETURN jsonb_build_object('allow', false, 'reason', 'reply_rate_critical', 'reply_rate', v_reply_rate);
    END IF;
  END IF;

  -- Delay gaussian
  IF v_max_delay_ms = 0 THEN
    v_delay_ms := 0;
  ELSE
    v_delay_ms := ((v_min_delay_ms + v_max_delay_ms) / 2.0
                  + ((random() + random() + random() + random() - 2.0) / 2.0
                     * (v_max_delay_ms - v_min_delay_ms) / 4.0))::int;
    v_delay_ms := GREATEST(v_min_delay_ms, LEAST(v_max_delay_ms, v_delay_ms));
  END IF;

  -- Health degradado: aumenta delay (graceful degradation antes do auto-pause)
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

-- =====================================================================
-- Atualiza CHECK pra incluir 'aquecimento' (precisa vir ANTES do INSERT)
-- =====================================================================
ALTER TABLE public.antiban_rate_config DROP CONSTRAINT IF EXISTS antiban_rate_evento_valido;
ALTER TABLE public.antiban_rate_config ADD CONSTRAINT antiban_rate_evento_valido CHECK (
  evento_origem IN ('cold_disparo','cadencia','manual','qa_relay','resposta_ia','opt_out','handoff','aquecimento')
);

-- Seed 'aquecimento' — não estava no seed inicial
INSERT INTO public.antiban_rate_config (evento_origem, max_per_min, max_per_hour, min_delay_ms, max_delay_ms, motivo)
VALUES ('aquecimento', 5, 25, 5000, 30000, 'seed inicial — match com 4-arg pre_send_check')
ON CONFLICT (evento_origem) DO NOTHING;

-- Atualiza qa_relay/opt_out/handoff pra match com a 4-arg original (max_per_hour 25, max_delay 4000)
UPDATE public.antiban_rate_config
SET max_per_hour = 25, max_delay_ms = 4000,
    motivo = 'sync com 4-arg pre_send_check existente (migration 20260517201500)'
WHERE evento_origem IN ('qa_relay', 'opt_out', 'handoff')
  AND (max_per_hour <> 25 OR max_delay_ms <> 4000);
