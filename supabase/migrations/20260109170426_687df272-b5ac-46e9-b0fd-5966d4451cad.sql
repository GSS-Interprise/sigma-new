-- Adicionar política para permitir que usuários com permissão de captação gerenciem chips
CREATE POLICY "Captacao users can manage chips"
ON public.chips
FOR ALL
USING (
  has_captacao_permission(auth.uid(), 'seigzaps_config')
)
WITH CHECK (
  has_captacao_permission(auth.uid(), 'seigzaps_config')
);

-- Também permitir líderes gerenciarem chips
CREATE POLICY "Leaders can manage chips"
ON public.chips
FOR ALL
USING (
  is_leader(auth.uid())
)
WITH CHECK (
  is_leader(auth.uid())
);