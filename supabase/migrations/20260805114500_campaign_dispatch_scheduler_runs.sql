-- Histórico curto do scheduler para diagnóstico operacional sem depender dos
-- logs internos da plataforma.
CREATE TABLE IF NOT EXISTS public.campanha_dispatch_scheduler_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'partial_failure', 'failed')),
  campaigns_seen integer NOT NULL DEFAULT 0,
  campaigns_triggered integer NOT NULL DEFAULT 0,
  sent integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  error_message text,
  details jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS campanha_dispatch_scheduler_runs_started_idx
  ON public.campanha_dispatch_scheduler_runs (started_at DESC);

ALTER TABLE public.campanha_dispatch_scheduler_runs ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.campanha_dispatch_scheduler_runs TO authenticated, service_role;

DROP POLICY IF EXISTS campanha_dispatch_scheduler_runs_read ON public.campanha_dispatch_scheduler_runs;
CREATE POLICY campanha_dispatch_scheduler_runs_read
  ON public.campanha_dispatch_scheduler_runs
  FOR SELECT TO authenticated
  USING (true);

COMMENT ON TABLE public.campanha_dispatch_scheduler_runs IS
  'Heartbeat e resultado do scheduler de campanhas; usado para diagnóstico e status operacional.';
