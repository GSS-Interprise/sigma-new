-- Adicionar novo tipo de evento para reprocessamento de médico no Kanban
ALTER TYPE public.tipo_evento_lead ADD VALUE IF NOT EXISTS 'reprocessado_kanban';