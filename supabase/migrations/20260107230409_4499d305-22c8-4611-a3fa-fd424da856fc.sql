-- Remover o CHECK constraint atual
ALTER TABLE public.disparos_contatos DROP CONSTRAINT IF EXISTS disparos_contatos_status_check;

-- Atualizar os registros existentes para os novos status
UPDATE public.disparos_contatos SET status = '1-ENVIAR' WHERE status NOT IN ('1-ENVIAR', '2-REENVIAR', '3-TRATANDO', '4-ENVIADO', '5-NOZAP', '6-BLOQUEADORA');

-- Adicionar novo CHECK constraint com os status corretos
ALTER TABLE public.disparos_contatos 
ADD CONSTRAINT disparos_contatos_status_check 
CHECK (status IN ('1-ENVIAR', '2-REENVIAR', '3-TRATANDO', '4-ENVIADO', '5-NOZAP', '6-BLOQUEADORA'));

-- Atualizar o default para 1-ENVIAR
ALTER TABLE public.disparos_contatos ALTER COLUMN status SET DEFAULT '1-ENVIAR';