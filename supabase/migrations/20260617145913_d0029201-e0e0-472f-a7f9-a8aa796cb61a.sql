
-- Helper: é criador (admin) do canal
CREATE OR REPLACE FUNCTION public.is_channel_creator(_user_id uuid, _canal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.comunicacao_canais
    WHERE id = _canal_id AND criado_por = _user_id
  )
$$;

-- comunicacao_participantes: SELECT — admin global, participante OU criador do canal
DROP POLICY IF EXISTS "Admins ou participantes podem ver participantes" ON public.comunicacao_participantes;
CREATE POLICY "Admins, participantes ou criador podem ver participantes"
ON public.comunicacao_participantes FOR SELECT
USING (
  public.is_admin(auth.uid())
  OR public.is_channel_participant(auth.uid(), canal_id)
  OR public.is_channel_creator(auth.uid(), canal_id)
);

-- INSERT — admin, participante OU criador
DROP POLICY IF EXISTS "Admins ou participantes podem adicionar" ON public.comunicacao_participantes;
CREATE POLICY "Admins, participantes ou criador podem adicionar"
ON public.comunicacao_participantes FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid())
  OR public.is_channel_participant(auth.uid(), canal_id)
  OR public.is_channel_creator(auth.uid(), canal_id)
);

-- DELETE — admin, próprio usuário OU criador do canal
DROP POLICY IF EXISTS "Admins ou próprio usuário podem remover" ON public.comunicacao_participantes;
CREATE POLICY "Admins, próprio usuário ou criador podem remover"
ON public.comunicacao_participantes FOR DELETE
USING (
  public.is_admin(auth.uid())
  OR user_id = auth.uid()
  OR public.is_channel_creator(auth.uid(), canal_id)
);
