-- Add DELETE policy for comunicacao_participantes
CREATE POLICY "Channel creators and admins can delete participants"
ON comunicacao_participantes
FOR DELETE
USING (
  (EXISTS (
    SELECT 1 FROM comunicacao_canais
    WHERE comunicacao_canais.id = comunicacao_participantes.canal_id
    AND comunicacao_canais.criado_por = auth.uid()
  ))
  OR is_admin(auth.uid())
);

-- Add DELETE policy for comunicacao_canais (only admins)
CREATE POLICY "Admins can delete channels"
ON comunicacao_canais
FOR DELETE
USING (is_admin(auth.uid()));