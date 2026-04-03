-- Run this BEFORE chunk_03.sql
-- These ADD VALUE statements must be committed separately

DO $aw$ BEGIN ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aguardando_confirmacao'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'resolvido'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'gestor_marketing'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
