
DROP POLICY IF EXISTS "Authenticated users can view visualizacoes" ON public.lead_historico_visualizacoes;
DROP POLICY IF EXISTS "Authenticated users can read visualizacoes" ON public.lead_historico_visualizacoes;

CREATE POLICY "Users read own or admin/leader reads all"
ON public.lead_historico_visualizacoes
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin(auth.uid())
  OR public.is_leader(auth.uid())
);
