-- Drop existing policies for comunicacao tables
DROP POLICY IF EXISTS "Participantes podem ver canais" ON public.comunicacao_canais;
DROP POLICY IF EXISTS "Usuários autenticados podem criar canais" ON public.comunicacao_canais;
DROP POLICY IF EXISTS "Criadores podem atualizar canais" ON public.comunicacao_canais;
DROP POLICY IF EXISTS "Criadores podem deletar canais" ON public.comunicacao_canais;

DROP POLICY IF EXISTS "Participantes podem ver mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Participantes podem enviar mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Autores podem editar mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Autores podem deletar mensagens" ON public.comunicacao_mensagens;

DROP POLICY IF EXISTS "Usuários podem ver participantes" ON public.comunicacao_participantes;
DROP POLICY IF EXISTS "Participantes podem ser adicionados" ON public.comunicacao_participantes;
DROP POLICY IF EXISTS "Participantes podem sair" ON public.comunicacao_participantes;

DROP POLICY IF EXISTS "Usuários podem ver notificações" ON public.comunicacao_notificacoes;
DROP POLICY IF EXISTS "Sistema pode criar notificações" ON public.comunicacao_notificacoes;
DROP POLICY IF EXISTS "Usuários podem atualizar notificações" ON public.comunicacao_notificacoes;

-- Canais: Admins veem todos, outros veem apenas onde são participantes
CREATE POLICY "Admins ou participantes podem ver canais"
ON public.comunicacao_canais FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), id)
);

CREATE POLICY "Usuários autenticados podem criar canais"
ON public.comunicacao_canais FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins ou criadores podem atualizar canais"
ON public.comunicacao_canais FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  OR criado_por = auth.uid()
);

CREATE POLICY "Admins ou criadores podem deletar canais"
ON public.comunicacao_canais FOR DELETE
USING (
  public.is_admin(auth.uid()) 
  OR criado_por = auth.uid()
);

-- Mensagens: Admins veem todas, outros veem apenas de canais onde são participantes
CREATE POLICY "Admins ou participantes podem ver mensagens"
ON public.comunicacao_mensagens FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

CREATE POLICY "Admins ou participantes podem enviar mensagens"
ON public.comunicacao_mensagens FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

CREATE POLICY "Admins ou autores podem editar mensagens"
ON public.comunicacao_mensagens FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

CREATE POLICY "Admins ou autores podem deletar mensagens"
ON public.comunicacao_mensagens FOR DELETE
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

-- Participantes: Admins veem todos, outros veem apenas de canais onde são participantes
CREATE POLICY "Admins ou participantes podem ver participantes"
ON public.comunicacao_participantes FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

CREATE POLICY "Admins ou participantes podem adicionar"
ON public.comunicacao_participantes FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

CREATE POLICY "Admins ou próprio usuário podem remover"
ON public.comunicacao_participantes FOR DELETE
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

-- Notificações: Usuários veem apenas suas próprias, admins veem todas
CREATE POLICY "Admins ou próprio usuário podem ver notificações"
ON public.comunicacao_notificacoes FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

CREATE POLICY "Sistema pode criar notificações"
ON public.comunicacao_notificacoes FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Admins ou próprio usuário podem atualizar notificações"
ON public.comunicacao_notificacoes FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);