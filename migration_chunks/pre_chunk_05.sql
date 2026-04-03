-- Run this BEFORE chunk_05.sql
-- These ADD VALUE statements must be committed separately

DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'status_alterado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'enviado_acompanhamento'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_criado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_editado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_qualificado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'em_resposta'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_descartado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
