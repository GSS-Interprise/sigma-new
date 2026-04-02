-- Add policy to allow authenticated users to insert leads
CREATE POLICY "Authenticated users can insert leads" 
ON public.leads 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);