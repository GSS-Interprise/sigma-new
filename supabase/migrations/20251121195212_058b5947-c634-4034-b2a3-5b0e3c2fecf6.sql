
-- Políticas RLS para suporte_tickets

-- Usuários podem ver seus próprios tickets
CREATE POLICY "Usuários podem visualizar seus próprios tickets"
ON public.suporte_tickets
FOR SELECT
TO authenticated
USING (auth.uid() = solicitante_id);

-- Admins e líderes podem ver todos os tickets
CREATE POLICY "Admins e líderes podem visualizar todos os tickets"
ON public.suporte_tickets
FOR SELECT
TO authenticated
USING (
  public.is_admin(auth.uid()) OR 
  public.is_leader(auth.uid())
);

-- Usuários podem criar seus próprios tickets
CREATE POLICY "Usuários podem criar tickets"
ON public.suporte_tickets
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = solicitante_id);

-- Usuários podem atualizar seus próprios tickets
CREATE POLICY "Usuários podem atualizar seus tickets"
ON public.suporte_tickets
FOR UPDATE
TO authenticated
USING (auth.uid() = solicitante_id)
WITH CHECK (auth.uid() = solicitante_id);

-- Admins e líderes podem atualizar qualquer ticket
CREATE POLICY "Admins e líderes podem atualizar todos os tickets"
ON public.suporte_tickets
FOR UPDATE
TO authenticated
USING (
  public.is_admin(auth.uid()) OR 
  public.is_leader(auth.uid())
)
WITH CHECK (
  public.is_admin(auth.uid()) OR 
  public.is_leader(auth.uid())
);

-- Admins podem deletar tickets
CREATE POLICY "Admins podem deletar tickets"
ON public.suporte_tickets
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));
