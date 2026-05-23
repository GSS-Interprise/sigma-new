-- =====================================================================
-- F1.4b — Fixar conversa no SigZap (por usuário, não global)
--
-- Cada operadora pode fixar conversas específicas no topo das colunas.
-- Pins são individuais: Bruna fixa conversa X, Amanda NÃO vê X fixada.
--
-- Resolve: SigZapConversaContextMenu.tsx:292-293 ("Funcionalidade em breve")
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sigzap_pinned_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES public.sigzap_conversations(id) ON DELETE CASCADE,
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_sigzap_pinned_user
  ON public.sigzap_pinned_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_sigzap_pinned_conv
  ON public.sigzap_pinned_conversations(conversation_id);

ALTER TABLE public.sigzap_pinned_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own pins" ON public.sigzap_pinned_conversations;
CREATE POLICY "Users manage their own pins"
  ON public.sigzap_pinned_conversations
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT ALL ON public.sigzap_pinned_conversations TO authenticated, service_role;

COMMENT ON TABLE public.sigzap_pinned_conversations IS
  'Conversas fixadas individualmente por usuário no SigZap. Pinned aparecem no topo das colunas de conversas. RLS garante que cada user só vê e gerencia seus próprios pins.';
