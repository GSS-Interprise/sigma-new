-- Tornar campos opcionais para permitir importação de dados individuais de exames
ALTER TABLE radiologia_pendencias 
  ALTER COLUMN cliente_id DROP NOT NULL,
  ALTER COLUMN medico_id DROP NOT NULL,
  ALTER COLUMN segmento DROP NOT NULL,
  ALTER COLUMN data_referencia DROP NOT NULL,
  ALTER COLUMN quantidade_pendente DROP NOT NULL;