-- Drop the problematic RLS policy
DROP POLICY IF EXISTS "Users can view participants in their channels" ON comunicacao_participantes;

-- Create a security definer function to check if user is a channel participant
CREATE OR REPLACE FUNCTION public.is_channel_participant(_user_id uuid, _canal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM comunicacao_participantes
    WHERE user_id = _user_id
      AND canal_id = _canal_id
  )
$$;

-- Recreate the policy using the security definer function
CREATE POLICY "Users can view participants in their channels"
ON comunicacao_participantes
FOR SELECT
USING (public.is_channel_participant(auth.uid(), canal_id));