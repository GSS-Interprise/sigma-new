-- =====================================================================
-- F1.7 — RLS: chip privado (Letícia não vê Bruna, etc)
--
-- Quando chip tem privado=true, apenas:
--   - o próprio dono (chips.dono_id = auth.uid())
--   - admin (is_admin())
--   - leader (is_leader())
-- podem ver o chip e as conversas/mensagens que pertencem a ele.
--
-- Estratégia: políticas RESTRICTIVE adicionais. Postgres combina policies
-- PERMISSIVE com OR e RESTRICTIVE com AND, então RESTRICTIVE bloqueia
-- mesmo se outras PERMISSIVE existentes liberariam.
--
-- NÃO drop as policies existentes — só adiciona camada extra de restrição.
-- =====================================================================

-- 1. chips: RESTRICTIVE SELECT bloqueia ver chip privado de outros
DROP POLICY IF EXISTS "chips_privado_restrictive_select" ON public.chips;
CREATE POLICY "chips_privado_restrictive_select"
  ON public.chips
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    privado = false
    OR dono_id = auth.uid()
    OR is_admin(auth.uid())
    OR is_leader(auth.uid())
  );

-- 2. sigzap_conversations: RESTRICTIVE SELECT bloqueia ver conversa de chip privado alheio
-- JOIN: sigzap_conversations.instance_id -> sigzap_instances.id -> sigzap_instances.chip_id -> chips.id
DROP POLICY IF EXISTS "sigzap_conv_chip_privado_restrictive" ON public.sigzap_conversations;
CREATE POLICY "sigzap_conv_chip_privado_restrictive"
  ON public.sigzap_conversations
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1
      FROM public.sigzap_instances si
      JOIN public.chips c ON c.id = si.chip_id
      WHERE si.id = sigzap_conversations.instance_id
        AND c.privado = true
        AND c.dono_id IS DISTINCT FROM auth.uid()
        AND NOT is_admin(auth.uid())
        AND NOT is_leader(auth.uid())
    )
  );

-- 3. sigzap_messages: RESTRICTIVE SELECT — não ver mensagens de conversa de chip privado alheio
DROP POLICY IF EXISTS "sigzap_msg_chip_privado_restrictive" ON public.sigzap_messages;
CREATE POLICY "sigzap_msg_chip_privado_restrictive"
  ON public.sigzap_messages
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT EXISTS (
      SELECT 1
      FROM public.sigzap_conversations conv
      JOIN public.sigzap_instances si ON si.id = conv.instance_id
      JOIN public.chips c ON c.id = si.chip_id
      WHERE conv.id = sigzap_messages.conversation_id
        AND c.privado = true
        AND c.dono_id IS DISTINCT FROM auth.uid()
        AND NOT is_admin(auth.uid())
        AND NOT is_leader(auth.uid())
    )
  );

COMMENT ON POLICY "chips_privado_restrictive_select" ON public.chips IS
  'F1.7 — Chip marcado privado só visível pra dono/admin/leader.';
COMMENT ON POLICY "sigzap_conv_chip_privado_restrictive" ON public.sigzap_conversations IS
  'F1.7 — Conversa de chip privado só visível pra dono/admin/leader.';
COMMENT ON POLICY "sigzap_msg_chip_privado_restrictive" ON public.sigzap_messages IS
  'F1.7 — Mensagem de conversa de chip privado só visível pra dono/admin/leader.';
