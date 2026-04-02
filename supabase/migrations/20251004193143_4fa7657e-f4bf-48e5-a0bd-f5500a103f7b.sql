-- Criar bucket para documentos de contratos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'contratos-documentos',
  'contratos-documentos',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
);

-- Políticas RLS para o bucket de contratos
-- Usuários autorizados podem fazer upload
CREATE POLICY "Authorized users can upload contract documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'contratos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
);

-- Usuários autorizados podem visualizar documentos
CREATE POLICY "Authorized users can view contract documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contratos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
);

-- Usuários autorizados podem atualizar documentos
CREATE POLICY "Authorized users can update contract documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'contratos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
);

-- Usuários autorizados podem deletar documentos
CREATE POLICY "Authorized users can delete contract documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'contratos-documentos' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
);

-- Adicionar coluna documento_url na tabela contratos
ALTER TABLE contratos ADD COLUMN documento_url text;