-- Adicionar permissões faltantes para gestores de radiologia

-- radiologia_importacoes: adicionar UPDATE e DELETE
CREATE POLICY "Usuários autorizados podem atualizar importações"
ON public.radiologia_importacoes
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

CREATE POLICY "Usuários autorizados podem deletar importações"
ON public.radiologia_importacoes
FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- radiologia_pendencias_comentarios: adicionar DELETE para gestores
CREATE POLICY "Gestores podem deletar comentarios"
ON public.radiologia_pendencias_comentarios
FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_pendencias_comentarios: permitir UPDATE completo para gestores
DROP POLICY IF EXISTS "Users can update own comentarios" ON public.radiologia_pendencias_comentarios;

CREATE POLICY "Gestores podem atualizar comentarios"
ON public.radiologia_pendencias_comentarios
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_pendencias_historico: adicionar UPDATE e DELETE
CREATE POLICY "Gestores podem atualizar historico"
ON public.radiologia_pendencias_historico
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

CREATE POLICY "Gestores podem deletar historico"
ON public.radiologia_pendencias_historico
FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);