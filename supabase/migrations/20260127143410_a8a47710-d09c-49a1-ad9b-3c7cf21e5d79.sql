-- Drop existing UPDATE policies on profiles
DROP POLICY IF EXISTS "Captação managers can update user sectors" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users or admins can update profiles" ON public.profiles;

-- Create a single consolidated UPDATE policy
CREATE POLICY "Profiles update policy"
ON public.profiles
FOR UPDATE
USING (
  -- User can update their own profile
  auth.uid() = id
  -- OR admin can update any profile
  OR is_admin(auth.uid())
  -- OR gestor_captacao can update any profile (for adding captadores)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  -- OR captação leader can update any profile (for adding captadores)
  OR is_captacao_leader(auth.uid())
)
WITH CHECK (
  auth.uid() = id
  OR is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR is_captacao_leader(auth.uid())
);