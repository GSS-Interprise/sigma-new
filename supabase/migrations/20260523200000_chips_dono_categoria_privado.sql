-- =====================================================================
-- F1.6 — Chips: dono_id + categoria_uso + privado
--
-- Antes: chips eram "soltos", sem dono claro. Bruna criava chip pessoal,
-- mas IA de prospecção podia responder por ele (incidente 18/05 da Amanda).
-- chip_id em campanhas e RLS futuro precisam saber "de quem é esse chip".
--
-- Schema:
--   dono_id        UUID REFERENCES profiles -- operador responsável
--   categoria_uso  enum-like -- pra que serve (filtros UI, RLS futuro)
--   privado        boolean -- se true, RLS impede outros operadores de ver
--                  (implementado em F1.7)
--
-- Backfill conservador:
--   dono_id ← created_by (quando profile existe)
--   categoria_uso ← heurística leve por nome/flags; NULL pra resto
--                  (admin classifica via UI sem auto-suposição)
-- =====================================================================

-- 1. Colunas novas
ALTER TABLE public.chips
  ADD COLUMN IF NOT EXISTS dono_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.chips
  ADD COLUMN IF NOT EXISTS categoria_uso TEXT
  CHECK (categoria_uso IS NULL OR categoria_uso IN (
    'prospeccao_ia',
    'manual',
    'pessoal_restrito',
    'suporte',
    'inbound'
  ));

ALTER TABLE public.chips
  ADD COLUMN IF NOT EXISTS privado BOOLEAN NOT NULL DEFAULT false;

-- 2. Índices pra queries por dono e categoria
CREATE INDEX IF NOT EXISTS idx_chips_dono_id
  ON public.chips(dono_id)
  WHERE dono_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chips_categoria_uso
  ON public.chips(categoria_uso)
  WHERE categoria_uso IS NOT NULL;

-- 3. Backfill dono_id ← created_by (se profile existir)
UPDATE public.chips c
SET dono_id = c.created_by
WHERE c.dono_id IS NULL
  AND c.created_by IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = c.created_by);

-- 4. Backfill categoria_uso por heurística leve (NULL pro resto, admin classifica)
UPDATE public.chips
SET categoria_uso = 'prospeccao_ia'
WHERE categoria_uso IS NULL
  AND nome ILIKE '%prospec%';

UPDATE public.chips
SET categoria_uso = 'inbound'
WHERE categoria_uso IS NULL
  AND (is_trafego_pago = true OR nome ILIKE '%trafego%');

UPDATE public.chips
SET categoria_uso = 'suporte'
WHERE categoria_uso IS NULL
  AND nome ILIKE '%suporte%';

-- 5. Comentários pra contexto técnico
COMMENT ON COLUMN public.chips.dono_id IS
  'Operador responsável pelo chip. Backfill via created_by. NULL = ainda sem dono atribuído.';
COMMENT ON COLUMN public.chips.categoria_uso IS
  'Para que o chip é usado. NULL = aguarda classificação por admin via UI.';
COMMENT ON COLUMN public.chips.privado IS
  'Se true, RLS (F1.7) impede outros operadores de ver chip e suas conversas.';
