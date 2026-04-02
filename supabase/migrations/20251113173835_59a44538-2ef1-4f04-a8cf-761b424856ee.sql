-- Adicionar gestor_marketing ao enum app_role
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'gestor_marketing';