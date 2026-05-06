-- =====================================================================
-- Plano Aquecimento + Anti-Ban v1 — Sprint 2 fix segurança
-- aquecedor_ativo: flag opt-in pra evitar que aquecedor toque chips antigos
-- em produção. Default false. chip-bootstrap seta true em chips novos.
--
-- Decisão Raul (05/05/2026): "está autorizado mas não em todos os chips,
-- precisamos saber em quais usar e em tese é só nos novos"
-- =====================================================================

ALTER TABLE public.chip_state
  ADD COLUMN IF NOT EXISTS aquecedor_ativo bool NOT NULL DEFAULT false;

-- Atualiza graduator: só promove fase de chips com aquecedor_ativo=true
CREATE OR REPLACE FUNCTION public.chip_aquecimento_graduator()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_promovidos_aquec int := 0;
  v_promovidos_pronto int := 0;
BEGIN
  WITH up AS (
    UPDATE public.chip_state cs
    SET fase = 'aquecimento',
        warmup_start_date = CURRENT_DATE,
        fase_inicio_at = now()
    FROM public.chips c
    WHERE c.id = cs.chip_id
      AND cs.fase = 'setup'
      AND cs.aquecedor_ativo = true
      AND c.connection_state = 'open'
      AND cs.fase_inicio_at < now() - INTERVAL '5 minutes'
    RETURNING cs.chip_id
  )
  SELECT COUNT(*) INTO v_promovidos_aquec FROM up;

  WITH up AS (
    UPDATE public.chip_state
    SET fase = 'pronto', fase_inicio_at = now()
    WHERE fase = 'aquecimento'
      AND aquecedor_ativo = true
      AND warmup_start_date IS NOT NULL
      AND warmup_start_date <= CURRENT_DATE - 7
    RETURNING chip_id
  )
  SELECT COUNT(*) INTO v_promovidos_pronto FROM up;

  RETURN jsonb_build_object(
    'setup_to_aquecimento', v_promovidos_aquec,
    'aquecimento_to_pronto', v_promovidos_pronto,
    'ts', now()
  );
END $$;

-- Atualiza pair-rotator: só considera chips com aquecedor_ativo=true
CREATE OR REPLACE FUNCTION public.chip_pair_rotator()
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_inseridos int := 0;
  v_atualizados int := 0;
  v_chips_count int;
BEGIN
  SELECT COUNT(*) INTO v_chips_count
  FROM public.chip_state
  WHERE fase IN ('aquecimento','pronto','producao')
    AND aquecedor_ativo = true;

  IF v_chips_count < 2 THEN
    RETURN jsonb_build_object('skipped','less_than_2_chips_aquecedor_ativo','count',v_chips_count);
  END IF;

  WITH chips_aquec AS (
    SELECT chip_id FROM public.chip_state
    WHERE fase IN ('aquecimento','pronto','producao')
      AND aquecedor_ativo = true
  ),
  todos_pares AS (
    SELECT a.chip_id AS a, b.chip_id AS b
    FROM chips_aquec a CROSS JOIN chips_aquec b
    WHERE a.chip_id < b.chip_id
  ),
  inserts AS (
    INSERT INTO public.aquecedor_par (chip_a_id, chip_b_id, intensidade, fase)
    SELECT a, b,
      CASE
        WHEN random() < 0.05 THEN 5
        WHEN random() < 0.20 THEN 4
        WHEN random() < 0.50 THEN 3
        WHEN random() < 0.85 THEN 2
        ELSE 1
      END,
      CASE WHEN random() < 0.10 THEN 'esfriando' ELSE 'ativo' END
    FROM todos_pares
    ON CONFLICT (chip_a_id, chip_b_id) DO UPDATE SET
      intensidade = EXCLUDED.intensidade,
      fase = CASE
        WHEN aquecedor_par.fase = 'ativo' AND random() < 0.1 THEN 'esfriando'
        WHEN aquecedor_par.fase = 'esfriando' AND random() < 0.5 THEN 'inativo'
        WHEN aquecedor_par.fase = 'inativo' AND random() < 0.05 THEN 'ativo'
        ELSE aquecedor_par.fase
      END
    RETURNING (xmax = 0) AS inserted
  )
  SELECT COUNT(*) FILTER (WHERE inserted), COUNT(*) FILTER (WHERE NOT inserted)
  INTO v_inseridos, v_atualizados
  FROM inserts;

  RETURN jsonb_build_object(
    'pairs_inserted', v_inseridos,
    'pairs_updated', v_atualizados,
    'chips_eligible', v_chips_count,
    'ts', now()
  );
END $$;

-- =====================================================================
-- Cron jobs agendados em 05/05/2026 22:30 BRT (autorização Raul):
-- - chip-aquecimento-graduator-hourly  '5 * * * *'
-- - chip-pair-rotator-daily            '0 3 * * *'
-- - aquecedor-tick-2min                '*/2 * * * *' (HTTP POST → edge)
--
-- Pra desligar:
-- SELECT cron.unschedule('jobname');
-- =====================================================================
