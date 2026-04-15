
CREATE POLICY "Service role can insert lead_especialidades"
ON public.lead_especialidades
FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can select lead_especialidades"
ON public.lead_especialidades
FOR SELECT
TO service_role
USING (true);
