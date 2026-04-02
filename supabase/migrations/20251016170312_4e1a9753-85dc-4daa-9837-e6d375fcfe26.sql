-- Tabela para armazenar tokens de API
CREATE TABLE IF NOT EXISTS public.api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Index para busca rápida por token
CREATE INDEX idx_api_tokens_token ON public.api_tokens(token) WHERE ativo = true;

-- RLS para api_tokens
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api_tokens"
ON public.api_tokens
FOR ALL
USING (is_admin(auth.uid()));

-- Função para validar token de API
CREATE OR REPLACE FUNCTION public.validate_api_token(_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_id UUID;
BEGIN
  SELECT id INTO token_id
  FROM public.api_tokens
  WHERE token = _token
    AND ativo = true
    AND (expires_at IS NULL OR expires_at > now());
  
  IF token_id IS NOT NULL THEN
    UPDATE public.api_tokens
    SET last_used_at = now()
    WHERE id = token_id;
  END IF;
  
  RETURN token_id;
END;
$$;