-- Adicionar novo role para radiologia (será usado em migration posterior)
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'gestor_radiologia';