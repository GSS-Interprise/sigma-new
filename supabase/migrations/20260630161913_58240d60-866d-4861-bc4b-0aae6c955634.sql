
DROP POLICY IF EXISTS "Authorized users can delete editais PDFs" ON storage.objects;
CREATE POLICY "Authorized users can delete editais PDFs" ON storage.objects FOR DELETE USING (
  bucket_id = 'editais-pdfs' AND (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'gestor_contratos'::app_role)
    OR has_role(auth.uid(), 'lider_licitacao'::app_role)
    OR has_role(auth.uid(), 'licitador'::app_role)
    OR has_role(auth.uid(), 'lideres'::app_role)
  )
);

DROP POLICY IF EXISTS "Authorized users can update editais PDFs" ON storage.objects;
CREATE POLICY "Authorized users can update editais PDFs" ON storage.objects FOR UPDATE USING (
  bucket_id = 'editais-pdfs' AND (
    is_admin(auth.uid())
    OR has_role(auth.uid(), 'gestor_contratos'::app_role)
    OR has_role(auth.uid(), 'lider_licitacao'::app_role)
    OR has_role(auth.uid(), 'licitador'::app_role)
    OR has_role(auth.uid(), 'lideres'::app_role)
  )
);
