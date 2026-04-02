-- Adicionar coluna assunto_email na tabela email_campanhas
ALTER TABLE public.email_campanhas 
ADD COLUMN IF NOT EXISTS assunto_email TEXT;