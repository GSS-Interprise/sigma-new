-- Realinhar RLS de campanha_propostas para o módulo Disparos (não mais Leads)
DROP POLICY IF EXISTS captacao_leads_can_view_campanha_propostas ON public.campanha_propostas;
DROP POLICY IF EXISTS captacao_leads_can_insert_campanha_propostas ON public.campanha_propostas;
DROP POLICY IF EXISTS captacao_leads_can_update_campanha_propostas ON public.campanha_propostas;
DROP POLICY IF EXISTS admin_or_leader_can_delete_campanha_propostas ON public.campanha_propostas;

CREATE POLICY "view_campanha_propostas"
  ON public.campanha_propostas FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'disparos', 'visualizar')
    OR public.has_captacao_permission(auth.uid(), 'leads')
  );

CREATE POLICY "insert_campanha_propostas"
  ON public.campanha_propostas FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'disparos', 'criar')
    OR public.has_permission(auth.uid(), 'disparos', 'editar')
    OR public.has_captacao_permission(auth.uid(), 'leads')
  );

CREATE POLICY "update_campanha_propostas"
  ON public.campanha_propostas FOR UPDATE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'disparos', 'editar')
    OR public.has_captacao_permission(auth.uid(), 'leads')
  )
  WITH CHECK (
    CASE
      WHEN status = 'encerrada' THEN public.pode_encerrar_campanha(auth.uid())
      ELSE (
        public.is_admin(auth.uid())
        OR public.has_permission(auth.uid(), 'disparos', 'editar')
        OR public.has_captacao_permission(auth.uid(), 'leads')
      )
    END
  );

CREATE POLICY "delete_campanha_propostas"
  ON public.campanha_propostas FOR DELETE
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.pode_encerrar_campanha(auth.uid())
    OR public.has_permission(auth.uid(), 'disparos', 'excluir')
  );