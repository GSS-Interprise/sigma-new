-- Run this BEFORE chunk_09.sql
-- These ADD VALUE statements must be committed separately

ALTER TYPE public.status_licitacao ADD VALUE 'conferencia' AFTER 'edital_analise';
ALTER TYPE public.status_licitacao ADD VALUE 'suspenso_revogado' AFTER 'descarte_edital';
