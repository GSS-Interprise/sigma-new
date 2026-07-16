-- =====================================================================
-- TRIAGEM PNCP — estágio de PRECISÃO (IA + humano) sobre os candidatos.
--
-- Fluxo: pncp_relevantes(perfil) [recall] → pncp-classificar [IA gpt-4o dá
-- precisão] → grava aqui → tela de triagem humana decide o borderline →
-- pncp-promote leva os aprovados pro Sigma.
--
-- 1 linha por (licitação × perfil): a mesma licitação pode ser relevante p/
-- um cliente e não p/ outro (produto multi-tenant).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.pncp_triagem (
  numero_controle_pncp text NOT NULL,
  perfil_slug          text NOT NULL,
  -- veredito da IA
  ia_relevante   boolean,
  ia_motivo      text,
  ia_modelo      text,
  ia_classificado_em timestamptz,
  -- decisão final (IA vira default; humano pode sobrepor na tela de triagem)
  status         text NOT NULL DEFAULT 'pendente_ia',
    -- pendente_ia | ia_aprovado | ia_rejeitado | humano_aprovado | humano_rejeitado | promovido
  decidido_por   uuid,
  decidido_em    timestamptz,
  promovido_licitacao_id uuid,   -- id no Sigma após promote
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (numero_controle_pncp, perfil_slug)
);

CREATE INDEX IF NOT EXISTS idx_pncp_triagem_status ON public.pncp_triagem (perfil_slug, status);

GRANT ALL ON public.pncp_triagem TO authenticated, service_role;
ALTER TABLE public.pncp_triagem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS triagem_read ON public.pncp_triagem;
CREATE POLICY triagem_read ON public.pncp_triagem FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS triagem_write ON public.pncp_triagem;
CREATE POLICY triagem_write ON public.pncp_triagem FOR ALL TO authenticated USING (true) WITH CHECK (true);

COMMENT ON TABLE public.pncp_triagem IS 'Triagem dos candidatos do espelho: veredito IA + decisão humana + rastro do promote pro Sigma. 1 linha por licitação×perfil.';
