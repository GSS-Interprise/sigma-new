-- Allow all authenticated users to insert lead history entries
-- This is needed for proper lead lifecycle tracking

-- Drop the restrictive insert policy
DROP POLICY IF EXISTS "Usuários autorizados podem inserir histórico de leads" ON public.lead_historico;

-- Create a more permissive policy for INSERT that allows any authenticated user
CREATE POLICY "Authenticated users can insert lead history"
ON public.lead_historico
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);