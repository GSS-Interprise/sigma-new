-- Adiciona "equipamento_hospitalar" ao enum categoria_patrimonio
ALTER TYPE categoria_patrimonio ADD VALUE IF NOT EXISTS 'equipamento_hospitalar';