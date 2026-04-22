ALTER TABLE public.disparos_campanhas DROP CONSTRAINT IF EXISTS disparos_campanhas_status_check;
ALTER TABLE public.disparos_campanhas ADD CONSTRAINT disparos_campanhas_status_check
  CHECK (status = ANY (ARRAY['pendente'::text, 'em_andamento'::text, 'pausado'::text, 'agendado'::text, 'concluido'::text, 'cancelado'::text]));