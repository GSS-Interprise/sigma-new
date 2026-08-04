-- Operadoras podem criar uma tag contextual diretamente no card do lead.
-- A administração do catálogo (edição, desativação e exclusão) continua restrita.
DROP POLICY IF EXISTS "Authenticated can create lead tags" ON public.lead_tag_catalog;
CREATE POLICY "Authenticated can create lead tags"
  ON public.lead_tag_catalog
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

