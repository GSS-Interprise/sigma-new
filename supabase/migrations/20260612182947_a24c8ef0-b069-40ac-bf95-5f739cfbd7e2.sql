
CREATE TABLE public.comunicacao_reacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mensagem_id UUID NOT NULL REFERENCES public.comunicacao_mensagens(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_nome TEXT NOT NULL,
  reacao TEXT NOT NULL CHECK (reacao IN ('ok','aprovado','triste','feliz','legal','coracao')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (mensagem_id, user_id, reacao)
);

CREATE INDEX idx_comunicacao_reacoes_mensagem ON public.comunicacao_reacoes(mensagem_id);

GRANT SELECT, INSERT, DELETE ON public.comunicacao_reacoes TO authenticated;
GRANT ALL ON public.comunicacao_reacoes TO service_role;

ALTER TABLE public.comunicacao_reacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ou participantes podem ver reacoes"
ON public.comunicacao_reacoes FOR SELECT
TO authenticated
USING (
  is_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.comunicacao_mensagens m
    WHERE m.id = comunicacao_reacoes.mensagem_id
      AND is_channel_participant(auth.uid(), m.canal_id)
  )
);

CREATE POLICY "Participantes podem reagir"
ON public.comunicacao_reacoes FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.comunicacao_mensagens m
    WHERE m.id = comunicacao_reacoes.mensagem_id
      AND (is_admin(auth.uid()) OR is_channel_participant(auth.uid(), m.canal_id))
  )
);

CREATE POLICY "Usuario pode remover sua propria reacao"
ON public.comunicacao_reacoes FOR DELETE
TO authenticated
USING (user_id = auth.uid() OR is_admin(auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_reacoes;
