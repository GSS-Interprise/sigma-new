-- =====================================================================
-- Plano Aquecimento + Anti-Ban v1 — Sprint 1
-- Seed: popular chip_state com 1 linha por chip existente em fase 'novo'
-- Chips já em produção que estão pode_disparar=true serão setados como
-- 'producao' com warmup_start_date retroativa (hoje - 8 dias) pra liberar
-- envio imediato sem warm-up extra. Demais ficam 'novo' aguardando bootstrap.
-- =====================================================================

INSERT INTO public.chip_state (chip_id, fase, warmup_start_date)
SELECT
  c.id,
  CASE
    WHEN c.pode_disparar = true AND c.connection_state = 'open'
      THEN 'producao'
    ELSE 'novo'
  END,
  CASE
    WHEN c.pode_disparar = true AND c.connection_state = 'open'
      THEN CURRENT_DATE - INTERVAL '8 days'
    ELSE NULL
  END
FROM public.chips c
WHERE NOT EXISTS (
  SELECT 1 FROM public.chip_state cs WHERE cs.chip_id = c.id
);
