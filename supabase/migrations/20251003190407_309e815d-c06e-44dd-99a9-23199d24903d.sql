-- Add status column to relacionamento_medico table
ALTER TABLE relacionamento_medico 
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'aberta';

-- Add check constraint for status
ALTER TABLE relacionamento_medico
ADD CONSTRAINT check_status 
CHECK (status IN ('aberta', 'em_analise', 'concluida'));