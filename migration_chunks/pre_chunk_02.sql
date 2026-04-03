-- Run this BEFORE chunk_02.sql
-- These ADD VALUE statements must be committed separately

DO $aw$ BEGIN ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'gestor_radiologia'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aberto'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aguardando_usuario'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'em_validacao'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE categoria_patrimonio ADD VALUE IF NOT EXISTS 'equipamento_hospitalar'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_licitacao ADD VALUE IF NOT EXISTS 'capitacao_de_credenciamento'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
