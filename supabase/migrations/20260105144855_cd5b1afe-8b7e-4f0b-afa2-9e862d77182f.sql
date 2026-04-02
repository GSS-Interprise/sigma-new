-- Drop existing restrictive SELECT policies and recreate with diretoria access

-- 1. contratos-documentos - Add diretoria to SELECT
DROP POLICY IF EXISTS "Authorized users can view contract documents" ON storage.objects;
CREATE POLICY "Authorized users can view contract documents" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'contratos-documentos' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role) OR
    has_role(auth.uid(), 'gestor_financeiro'::app_role) OR
    has_role(auth.uid(), 'coordenador_escalas'::app_role)
  )
);

-- 2. medicos-documentos - Create SELECT policy with diretoria
DROP POLICY IF EXISTS "Authorized users can view medicos documents" ON storage.objects;
CREATE POLICY "Authorized users can view medicos documents" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'medicos-documentos' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role) OR
    has_role(auth.uid(), 'coordenador_escalas'::app_role)
  )
);

-- 3. editais-pdfs - Add diretoria to SELECT
DROP POLICY IF EXISTS "Authenticated users can view editais PDFs" ON storage.objects;
CREATE POLICY "Authenticated users can view editais PDFs" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'editais-pdfs' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- 4. suporte-anexos - Create SELECT policy with diretoria and support roles
DROP POLICY IF EXISTS "Users can view support attachments" ON storage.objects;
CREATE POLICY "Users can view support attachments" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'suporte-anexos' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role) OR
    auth.uid() IS NOT NULL
  )
);

-- 5. campanhas-pecas - Add diretoria access
DROP POLICY IF EXISTS "Authorized users can view campanhas pecas" ON storage.objects;
CREATE POLICY "Authorized users can view campanhas pecas" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'campanhas-pecas' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- 6. eventos-materiais - Add diretoria access
DROP POLICY IF EXISTS "Authorized users can view eventos materiais" ON storage.objects;
CREATE POLICY "Authorized users can view eventos materiais" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'eventos-materiais' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- 7. materiais-biblioteca - Add diretoria access
DROP POLICY IF EXISTS "Authorized users can view materiais biblioteca" ON storage.objects;
CREATE POLICY "Authorized users can view materiais biblioteca" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'materiais-biblioteca' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);