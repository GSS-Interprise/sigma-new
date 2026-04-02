-- Adicionar o role 'externos' ao enum app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'externos';