-- Add responsavel_id to conversas table for assigning operators
ALTER TABLE public.conversas 
ADD COLUMN IF NOT EXISTS responsavel_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add status field for conversation tracking
ALTER TABLE public.conversas 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'aberto';