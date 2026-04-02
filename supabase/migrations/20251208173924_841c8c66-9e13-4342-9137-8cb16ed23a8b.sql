-- Add policy to allow authenticated users to update lead status
CREATE POLICY "Authenticated users can update lead status"
ON public.leads
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);