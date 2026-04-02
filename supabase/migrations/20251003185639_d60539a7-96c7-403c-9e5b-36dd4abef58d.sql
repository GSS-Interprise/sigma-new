-- Add tipo_principal column to relacionamento_medico table
ALTER TABLE relacionamento_medico 
ADD COLUMN IF NOT EXISTS tipo_principal text NOT NULL DEFAULT 'Ação';

-- Update the tipo enum to include all new subtypes
ALTER TABLE relacionamento_medico 
ALTER COLUMN tipo TYPE text;

-- Add check constraint for tipo_principal
ALTER TABLE relacionamento_medico
ADD CONSTRAINT check_tipo_principal 
CHECK (tipo_principal IN ('Reclamação', 'Ação'));

COMMENT ON COLUMN relacionamento_medico.tipo_principal IS 'Tipo principal: Reclamação ou Ação';
COMMENT ON COLUMN relacionamento_medico.tipo IS 'Subtipo específico baseado no tipo_principal';