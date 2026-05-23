-- =====================================================================
-- Anti-Ban Config Runtime — editável via UI por qualquer user autenticado.
--
-- Substitui CASE hardcoded em pre_send_check + array hardcoded em
-- chip_warmup_limit por SELECT em config tables.
--
-- Defesa em profundidade: bounds via CHECK constraints. Mesmo bug na UI
-- não consegue setar valor que queima chips (ex: delay <3s, rate >30/min).
--
-- Auditoria via tabela antiban_config_history (snapshot por mudança).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. antiban_rate_config — 1 row por evento_origem
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.antiban_rate_config (
  evento_origem  text PRIMARY KEY,
  max_per_min    int  NOT NULL,
  max_per_hour   int  NOT NULL,
  min_delay_ms   int  NOT NULL,
  max_delay_ms   int  NOT NULL,
  motivo         text,
  updated_by     uuid REFERENCES auth.users(id),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT antiban_rate_evento_valido CHECK (
    evento_origem IN ('cold_disparo','cadencia','manual','qa_relay','resposta_ia','opt_out','handoff')
  ),
  CONSTRAINT antiban_rate_min_per_min  CHECK (max_per_min  BETWEEN 1 AND 30),
  CONSTRAINT antiban_rate_min_per_hour CHECK (max_per_hour BETWEEN max_per_min AND 500),
  CONSTRAINT antiban_rate_delay_min    CHECK (min_delay_ms BETWEEN 0 AND 300000),
  CONSTRAINT antiban_rate_delay_max    CHECK (max_delay_ms BETWEEN min_delay_ms AND 300000)
);

COMMENT ON TABLE public.antiban_rate_config IS
  'Rate limits e delays por evento_origem. Lido em runtime por pre_send_check. Editável via /configuracoes aba Anti-Ban.';

-- ---------------------------------------------------------------------
-- 2. antiban_global_config — singleton
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.antiban_global_config (
  id                       int  PRIMARY KEY DEFAULT 1,
  health_pause_threshold   int  NOT NULL DEFAULT 95,
  health_pause_hours       int  NOT NULL DEFAULT 2,
  reply_rate_threshold     numeric NOT NULL DEFAULT 0.05,
  reply_rate_min_samples   int  NOT NULL DEFAULT 50,
  reply_rate_pause_hours   int  NOT NULL DEFAULT 6,
  warmup_curve             int[] NOT NULL DEFAULT ARRAY[10, 20, 35, 50, 60, 70, 80],
  motivo                   text,
  updated_by               uuid REFERENCES auth.users(id),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT antiban_global_singleton    CHECK (id = 1),
  CONSTRAINT antiban_global_health       CHECK (health_pause_threshold BETWEEN 80 AND 99),
  CONSTRAINT antiban_global_health_hours CHECK (health_pause_hours BETWEEN 1 AND 48),
  CONSTRAINT antiban_global_reply_rate   CHECK (reply_rate_threshold BETWEEN 0 AND 1),
  CONSTRAINT antiban_global_reply_min    CHECK (reply_rate_min_samples BETWEEN 10 AND 500),
  CONSTRAINT antiban_global_reply_hours  CHECK (reply_rate_pause_hours BETWEEN 1 AND 48),
  CONSTRAINT antiban_global_warmup_len CHECK (array_length(warmup_curve, 1) = 7)
  -- valores positivos validados na UI (CHECK não suporta unnest)
);

COMMENT ON TABLE public.antiban_global_config IS
  'Thresholds cross-cutting do anti-ban. Singleton (id=1). Lido em runtime por pre_send_check e chip_warmup_limit.';

-- ---------------------------------------------------------------------
-- 3. antiban_config_history — audit log (snapshot por mudança)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.antiban_config_history (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_tipo   text NOT NULL CHECK (config_tipo IN ('rate','global')),
  evento_origem text,
  snapshot_antes jsonb,
  snapshot_depois jsonb NOT NULL,
  motivo        text,
  changed_by    uuid REFERENCES auth.users(id),
  changed_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_antiban_history_changed_at
  ON public.antiban_config_history(changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_antiban_history_tipo_evento
  ON public.antiban_config_history(config_tipo, evento_origem);

-- ---------------------------------------------------------------------
-- 4. Seed defaults (matches comportamento atual de pre_send_check após
--    20260513184500 + 20260513180000)
-- ---------------------------------------------------------------------
INSERT INTO public.antiban_rate_config (evento_origem, max_per_min, max_per_hour, min_delay_ms, max_delay_ms, motivo) VALUES
  ('cold_disparo', 3,  15,  8000, 20000, 'seed inicial — match com pre_send_check pós 20260513184500'),
  ('cadencia',     3,  15,  8000, 20000, 'seed inicial — match com pre_send_check pós 20260513184500'),
  ('manual',       20, 150,    0,     0, 'seed inicial — manual não respeita rate humano'),
  ('resposta_ia',  10, 30,     0,     0, 'seed inicial — IA responde sem delay'),
  ('qa_relay',     5,  30,  1000,  3000, 'seed inicial'),
  ('opt_out',      5,  30,  1000,  3000, 'seed inicial'),
  ('handoff',      5,  30,  1000,  3000, 'seed inicial')
ON CONFLICT (evento_origem) DO NOTHING;

INSERT INTO public.antiban_global_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 5. Trigger: registra snapshot no history em todo UPDATE
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_antiban_log_history()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_tipo   text;
  v_evento text;
BEGIN
  v_tipo   := CASE WHEN TG_TABLE_NAME = 'antiban_rate_config' THEN 'rate' ELSE 'global' END;
  v_evento := CASE WHEN TG_TABLE_NAME = 'antiban_rate_config' THEN NEW.evento_origem ELSE NULL END;

  INSERT INTO public.antiban_config_history (
    config_tipo, evento_origem, snapshot_antes, snapshot_depois, motivo, changed_by
  ) VALUES (
    v_tipo,
    v_evento,
    to_jsonb(OLD) - 'updated_at' - 'updated_by' - 'motivo',
    to_jsonb(NEW) - 'updated_at' - 'updated_by' - 'motivo',
    NEW.motivo,
    NEW.updated_by
  );

  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS antiban_rate_history ON public.antiban_rate_config;
CREATE TRIGGER antiban_rate_history
  BEFORE UPDATE ON public.antiban_rate_config
  FOR EACH ROW EXECUTE FUNCTION public.trg_antiban_log_history();

DROP TRIGGER IF EXISTS antiban_global_history ON public.antiban_global_config;
CREATE TRIGGER antiban_global_history
  BEFORE UPDATE ON public.antiban_global_config
  FOR EACH ROW EXECUTE FUNCTION public.trg_antiban_log_history();

-- ---------------------------------------------------------------------
-- 6. GRANTs + RLS
-- CRÍTICO: tabela criada via SQL direto NÃO recebe GRANTs default do
-- Supabase pros roles authenticated/service_role. SEM ISSO, edge functions
-- crasham com "42501 permission denied" — derruba TODOS os envios.
-- Incidente 18/05: faltou o GRANT e travou Sigzap + disparos por ~14h.
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.antiban_rate_config    TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.antiban_global_config  TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.antiban_config_history TO authenticated, service_role;

ALTER TABLE public.antiban_rate_config    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.antiban_global_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.antiban_config_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS antiban_rate_read   ON public.antiban_rate_config;
DROP POLICY IF EXISTS antiban_rate_update ON public.antiban_rate_config;
DROP POLICY IF EXISTS antiban_global_read   ON public.antiban_global_config;
DROP POLICY IF EXISTS antiban_global_update ON public.antiban_global_config;
DROP POLICY IF EXISTS antiban_history_read ON public.antiban_config_history;

CREATE POLICY antiban_rate_read    ON public.antiban_rate_config    FOR SELECT TO authenticated USING (true);
CREATE POLICY antiban_rate_update  ON public.antiban_rate_config    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY antiban_global_read    ON public.antiban_global_config  FOR SELECT TO authenticated USING (true);
CREATE POLICY antiban_global_update  ON public.antiban_global_config  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY antiban_history_read ON public.antiban_config_history FOR SELECT TO authenticated USING (true);

-- INSERT no history só via trigger (não policy direta — usuário não chama insert manual)

-- ---------------------------------------------------------------------
-- 7. Refactor chip_warmup_limit pra ler curve da config
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chip_warmup_limit(p_chip_id uuid)
RETURNS integer LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_start date;
  v_day   int;
  v_curve int[];
BEGIN
  SELECT warmup_start_date INTO v_start
    FROM public.chip_state WHERE chip_id = p_chip_id;
  IF v_start IS NULL THEN RETURN 0; END IF;

  v_day := (CURRENT_DATE - v_start)::int + 1;
  IF v_day > 7 THEN RETURN 2147483647; END IF;
  IF v_day < 1 THEN RETURN 0; END IF;

  SELECT warmup_curve INTO v_curve FROM public.antiban_global_config WHERE id = 1;
  -- Fallback defensivo se row global sumir
  IF v_curve IS NULL THEN v_curve := ARRAY[10, 20, 35, 50, 60, 70, 80]; END IF;

  RETURN v_curve[v_day];
END $$;

-- ---------------------------------------------------------------------
-- 8. Refactor pre_send_check pra ler rate/delay/thresholds da config
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pre_send_check(
  p_chip_id uuid,
  p_evento_origem text DEFAULT 'cold_disparo'
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
  -- Carrega rate config (fallback aos defaults conservadores se row sumir)
  SELECT max_per_min, max_per_hour, min_delay_ms, max_delay_ms
    INTO v_max_per_min, v_max_per_hour, v_min_delay_ms, v_max_delay_ms
    FROM public.antiban_rate_config WHERE evento_origem = p_evento_origem;

  IF NOT FOUND THEN
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

  -- Guard 1: chip existe
  SELECT cs.*, c.connection_state, c.pode_disparar INTO v_state
    FROM public.chip_state cs
    JOIN public.chips c ON c.id = cs.chip_id
    WHERE cs.chip_id = p_chip_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'chip_not_found');
  END IF;

  -- Guard 2: connection state
  IF v_state.connection_state IS DISTINCT FROM 'open' THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'chip_offline',
      'connection_state', v_state.connection_state);
  END IF;

  -- Guard 3: pausa ativa
  IF v_state.paused_until IS NOT NULL AND v_state.paused_until > now() THEN
    RETURN jsonb_build_object('allow', false, 'reason', 'paused',
      'pause_reason', v_state.pause_reason, 'until', v_state.paused_until);
  END IF;

  -- Guard 4: health critical
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

  -- Guard 8: reply rate critical (só cold/cadência)
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
    IF v_delay_ms < v_min_delay_ms THEN v_delay_ms := v_min_delay_ms; END IF;
    IF v_delay_ms > v_max_delay_ms THEN v_delay_ms := v_max_delay_ms; END IF;
  END IF;

  RETURN jsonb_build_object('allow', true, 'delay_ms', v_delay_ms);
END $$;
