-- Add RLS policies for non-admin users to access contrato_rascunho and contratos

-- 1. Allow gestor_captacao to manage contrato_rascunho
DROP POLICY IF EXISTS "Gestores de captação podem gerenciar contrato_rascunho" ON public.contrato_rascunho;
CREATE POLICY "Gestores de captação podem gerenciar contrato_rascunho"
ON public.contrato_rascunho
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'lideres')
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'lideres')
);

-- 2. Allow lideres to view contratos (SELECT only)
DROP POLICY IF EXISTS "Líderes podem visualizar contratos" ON public.contratos;
CREATE POLICY "Líderes podem visualizar contratos"
ON public.contratos
FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'lideres') OR
  has_role(auth.uid(), 'coordenador_escalas') OR
  has_role(auth.uid(), 'gestor_financeiro') OR
  has_role(auth.uid(), 'diretoria')
);

-- 3. Allow gestor_contratos, gestor_captacao to insert/update/delete contratos
DROP POLICY IF EXISTS "Gestores podem gerenciar contratos" ON public.contratos;
CREATE POLICY "Gestores podem gerenciar contratos"
ON public.contratos
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao')
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao')
);

-- 4. Allow gestor_captacao to manage licitacoes (they can move cards)
DROP POLICY IF EXISTS "Gestores de captação podem gerenciar licitações" ON public.licitacoes;
CREATE POLICY "Gestores de captação podem gerenciar licitações"
ON public.licitacoes
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao') OR
  has_role(auth.uid(), 'lideres')
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao') OR
  has_role(auth.uid(), 'lideres')
);

-- 5. Allow authenticated users to view licitacoes (for kanban display)
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar licitações" ON public.licitacoes;
CREATE POLICY "Usuários autenticados podem visualizar licitações"
ON public.licitacoes
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 6. Allow gestor_captacao and lideres to insert licitacoes_atividades
DROP POLICY IF EXISTS "Gestores podem inserir atividades de licitações" ON public.licitacoes_atividades;
CREATE POLICY "Gestores podem inserir atividades de licitações"
ON public.licitacoes_atividades
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    auth.uid() = user_id OR
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos') OR 
    has_role(auth.uid(), 'gestor_captacao') OR
    has_role(auth.uid(), 'lideres')
  )
);

-- 7. Allow authenticated users to view contrato_rascunho (for display in captação kanban)
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar contrato_rascunho" ON public.contrato_rascunho;
CREATE POLICY "Usuários autenticados podem visualizar contrato_rascunho"
ON public.contrato_rascunho
FOR SELECT
USING (auth.uid() IS NOT NULL);