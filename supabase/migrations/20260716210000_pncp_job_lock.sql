-- Lease lock: impede execuções sobrepostas do mirror-sync (cron 3min vs edge 110s).
-- Padrão robusto com connection pooling (não usa advisory lock de sessão).
CREATE TABLE IF NOT EXISTS public.pncp_job_lock (
  job           text PRIMARY KEY,
  holder        text,
  locked_until  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.pncp_job_lock (job, locked_until)
  VALUES ('mirror-sync', now() - interval '1 hour') ON CONFLICT DO NOTHING;

-- Adquire o lock por p_secs; retorna true só se conseguiu (lock livre/expirado).
CREATE OR REPLACE FUNCTION public.pncp_acquire_lock(p_job text, p_secs int)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH upd AS (
    UPDATE public.pncp_job_lock
      SET holder = gen_random_uuid()::text, locked_until = now() + (p_secs || ' seconds')::interval
      WHERE job = p_job AND locked_until < now()
      RETURNING 1)
  SELECT EXISTS(SELECT 1 FROM upd);
$$;
GRANT EXECUTE ON FUNCTION public.pncp_acquire_lock(text,int) TO authenticated, service_role;
