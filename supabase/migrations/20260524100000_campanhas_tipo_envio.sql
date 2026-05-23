-- =====================================================================
-- F2.1 — campanhas.tipo_envio (IA / Manual / Ambos)
--
-- Base do pipeline manual da Fase 2. Hoje toda campanha é "IA only"
-- implicitamente. Vamos permitir:
--   - 'ia': fluxo atual (cold + cadência + IA responde + handoff humano)
--   - 'manual': operadora executa 6 tasks por lead (whatsapp×3 + email +
--               insta + telefone). Sem IA. Mensuração via campanha_lead_tasks.
--   - 'ambos': IA dispara, se converter humano recebe tasks
--
-- Default 'ia' garante zero regressão. Campanhas existentes continuam
-- exatamente como estão.
-- =====================================================================

ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS tipo_envio TEXT NOT NULL DEFAULT 'ia'
  CHECK (tipo_envio IN ('ia', 'manual', 'ambos'));

CREATE INDEX IF NOT EXISTS idx_campanhas_tipo_envio
  ON public.campanhas(tipo_envio);

COMMENT ON COLUMN public.campanhas.tipo_envio IS
  'Tipo do pipeline: ia (default, fluxo atual), manual (operadora executa 6 tasks/lead), ambos (IA + tasks no handoff). Sub-task F2.1 do sprint plan.';
