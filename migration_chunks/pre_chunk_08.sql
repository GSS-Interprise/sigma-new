-- Run this BEFORE chunk_08.sql
-- These ADD VALUE statements must be committed separately

DO $aw$ BEGIN ALTER TYPE public.tipo_evento_lead ADD VALUE IF NOT EXISTS 'reprocessado_kanban'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
