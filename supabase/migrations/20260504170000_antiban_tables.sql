-- =====================================================================
-- Plano Aquecimento + Anti-Ban v1 — Sprint 1
-- Tabelas, índices e view de saúde
-- Doc: .claude/plano-aquecimento-anti-ban-v1.md §4.1
-- =====================================================================

-- ---------------------------------------------------------------------
-- chip_state — fase, warm-up, health, pause por chip
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chip_state (
  chip_id uuid PRIMARY KEY REFERENCES public.chips(id) ON DELETE CASCADE,
  fase text NOT NULL DEFAULT 'novo'
    CHECK (fase IN ('novo', 'setup', 'aquecimento', 'pronto', 'producao', 'pausado', 'queimado')),
  fase_inicio_at timestamptz NOT NULL DEFAULT now(),
  warmup_start_date date,
  warmup_target_days int NOT NULL DEFAULT 7,
  health_score int NOT NULL DEFAULT 0 CHECK (health_score BETWEEN 0 AND 100),
  paused_until timestamptz,
  pause_reason text,
  last_send_at timestamptz,
  last_receive_at timestamptz,
  total_disparos_lifetime bigint NOT NULL DEFAULT 0,
  total_falhas_lifetime bigint NOT NULL DEFAULT 0,
  reply_rate_24h numeric(5,4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chip_state_fase ON public.chip_state(fase);
CREATE INDEX IF NOT EXISTS idx_chip_state_paused_until ON public.chip_state(paused_until)
  WHERE paused_until IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_chip_state_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS chip_state_updated_at ON public.chip_state;
CREATE TRIGGER chip_state_updated_at
  BEFORE UPDATE ON public.chip_state
  FOR EACH ROW EXECUTE FUNCTION public.trg_chip_state_updated_at();


-- ---------------------------------------------------------------------
-- chip_send_log — log de TODOS os envios outbound
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chip_send_log (
  id bigserial PRIMARY KEY,
  chip_id uuid NOT NULL REFERENCES public.chips(id) ON DELETE CASCADE,
  to_jid text NOT NULL,
  conteudo_tipo text NOT NULL
    CHECK (conteudo_tipo IN ('text', 'audio', 'image', 'sticker', 'reaction', 'status', 'forward')),
  conteudo_hash text NOT NULL,
  conteudo_size int,
  evento_origem text NOT NULL
    CHECK (evento_origem IN ('aquecimento', 'cold_disparo', 'cadencia', 'resposta_ia', 'manual', 'qa_relay', 'opt_out', 'handoff', 'healthcheck')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed', 'blocked', 'rate_limited')),
  evolution_response jsonb,
  evolution_error text,
  error_code int,
  delay_aplicado_ms int,
  pre_send_check_result jsonb
);

CREATE INDEX IF NOT EXISTS idx_chip_send_log_chip_sent ON public.chip_send_log(chip_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_chip_send_log_origem ON public.chip_send_log(evento_origem, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_chip_send_log_to_jid ON public.chip_send_log(to_jid, sent_at DESC);


-- ---------------------------------------------------------------------
-- chip_receive_log — log de mensagens recebidas
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chip_receive_log (
  id bigserial PRIMARY KEY,
  chip_id uuid NOT NULL REFERENCES public.chips(id) ON DELETE CASCADE,
  from_jid text NOT NULL,
  conteudo_tipo text NOT NULL,
  conteudo_hash text,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  origem text
    CHECK (origem IN ('aquecedor_par', 'isca_externa', 'fora', 'opt_out', 'lead_campanha', 'desconhecido')),
  is_resposta_a_disparo bool DEFAULT false,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS idx_chip_receive_log_chip_data ON public.chip_receive_log(chip_id, recebido_em DESC);


-- ---------------------------------------------------------------------
-- chip_health_event — sinais de degradação (disconnects, 401, bad_mac, etc)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chip_health_event (
  id bigserial PRIMARY KEY,
  chip_id uuid NOT NULL REFERENCES public.chips(id) ON DELETE CASCADE,
  tipo text NOT NULL
    CHECK (tipo IN ('disconnect_401', 'disconnect_408', 'disconnect_428', 'disconnect_429',
                    'disconnect_440', 'disconnect_500', 'disconnect_503', 'disconnect_515',
                    'disconnect_other', 'http_403', 'http_429', 'bad_mac', '463_timelock',
                    'failed_send', 'block_report', 'reply_rate_drop', 'qrcode_expired',
                    'manual_alert')),
  detalhe jsonb,
  score_delta int NOT NULL DEFAULT 0,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chip_health_event_chip_data ON public.chip_health_event(chip_id, occurred_at DESC);


-- ---------------------------------------------------------------------
-- vw_chip_health — view consolidada de saúde por chip
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.vw_chip_health AS
SELECT
  c.id AS chip_id,
  c.nome,
  c.numero,
  c.instance_name,
  c.connection_state,
  cs.fase,
  cs.health_score,
  cs.warmup_start_date,
  CASE
    WHEN cs.warmup_start_date IS NULL THEN NULL
    ELSE LEAST(cs.warmup_target_days, GREATEST(0, (CURRENT_DATE - cs.warmup_start_date)::int))
  END AS warmup_day,
  cs.paused_until,
  cs.last_send_at,
  cs.last_receive_at,
  cs.reply_rate_24h,
  (SELECT COUNT(*) FROM public.chip_send_log
    WHERE chip_id = c.id AND sent_at > now() - INTERVAL '24 hours' AND status IN ('sent','delivered','read')) AS sent_24h,
  (SELECT COUNT(*) FROM public.chip_send_log
    WHERE chip_id = c.id AND sent_at > now() - INTERVAL '24 hours' AND status = 'failed') AS failed_24h,
  (SELECT COUNT(*) FROM public.chip_health_event
    WHERE chip_id = c.id AND occurred_at > now() - INTERVAL '24 hours') AS health_events_24h
FROM public.chips c
LEFT JOIN public.chip_state cs ON cs.chip_id = c.id;
