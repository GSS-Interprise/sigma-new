CREATE POLICY "Authenticated users can update banco_interesse_leads"
ON public.banco_interesse_leads
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
