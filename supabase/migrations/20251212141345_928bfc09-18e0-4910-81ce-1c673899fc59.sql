-- Remover políticas existentes
DROP POLICY IF EXISTS "Authenticated users can delete anexos" ON licitacoes_anexos;
DROP POLICY IF EXISTS "Authenticated users can insert anexos" ON licitacoes_anexos;
DROP POLICY IF EXISTS "Authenticated users can view anexos" ON licitacoes_anexos;

-- Recriar políticas RLS corretamente
CREATE POLICY "Authenticated users can view licitacoes_anexos" 
ON public.licitacoes_anexos 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert licitacoes_anexos" 
ON public.licitacoes_anexos 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete licitacoes_anexos" 
ON public.licitacoes_anexos 
FOR DELETE 
USING (auth.uid() IS NOT NULL);