-- WS2: janela horária por campanha (disparo só 07-17h dias úteis, default)
-- Aplicada via Management API antes do deploy do processor.
ALTER TABLE campanhas
  ADD COLUMN IF NOT EXISTS horario_inicio_brt smallint DEFAULT 7  CHECK (horario_inicio_brt BETWEEN 0 AND 23),
  ADD COLUMN IF NOT EXISTS horario_fim_brt    smallint DEFAULT 17 CHECK (horario_fim_brt BETWEEN 1 AND 24),
  ADD COLUMN IF NOT EXISTS dias_semana smallint[] DEFAULT ARRAY[1,2,3,4,5] CHECK (dias_semana <@ ARRAY[1,2,3,4,5,6,7]),
  ADD COLUMN IF NOT EXISTS horario_inteligente_ativo boolean DEFAULT true;

-- Backfill: ativar janela nas campanhas IA existentes
UPDATE campanhas SET horario_inteligente_ativo = true WHERE tipo_envio = 'ia' AND horario_inteligente_ativo IS DISTINCT FROM true;
