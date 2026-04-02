-- 1. Atualizar política da tabela ages_profissionais para incluir gestor_ages
DROP POLICY IF EXISTS "Authorized users can manage ages_profissionais" ON public.ages_profissionais;
CREATE POLICY "Authorized users can manage ages_profissionais" 
ON public.ages_profissionais 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 2. Atualizar política da tabela ages_profissionais_documentos
DROP POLICY IF EXISTS "Authorized users can manage ages_profissionais_documentos" ON public.ages_profissionais_documentos;
CREATE POLICY "Authorized users can manage ages_profissionais_documentos" 
ON public.ages_profissionais_documentos 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 3. Atualizar política da tabela ages_contratos
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos" ON public.ages_contratos;
CREATE POLICY "Authorized users can manage ages_contratos" 
ON public.ages_contratos 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 4. Atualizar política da tabela ages_producao
DROP POLICY IF EXISTS "Authorized users can manage ages_producao" ON public.ages_producao;
CREATE POLICY "Authorized users can manage ages_producao" 
ON public.ages_producao 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 5. Atualizar política da tabela ages_licitacoes
DROP POLICY IF EXISTS "Authorized users can manage ages_licitacoes" ON public.ages_licitacoes;
CREATE POLICY "Authorized users can manage ages_licitacoes" 
ON public.ages_licitacoes 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 6. Atualizar política da tabela ages_leads
DROP POLICY IF EXISTS "Authorized users can manage ages_leads" ON public.ages_leads;
CREATE POLICY "Authorized users can manage ages_leads" 
ON public.ages_leads 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 7. Atualizar política da tabela ages_contratos_documentos
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos_documentos" ON public.ages_contratos_documentos;
CREATE POLICY "Authorized users can manage ages_contratos_documentos" 
ON public.ages_contratos_documentos 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);