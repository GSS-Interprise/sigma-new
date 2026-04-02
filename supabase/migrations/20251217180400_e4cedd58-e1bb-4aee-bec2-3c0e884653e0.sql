-- Enable REPLICA IDENTITY FULL for licitacoes table to get old values in realtime updates
ALTER TABLE public.licitacoes REPLICA IDENTITY FULL;