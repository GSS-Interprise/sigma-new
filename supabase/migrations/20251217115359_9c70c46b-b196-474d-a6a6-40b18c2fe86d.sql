-- Add reply_to_id field for message replies
ALTER TABLE public.comunicacao_mensagens 
ADD COLUMN reply_to_id uuid REFERENCES public.comunicacao_mensagens(id) ON DELETE SET NULL;

-- Create index for faster reply lookups
CREATE INDEX idx_comunicacao_mensagens_reply_to ON public.comunicacao_mensagens(reply_to_id);