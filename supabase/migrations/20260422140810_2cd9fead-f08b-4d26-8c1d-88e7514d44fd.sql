-- Garante RLS habilitado
ALTER TABLE public.campanha_listas ENABLE ROW LEVEL SECURITY;

-- Limpa políticas antigas para evitar conflito
DROP POLICY IF EXISTS "campanha_listas_select_authenticated" ON public.campanha_listas;
DROP POLICY IF EXISTS "campanha_listas_insert_authenticated" ON public.campanha_listas;
DROP POLICY IF EXISTS "campanha_listas_delete_authenticated" ON public.campanha_listas;

CREATE POLICY "campanha_listas_select_authenticated"
ON public.campanha_listas
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "campanha_listas_insert_authenticated"
ON public.campanha_listas
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "campanha_listas_delete_authenticated"
ON public.campanha_listas
FOR DELETE
TO authenticated
USING (true);