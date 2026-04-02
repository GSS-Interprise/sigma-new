-- Adicionar gestor_financeiro e outros roles às policies de contrato_anexos
DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can view contrato_anexos"
ON public.contrato_anexos FOR SELECT
USING (
  is_admin(auth.uid()) OR
  has_role(auth.uid(), 'gestor_contratos') OR
  has_role(auth.uid(), 'gestor_captacao') OR
  has_role(auth.uid(), 'gestor_financeiro') OR
  has_role(auth.uid(), 'diretoria') OR
  has_role(auth.uid(), 'lideres') OR
  has_role(auth.uid(), 'coordenador_escalas') OR
  is_captacao_leader(auth.uid())
);

-- Também adicionar storage policy para contratos-documentos para gestor_financeiro
-- (o bucket contratos-documentos já tem policy via storage.objects)
