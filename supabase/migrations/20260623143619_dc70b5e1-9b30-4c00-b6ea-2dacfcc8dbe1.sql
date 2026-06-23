DROP POLICY IF EXISTS "Admins ou participantes podem adicionar" ON public.comunicacao_participantes;

CREATE POLICY "Admins, participantes ou criador do canal podem adicionar"
ON public.comunicacao_participantes FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.is_channel_participant(auth.uid(), canal_id)
  OR EXISTS (
    SELECT 1 FROM public.comunicacao_canais c
    WHERE c.id = canal_id AND c.criado_por = auth.uid()
  )
);