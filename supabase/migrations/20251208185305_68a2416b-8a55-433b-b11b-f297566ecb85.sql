-- Add missing fields to leads table to match medicos kanban card structure
ALTER TABLE public.leads
ADD COLUMN IF NOT EXISTS cpf text,
ADD COLUMN IF NOT EXISTS crm text,
ADD COLUMN IF NOT EXISTS data_nascimento date;