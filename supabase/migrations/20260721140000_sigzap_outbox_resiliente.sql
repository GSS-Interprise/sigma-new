-- Caixa de saida resiliente do SigZap.
-- A mensagem existe antes da chamada externa; queda da Evolution nao apaga o texto.
CREATE TABLE IF NOT EXISTS public.sigzap_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_message_id uuid NOT NULL UNIQUE,
  conversation_id uuid NOT NULL REFERENCES public.sigzap_conversations(id) ON DELETE CASCADE,
  chip_id uuid NOT NULL REFERENCES public.chips(id),
  instance_name text NOT NULL,
  contact_jid text NOT NULL,
  message_text text,
  message_type text NOT NULL DEFAULT 'text',
  media_url text,
  media_mime_type text,
  media_caption text,
  media_filename text,
  quoted_message_id text,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 6,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  last_error_code text,
  last_error_detail text,
  wa_message_id text,
  sigzap_message_id uuid REFERENCES public.sigzap_messages(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_sigzap_outbox_worker
  ON public.sigzap_outbox (status, next_retry_at)
  WHERE status IN ('queued', 'processing');
CREATE INDEX IF NOT EXISTS idx_sigzap_outbox_conversation
  ON public.sigzap_outbox (conversation_id, created_at DESC);

ALTER TABLE public.sigzap_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read sigzap outbox"
  ON public.sigzap_outbox FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create sigzap outbox"
  ON public.sigzap_outbox FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

GRANT SELECT, INSERT ON public.sigzap_outbox TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sigzap_outbox TO service_role;

ALTER TABLE public.sigzap_messages
  ADD COLUMN IF NOT EXISTS client_message_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sigzap_messages_client_message_id
  ON public.sigzap_messages (client_message_id)
  WHERE client_message_id IS NOT NULL;

-- Claim atomico evita dois workers enviarem a mesma mensagem.
CREATE OR REPLACE FUNCTION public.claim_sigzap_outbox_batch(p_limit integer DEFAULT 20)
RETURNS SETOF public.sigzap_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM public.sigzap_outbox
    WHERE (
        (status = 'queued' AND next_retry_at <= now())
        OR (status = 'processing' AND updated_at < now() - interval '5 minutes')
      )
      AND attempts < max_attempts
    ORDER BY next_retry_at, created_at
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, least(p_limit, 100))
  )
  UPDATE public.sigzap_outbox o
  SET status = 'processing', attempts = attempts + 1, updated_at = now()
  FROM picked
  WHERE o.id = picked.id
  RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_sigzap_outbox_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sigzap_outbox_batch(integer) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'sigzap_outbox'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sigzap_outbox;
  END IF;
END $$;

SELECT cron.schedule(
  'sigzap-outbox-worker-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.functions.supabase.co/sigzap-outbox-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{"limit":20}'::jsonb
  );
  $$
);
