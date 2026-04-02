-- Atualizar política de SELECT em clientes para incluir gestor_financeiro
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar clientes" ON public.clientes;

CREATE POLICY "Usuarios autorizados podem visualizar clientes"
ON public.clientes
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_radiologia'::app_role)
  OR has_role(auth.uid(), 'gestor_financeiro'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'diretoria'::app_role)
  OR has_role(auth.uid(), 'coordenador_escalas'::app_role)
);

-- Atualizar política de SELECT em unidades para incluir gestor_financeiro
DROP POLICY IF EXISTS "Gestores de radiologia podem visualizar unidades" ON public.unidades;

CREATE POLICY "Usuarios autorizados podem visualizar unidades"
ON public.unidades
FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_radiologia'::app_role)
  OR has_role(auth.uid(), 'gestor_financeiro'::app_role)
  OR has_role(auth.uid(), 'lideres'::app_role)
  OR has_role(auth.uid(), 'diretoria'::app_role)
  OR has_role(auth.uid(), 'coordenador_escalas'::app_role)
);