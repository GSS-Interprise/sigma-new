-- Run this BEFORE chunk_07.sql
-- These ADD VALUE statements must be committed separately

DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'desconvertido_para_lead'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor_ages'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
