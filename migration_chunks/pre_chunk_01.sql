-- Run this BEFORE chunk_01.sql
-- These ADD VALUE statements must be committed separately

DO $aw$ BEGIN ALTER TYPE status_assinatura_contrato ADD VALUE IF NOT EXISTS 'Em Análise'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_assinatura_contrato ADD VALUE IF NOT EXISTS 'Aguardando Retorno'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
