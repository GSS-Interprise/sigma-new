CREATE POLICY "Authenticated users can view all roles for profile listing"
ON public.user_roles
FOR SELECT
TO authenticated
USING (true);