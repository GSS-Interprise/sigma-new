-- Add updated_at column to proposta table
ALTER TABLE public.proposta 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create trigger for automatic timestamp updates if not exists
CREATE OR REPLACE TRIGGER update_proposta_updated_at
BEFORE UPDATE ON public.proposta
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();