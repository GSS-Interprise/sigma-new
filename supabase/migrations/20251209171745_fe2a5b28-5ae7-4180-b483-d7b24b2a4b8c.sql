-- Drop the restrictive update policy and create a more permissive one for authenticated users
DROP POLICY IF EXISTS "Authenticated users can update lead status" ON public.leads;

-- Create policy that allows any authenticated user to update leads (for those with module access)
CREATE POLICY "Authenticated users can update leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Also allow authenticated users to SELECT leads (needed to edit them)
DROP POLICY IF EXISTS "Authenticated users can view leads" ON public.leads;
CREATE POLICY "Authenticated users can view leads"
ON public.leads
FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL);