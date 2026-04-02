-- Adicionar coluna de chave composta única para anti-duplicação
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS chave_unica TEXT;

-- Criar função para gerar chave única
CREATE OR REPLACE FUNCTION public.generate_lead_chave_unica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Gera chave apenas se nome e data_nascimento estão preenchidos
  IF NEW.nome IS NOT NULL AND NEW.data_nascimento IS NOT NULL THEN
    NEW.chave_unica := LOWER(TRIM(NEW.nome)) || '_' || NEW.data_nascimento;
  ELSE
    NEW.chave_unica := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Criar trigger para INSERT e UPDATE
DROP TRIGGER IF EXISTS trigger_lead_chave_unica ON public.leads;
CREATE TRIGGER trigger_lead_chave_unica
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.generate_lead_chave_unica();

-- Atualizar registros existentes (duplicados já removidos)
UPDATE public.leads
SET chave_unica = LOWER(TRIM(nome)) || '_' || data_nascimento
WHERE nome IS NOT NULL AND data_nascimento IS NOT NULL;

-- Criar índice único na chave composta
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_chave_unica 
ON public.leads (chave_unica) 
WHERE chave_unica IS NOT NULL;

-- Comentário para documentação
COMMENT ON COLUMN public.leads.chave_unica IS 'Chave composta única: nome_lowercase + data_nascimento para identificação anti-duplicação';