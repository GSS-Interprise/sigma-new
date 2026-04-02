-- Adicionar campo tipo_disparo nas tabelas de disparos
ALTER TABLE disparos_programados 
ADD COLUMN IF NOT EXISTS tipo_disparo TEXT DEFAULT 'whatsapp' CHECK (tipo_disparo IN ('whatsapp', 'email'));

ALTER TABLE disparos_log 
ADD COLUMN IF NOT EXISTS tipo_disparo TEXT DEFAULT 'whatsapp' CHECK (tipo_disparo IN ('whatsapp', 'email'));

-- Adicionar campos específicos para email
ALTER TABLE disparos_programados
ADD COLUMN IF NOT EXISTS assunto_email TEXT,
ADD COLUMN IF NOT EXISTS corpo_email TEXT;

ALTER TABLE disparos_log
ADD COLUMN IF NOT EXISTS assunto_email TEXT,
ADD COLUMN IF NOT EXISTS corpo_email TEXT;