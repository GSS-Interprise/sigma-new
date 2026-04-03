-- Run this BEFORE chunk_04.sql
-- These ADD VALUE statements must be committed separately

DO $aw$ BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'externos'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_documento_medico ADD VALUE IF NOT EXISTS 'link_externo'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'lideres'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE public.tipo_documento_medico ADD VALUE IF NOT EXISTS 'contrato_aditivo'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
