-- Adicionar campos para vincular ajustes às pendências importadas
ALTER TABLE radiologia_ajuste_laudos
ADD COLUMN IF NOT EXISTS pendencia_id UUID REFERENCES radiologia_pendencias(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS nome_paciente TEXT,
ADD COLUMN IF NOT EXISTS cod_acesso TEXT;

-- Índice para busca por pendência
CREATE INDEX IF NOT EXISTS idx_radiologia_ajuste_laudos_pendencia_id ON radiologia_ajuste_laudos(pendencia_id);

-- Índice para busca por código de acesso
CREATE INDEX IF NOT EXISTS idx_radiologia_ajuste_laudos_cod_acesso ON radiologia_ajuste_laudos(cod_acesso);