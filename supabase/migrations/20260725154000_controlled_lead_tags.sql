CREATE TABLE IF NOT EXISTS public.lead_tag_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  slug text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'slate',
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 100,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(label)) BETWEEN 2 AND 60),
  CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

ALTER TABLE public.lead_tag_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view lead tags" ON public.lead_tag_catalog;
CREATE POLICY "Authenticated can view lead tags"
  ON public.lead_tag_catalog
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins can manage lead tags" ON public.lead_tag_catalog;
CREATE POLICY "Admins can manage lead tags"
  ON public.lead_tag_catalog
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON public.lead_tag_catalog TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lead_tag_catalog TO authenticated;
GRANT ALL ON public.lead_tag_catalog TO service_role;

INSERT INTO public.lead_tag_catalog(label, slug, sort_order)
VALUES
  ('Prioridade', 'prioridade', 10),
  ('Retornar', 'retornar', 20),
  ('Sem interesse', 'sem-interesse', 30),
  ('Já é cliente', 'ja-e-cliente', 40),
  ('Indicação', 'indicacao', 50),
  ('Aguardando doc', 'aguardando-doc', 60)
ON CONFLICT (slug) DO UPDATE SET active = true;

-- Tags legadas continuam disponíveis, mas novas variações passam pelo catálogo.
WITH normalized_tags AS (
  SELECT DISTINCT
    btrim(tag) AS label,
    trim(both '-' from regexp_replace(
    translate(lower(btrim(tag)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
    '[^a-z0-9]+', '-', 'g'
    )) AS slug
  FROM public.leads l
  CROSS JOIN LATERAL unnest(coalesce(l.tags, '{}'::text[])) tag
  WHERE length(btrim(tag)) BETWEEN 2 AND 60
)
INSERT INTO public.lead_tag_catalog(label, slug, sort_order)
SELECT label, slug,
  500
FROM normalized_tags
WHERE nullif(slug, '') IS NOT NULL
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_lead_controlled_tags(
  p_lead_id uuid,
  p_tags text[]
) RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text[];
  v_invalid text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT coalesce(array_agg(DISTINCT btrim(value) ORDER BY btrim(value)), '{}'::text[])
  INTO v_clean
  FROM unnest(coalesce(p_tags, '{}'::text[])) value
  WHERE nullif(btrim(value), '') IS NOT NULL;

  SELECT coalesce(array_agg(value ORDER BY value), '{}'::text[])
  INTO v_invalid
  FROM unnest(v_clean) value
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.lead_tag_catalog catalog
    WHERE catalog.active
      AND lower(catalog.label) = lower(value)
  );

  IF cardinality(v_invalid) > 0 THEN
    RAISE EXCEPTION 'tag_not_in_catalog:%', array_to_string(v_invalid, ',');
  END IF;

  UPDATE public.leads
  SET tags = v_clean, updated_at = now()
  WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'lead_not_found';
  END IF;
  RETURN v_clean;
END;
$$;

REVOKE ALL ON FUNCTION public.set_lead_controlled_tags(uuid, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_lead_controlled_tags(uuid, text[])
  TO authenticated, service_role;

COMMENT ON TABLE public.lead_tag_catalog IS
  'Vocabulário controlado para impedir tags equivalentes e divergentes no atendimento.';
