CREATE POLICY "Authenticated users can update lead attachments"
ON public.lead_anexos
FOR UPDATE
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);