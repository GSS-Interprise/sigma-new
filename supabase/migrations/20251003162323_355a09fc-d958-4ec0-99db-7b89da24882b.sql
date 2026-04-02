-- Atualizar políticas RLS da tabela clientes para permitir operações de usuários autenticados
DROP POLICY IF EXISTS "Admins and gestores can manage clientes" ON public.clientes;
DROP POLICY IF EXISTS "Authenticated users can view clientes" ON public.clientes;

-- Permitir que todos os usuários autenticados gerenciem clientes
CREATE POLICY "Authenticated users can manage clientes"
ON public.clientes
FOR ALL
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);