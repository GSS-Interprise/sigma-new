-- Limpa políticas SELECT/UPDATE redundantes para soft delete funcionar corretamente
DROP POLICY IF EXISTS "Users can view messages in their channels" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Admins ou participantes podem ver mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Users can update their own messages" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Admins ou autores podem editar mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Participantes podem editar ou deletar mensagens" ON public.comunicacao_mensagens;

-- SELECT: admin vê tudo (inclusive apagadas); usuário comum vê apenas mensagens não apagadas do canal
CREATE POLICY "Ver mensagens (admin vê apagadas, usuário não)"
  ON public.comunicacao_mensagens
  FOR SELECT
  USING (
    is_admin(auth.uid())
    OR (
      is_channel_participant(auth.uid(), canal_id)
      AND deleted_at IS NULL
    )
  );

-- UPDATE: admin ou autor (autor edita/soft-deleta as próprias)
CREATE POLICY "Admin ou autor pode editar/apagar mensagens"
  ON public.comunicacao_mensagens
  FOR UPDATE
  USING (is_admin(auth.uid()) OR user_id = auth.uid())
  WITH CHECK (is_admin(auth.uid()) OR user_id = auth.uid());