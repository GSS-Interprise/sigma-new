-- Adicionar novo status "aguardando_confirmacao" ao enum status_ticket
ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aguardando_confirmacao';

-- Adicionar novo status "resolvido" ao enum status_ticket  
ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'resolvido';