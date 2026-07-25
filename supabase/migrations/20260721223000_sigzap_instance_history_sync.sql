CREATE TABLE IF NOT EXISTS public.sigzap_history_sync_jobs (
  instance_id uuid PRIMARY KEY REFERENCES public.sigzap_instances(id) ON DELETE CASCADE,
  cursor_page integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'catchup' CHECK (status IN ('catchup', 'live', 'error')),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  last_run_at timestamptz,
  last_completed_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sigzap_history_sync_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sigzap_history_sync_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sigzap_history_sync_jobs TO service_role;

CREATE OR REPLACE FUNCTION public.reset_sigzap_history_sync_on_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_instance_id uuid;
BEGIN
  IF NEW.connection_state = 'open' AND OLD.connection_state IS DISTINCT FROM NEW.connection_state THEN
    SELECT id INTO v_instance_id FROM public.sigzap_instances WHERE name = NEW.instance_name;
    IF v_instance_id IS NOT NULL THEN
      INSERT INTO public.sigzap_history_sync_jobs(instance_id, cursor_page, status, next_run_at)
      VALUES (v_instance_id, 1, 'catchup', now())
      ON CONFLICT (instance_id) DO UPDATE SET cursor_page=1, status='catchup',
        next_run_at=now(), last_error=null, updated_at=now();
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_reset_sigzap_history_sync_on_open ON public.chips;
CREATE TRIGGER trg_reset_sigzap_history_sync_on_open
AFTER UPDATE OF connection_state ON public.chips
FOR EACH ROW EXECUTE FUNCTION public.reset_sigzap_history_sync_on_open();

INSERT INTO public.sigzap_history_sync_jobs(instance_id)
SELECT i.id FROM public.sigzap_instances i JOIN public.chips c ON c.id=i.chip_id
WHERE c.status='ativo' ON CONFLICT (instance_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_sigzap_history_sync_job()
RETURNS TABLE(instance_id uuid, instance_name text, cursor_page integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT j.instance_id FROM public.sigzap_history_sync_jobs j
    JOIN public.sigzap_instances i ON i.id=j.instance_id
    JOIN public.chips c ON c.id=i.chip_id
    WHERE j.next_run_at<=now() AND c.connection_state='open' AND c.status='ativo'
    ORDER BY CASE WHEN j.status='catchup' THEN 0 ELSE 1 END, j.next_run_at
    FOR UPDATE OF j SKIP LOCKED LIMIT 1
  )
  UPDATE public.sigzap_history_sync_jobs j SET next_run_at=now()+interval '2 minutes',
    last_run_at=now(), updated_at=now()
  FROM picked, public.sigzap_instances i
  WHERE j.instance_id=picked.instance_id AND i.id=j.instance_id
  RETURNING j.instance_id,i.name,j.cursor_page;
END $$;

REVOKE ALL ON FUNCTION public.claim_sigzap_history_sync_job() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sigzap_history_sync_job() TO service_role;

CREATE OR REPLACE FUNCTION public.import_sigzap_history_rows(
  p_instance_id uuid,p_instance_name text,p_rows jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r jsonb; v_contact uuid; v_conversation uuid; v_imported integer:=0;
BEGIN
  FOR r IN SELECT value FROM jsonb_array_elements(COALESCE(p_rows,'[]'::jsonb)) LOOP
    INSERT INTO public.sigzap_contacts(instance_id,contact_jid,contact_phone,contact_name,updated_at)
    VALUES(p_instance_id,r->>'contact_jid',r->>'contact_phone',nullif(r->>'contact_name',''),now())
    ON CONFLICT(contact_jid,instance_id) DO UPDATE SET contact_phone=EXCLUDED.contact_phone,
      contact_name=COALESCE(EXCLUDED.contact_name,sigzap_contacts.contact_name),updated_at=now()
    RETURNING id INTO v_contact;

    INSERT INTO public.sigzap_conversations(instance_id,contact_id,status)
    VALUES(p_instance_id,v_contact,'open') ON CONFLICT(contact_id,instance_id)
    DO UPDATE SET updated_at=now() RETURNING id INTO v_conversation;

    IF NOT EXISTS(SELECT 1 FROM public.sigzap_messages WHERE conversation_id=v_conversation AND wa_message_id=r->>'wa_message_id') THEN
      INSERT INTO public.sigzap_messages(conversation_id,wa_message_id,from_me,sender_jid,message_text,
        message_type,message_status,raw_payload,media_url,media_mime_type,media_caption,media_filename,sent_at,sent_via_instance_name)
      VALUES(v_conversation,r->>'wa_message_id',(r->>'from_me')::boolean,
        CASE WHEN (r->>'from_me')::boolean THEN null ELSE r->>'contact_jid' END,
        r->>'message_text',COALESCE(r->>'message_type','text'),COALESCE(r->>'message_status','sent'),
        r->'raw_payload',r->>'media_url',r->>'media_mime_type',r->>'media_caption',r->>'media_filename',
        (r->>'sent_at')::timestamptz,p_instance_name);
      v_imported:=v_imported+1;
    END IF;

    UPDATE public.sigzap_conversations SET
      last_message_text=COALESCE(r->>'message_text','['||COALESCE(r->>'message_type','mensagem')||']'),
      last_message_at=(r->>'sent_at')::timestamptz,updated_at=now()
    WHERE id=v_conversation AND(last_message_at IS NULL OR last_message_at<=(r->>'sent_at')::timestamptz);
  END LOOP;
  RETURN v_imported;
END $$;

REVOKE ALL ON FUNCTION public.import_sigzap_history_rows(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.import_sigzap_history_rows(uuid,text,jsonb) TO service_role;

SELECT cron.schedule('sigzap-history-sync-every-minute','* * * * *',$cron$
SELECT net.http_post(
  url:='https://zupsbgtoeoixfokzkjro.functions.supabase.co/sigzap-history-sync-worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='sigzap_outbox_worker_service_role' LIMIT 1)),
  body:='{}'::jsonb
) FROM generate_series(1,10);$cron$);
