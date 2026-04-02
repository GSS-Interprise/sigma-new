-- Add new event types to track all lead status changes
ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'status_alterado';
ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'enviado_acompanhamento';
ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_criado';
ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_editado';
ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_qualificado';
ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'em_resposta';
ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_descartado';