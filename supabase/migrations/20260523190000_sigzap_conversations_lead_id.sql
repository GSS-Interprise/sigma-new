-- =====================================================================
-- F1.3 — Vincular sigzap_conversations.lead_id (FK direta para leads)
--
-- Hoje cada conversa só tem contact_id -> sigzap_contacts (phone), e o
-- "lead" é inferido por JOIN em phone_e164 a cada query. Caro e propenso
-- a inconsistências (telefones mudam, leads são merged).
--
-- Solução: coluna lead_id direta. Backfill em 2 passadas:
--   1. Match exato sigzap_contacts.contact_phone <-> leads.phone_e164
--   2. (Próxima fase) match fuzzy por últimos 8 dígitos
--
-- Habilita: master-detail no LeadKanbanModal (F2.4), filtros em campanha
-- por status do lead, e qualquer query lead-centric no SigZap sem JOIN.
-- =====================================================================

-- 1. Coluna + FK
ALTER TABLE public.sigzap_conversations
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

-- 2. Índice pra queries lead-centric
CREATE INDEX IF NOT EXISTS idx_sigzap_conversations_lead_id
  ON public.sigzap_conversations(lead_id)
  WHERE lead_id IS NOT NULL;

-- 3. Backfill — passada 1 (match exato phone_e164)
-- Atualiza conversas onde o telefone do contato bate exato com phone_e164 do lead.
-- Em caso de múltiplos leads pro mesmo telefone (raro mas possível), pega o mais recente.
WITH matches AS (
  SELECT DISTINCT ON (conv.id)
    conv.id AS conversation_id,
    l.id AS lead_id
  FROM public.sigzap_conversations conv
  JOIN public.sigzap_contacts ct ON ct.id = conv.contact_id
  JOIN public.leads l ON l.phone_e164 = ct.contact_phone
  WHERE conv.lead_id IS NULL
    AND ct.contact_phone IS NOT NULL
    AND l.phone_e164 IS NOT NULL
  ORDER BY conv.id, l.updated_at DESC NULLS LAST
)
UPDATE public.sigzap_conversations conv
SET lead_id = m.lead_id
FROM matches m
WHERE conv.id = m.conversation_id;

-- 4. Comentário pra contexto técnico futuro
COMMENT ON COLUMN public.sigzap_conversations.lead_id IS
  'FK direta para leads. Preenchida via backfill (match phone_e164) ou no INSERT de nova conversa quando lead conhecido. Permite queries lead-centric sem JOIN custoso por phone.';
