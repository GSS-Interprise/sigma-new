-- Tabela de auditoria de disparos manuais
CREATE TABLE public.disparo_manual_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_proposta_id uuid NOT NULL REFERENCES public.campanha_propostas(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  phone_e164 text NOT NULL,
  instance_id uuid REFERENCES public.chips(id),
  conversation_id uuid REFERENCES public.sigzap_conversations(id),
  mensagem text NOT NULL,
  status text NOT NULL DEFAULT 'enviado',
  erro text,
  enviado_por uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dme_campanha_proposta ON public.disparo_manual_envios(campanha_proposta_id);
CREATE INDEX idx_dme_lead ON public.disparo_manual_envios(lead_id);
CREATE INDEX idx_dme_created_at ON public.disparo_manual_envios(created_at DESC);

ALTER TABLE public.disparo_manual_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Captacao pode ver disparos manuais"
  ON public.disparo_manual_envios FOR SELECT
  USING (
    public.is_admin(auth.uid())
    OR public.has_permission(auth.uid(), 'captacao', 'view')
    OR enviado_por = auth.uid()
  );

CREATE POLICY "Captacao pode inserir disparos manuais"
  ON public.disparo_manual_envios FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (enviado_por IS NULL OR enviado_por = auth.uid())
  );

-- Adicionar valor 'disparo_manual' ao enum tipo_evento_lead se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'tipo_evento_lead' AND e.enumlabel = 'disparo_manual'
  ) THEN
    ALTER TYPE public.tipo_evento_lead ADD VALUE 'disparo_manual';
  END IF;
END $$;