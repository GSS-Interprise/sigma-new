-- Identidade canônica de telefone para que toda conversa, em qualquer chip,
-- seja vinculada ao mesmo médico sem depender de associação manual.

CREATE OR REPLACE FUNCTION public.phone_identity_key(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  v_digits text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF v_digits = '' THEN
    RETURN NULL;
  END IF;

  -- Remove o DDI brasileiro quando presente e ignora prefixos acidentais.
  IF length(v_digits) >= 12 AND right(left(v_digits, length(v_digits) - 10), 2) = '55' THEN
    v_digits := right(v_digits, length(v_digits) - 2);
  ELSIF v_digits LIKE '55%' AND length(v_digits) IN (12, 13) THEN
    v_digits := substring(v_digits FROM 3);
  END IF;

  IF length(v_digits) > 11 THEN
    v_digits := right(v_digits, 11);
  END IF;

  -- WhatsApp pode entregar o mesmo celular brasileiro com ou sem o nono dígito.
  IF length(v_digits) = 11 AND substring(v_digits FROM 3 FOR 1) = '9' THEN
    v_digits := substring(v_digits FROM 1 FOR 2) || substring(v_digits FROM 4);
  END IF;

  IF length(v_digits) < 10 THEN
    RETURN NULL;
  END IF;

  RETURN right(v_digits, 10);
END;
$$;

CREATE TABLE IF NOT EXISTS public.lead_phone_identities (
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  phone_key text NOT NULL,
  source text NOT NULL CHECK (source IN ('principal', 'adicional', 'whatsapp')),
  original_phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lead_id, phone_key)
);

CREATE INDEX IF NOT EXISTS idx_lead_phone_identities_key
  ON public.lead_phone_identities(phone_key);

ALTER TABLE public.lead_phone_identities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lead_phone_identities FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_phone_identities TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_lead_phone_identities(p_lead_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.lead_phone_identities WHERE lead_id = p_lead_id;

  INSERT INTO public.lead_phone_identities(lead_id, phone_key, source, original_phone)
  SELECT DISTINCT ON (public.phone_identity_key(phone))
    l.id,
    public.phone_identity_key(phone),
    source,
    phone
  FROM public.leads l
  CROSS JOIN LATERAL (
    SELECT l.phone_e164 AS phone, 'principal'::text AS source, 1 AS priority
    UNION ALL
    SELECT value, 'adicional', 2
    FROM unnest(coalesce(l.telefones_adicionais, '{}'::text[])) value
    UNION ALL
    SELECT value, 'whatsapp', 3
    FROM unnest(coalesce(l.whatsapp_phones, '{}'::text[])) value
  ) phones
  WHERE l.id = p_lead_id
    AND public.phone_identity_key(phone) IS NOT NULL
  ORDER BY public.phone_identity_key(phone), priority;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_refresh_lead_phone_identities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_lead_phone_identities(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_phone_identities ON public.leads;
CREATE TRIGGER trg_leads_phone_identities
AFTER INSERT OR UPDATE OF phone_e164, telefones_adicionais, whatsapp_phones
ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.trg_refresh_lead_phone_identities();

-- Só resolve quando a chave pertence a exatamente um médico. Telefones
-- compartilhados ou duplicados permanecem órfãos para revisão humana.
CREATE OR REPLACE FUNCTION public.resolve_unique_lead_by_phone(p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (array_agg(DISTINCT lead_id))[1]
  FROM public.lead_phone_identities
  WHERE phone_key = public.phone_identity_key(p_phone)
  HAVING count(DISTINCT lead_id) = 1;
$$;

CREATE OR REPLACE FUNCTION public.trg_link_sigzap_conversation_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT contact_phone INTO v_phone
  FROM public.sigzap_contacts
  WHERE id = NEW.contact_id;

  NEW.lead_id := public.resolve_unique_lead_by_phone(v_phone);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_sigzap_conversation_lead
  ON public.sigzap_conversations;
CREATE TRIGGER trg_link_sigzap_conversation_lead
BEFORE INSERT OR UPDATE OF contact_id, lead_id
ON public.sigzap_conversations
FOR EACH ROW
EXECUTE FUNCTION public.trg_link_sigzap_conversation_lead();

CREATE OR REPLACE FUNCTION public.trg_relink_sigzap_contact_conversations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_id uuid;
BEGIN
  IF NEW.contact_phone IS NOT DISTINCT FROM OLD.contact_phone THEN
    RETURN NEW;
  END IF;

  v_lead_id := public.resolve_unique_lead_by_phone(NEW.contact_phone);
  IF v_lead_id IS NOT NULL THEN
    UPDATE public.sigzap_conversations
    SET lead_id = v_lead_id,
        updated_at = now()
    WHERE contact_id = NEW.id
      AND lead_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_relink_sigzap_contact_conversations
  ON public.sigzap_contacts;
CREATE TRIGGER trg_relink_sigzap_contact_conversations
AFTER UPDATE OF contact_phone
ON public.sigzap_contacts
FOR EACH ROW
EXECUTE FUNCTION public.trg_relink_sigzap_contact_conversations();

CREATE OR REPLACE FUNCTION public.link_orphan_sigzap_conversations(p_limit integer DEFAULT 5000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked integer := 0;
  v_remaining integer := 0;
BEGIN
  WITH candidates AS (
    SELECT conv.id, public.resolve_unique_lead_by_phone(contact.contact_phone) AS lead_id
    FROM public.sigzap_conversations conv
    JOIN public.sigzap_contacts contact ON contact.id = conv.contact_id
    WHERE conv.lead_id IS NULL
    ORDER BY conv.last_message_at DESC NULLS LAST
    LIMIT greatest(1, least(coalesce(p_limit, 5000), 20000))
  )
  UPDATE public.sigzap_conversations conv
  SET lead_id = candidates.lead_id,
      updated_at = now()
  FROM candidates
  WHERE conv.id = candidates.id
    AND candidates.lead_id IS NOT NULL;

  GET DIAGNOSTICS v_linked = ROW_COUNT;
  SELECT count(*) INTO v_remaining
  FROM public.sigzap_conversations
  WHERE lead_id IS NULL;

  RETURN jsonb_build_object('linked', v_linked, 'remaining', v_remaining);
END;
$$;

CREATE OR REPLACE VIEW public.vw_sigzap_identity_audit AS
SELECT
  count(*) FILTER (WHERE conv.lead_id IS NOT NULL) AS linked_conversations,
  count(*) FILTER (WHERE conv.lead_id IS NULL) AS orphan_conversations,
  count(*) FILTER (
    WHERE conv.lead_id IS NULL
      AND public.resolve_unique_lead_by_phone(contact.contact_phone) IS NOT NULL
  ) AS linkable_conversations,
  count(*) FILTER (
    WHERE conv.lead_id IS NULL
      AND public.resolve_unique_lead_by_phone(contact.contact_phone) IS NULL
  ) AS unresolved_conversations
FROM public.sigzap_conversations conv
JOIN public.sigzap_contacts contact ON contact.id = conv.contact_id;

REVOKE ALL ON FUNCTION public.refresh_lead_phone_identities(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_unique_lead_by_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.link_orphan_sigzap_conversations(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_lead_phone_identities(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_unique_lead_by_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.link_orphan_sigzap_conversations(integer) TO service_role;
GRANT SELECT ON public.vw_sigzap_identity_audit TO authenticated, service_role;

-- Backfill inicial das identidades. O DISTINCT evita duplicar telefones
-- repetidos entre principal/adicionais/WhatsApp.
INSERT INTO public.lead_phone_identities(lead_id, phone_key, source, original_phone)
SELECT DISTINCT ON (l.id, public.phone_identity_key(phone))
  l.id,
  public.phone_identity_key(phone),
  source,
  phone
FROM public.leads l
CROSS JOIN LATERAL (
  SELECT l.phone_e164 AS phone, 'principal'::text AS source, 1 AS priority
  UNION ALL
  SELECT value, 'adicional', 2
  FROM unnest(coalesce(l.telefones_adicionais, '{}'::text[])) value
  UNION ALL
  SELECT value, 'whatsapp', 3
  FROM unnest(coalesce(l.whatsapp_phones, '{}'::text[])) value
) phones
WHERE public.phone_identity_key(phone) IS NOT NULL
ORDER BY l.id, public.phone_identity_key(phone), priority
ON CONFLICT (lead_id, phone_key) DO UPDATE
SET source = EXCLUDED.source,
    original_phone = EXCLUDED.original_phone,
    updated_at = now();

-- Garante cobertura inclusive para instâncias que já estavam abertas antes
-- da criação do trigger de reconexão.
INSERT INTO public.sigzap_history_sync_jobs(instance_id, cursor_page, status, next_run_at)
SELECT i.id, 1, 'catchup', now()
FROM public.sigzap_instances i
JOIN public.chips c ON c.id = i.chip_id
WHERE c.status = 'ativo'
ON CONFLICT (instance_id) DO NOTHING;

SELECT public.link_orphan_sigzap_conversations(20000);

COMMENT ON TABLE public.lead_phone_identities IS
  'Índice canônico dos telefones do médico usado para unificar conversas entre chips.';
COMMENT ON VIEW public.vw_sigzap_identity_audit IS
  'Cobertura do vínculo conversa SigZap → médico e backlog ainda não resolvido.';
