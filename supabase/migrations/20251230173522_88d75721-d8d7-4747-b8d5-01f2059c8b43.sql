-- Permitir que lideres, gestor_contratos e gestor_captacao gerenciem config_lista_items
CREATE POLICY "Gestores and lideres can manage config_lista_items"
ON public.config_lista_items
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'lideres') OR 
  public.has_role(auth.uid(), 'gestor_contratos') OR 
  public.has_role(auth.uid(), 'gestor_captacao')
)
WITH CHECK (
  public.has_role(auth.uid(), 'lideres') OR 
  public.has_role(auth.uid(), 'gestor_contratos') OR 
  public.has_role(auth.uid(), 'gestor_captacao')
);