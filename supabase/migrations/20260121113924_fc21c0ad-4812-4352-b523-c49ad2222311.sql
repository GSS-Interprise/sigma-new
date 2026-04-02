-- Adicionar política para permitir que líderes/gestores de captação possam atualizar o setor_id de profiles
-- para adicionar/remover usuários do setor de captação

CREATE POLICY "Captação leaders can update user sectors"
ON public.profiles
FOR UPDATE
USING (
  public.is_captacao_leader(auth.uid()) OR 
  public.has_role(auth.uid(), 'gestor_captacao'::app_role)
)
WITH CHECK (
  public.is_captacao_leader(auth.uid()) OR 
  public.has_role(auth.uid(), 'gestor_captacao'::app_role)
);