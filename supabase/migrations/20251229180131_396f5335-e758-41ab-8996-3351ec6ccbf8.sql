-- Primeiro: Adicionar o novo role ao enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor_ages';