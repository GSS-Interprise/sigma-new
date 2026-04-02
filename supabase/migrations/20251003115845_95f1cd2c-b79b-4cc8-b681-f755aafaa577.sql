-- Ajustar políticas RLS da tabela medicos para permitir inserção por usuários autenticados
-- Remove as políticas antigas
DROP POLICY IF EXISTS "Admins and recrutadores can manage medicos" ON public.medicos;
DROP POLICY IF EXISTS "Authenticated users can view medicos" ON public.medicos;

-- Cria novas políticas mais permissivas para desenvolvimento
CREATE POLICY "Authenticated users can insert medicos"
ON public.medicos
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can view medicos"
ON public.medicos
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can update medicos"
ON public.medicos
FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete medicos"
ON public.medicos
FOR DELETE
TO authenticated
USING (true);