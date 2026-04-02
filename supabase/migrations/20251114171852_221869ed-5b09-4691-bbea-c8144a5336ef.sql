-- Fix RLS policy for comunicacao_participantes to allow participants to add others
-- Currently only channel creators can add participants, which is too restrictive

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Channel creators can add participants" ON comunicacao_participantes;

-- Create new policy that allows:
-- 1. Channel creators to add participants
-- 2. Existing channel participants to add new participants
CREATE POLICY "Channel creators and participants can add participants"
ON comunicacao_participantes
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM comunicacao_canais
    WHERE comunicacao_canais.id = comunicacao_participantes.canal_id
    AND comunicacao_canais.criado_por = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM comunicacao_participantes existing_participant
    WHERE existing_participant.canal_id = comunicacao_participantes.canal_id
    AND existing_participant.user_id = auth.uid()
  )
);