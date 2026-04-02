
-- 1. Limpar leads com CPF duplicado (manter o mais recente por updated_at)
DELETE FROM public.leads a
USING public.leads b
WHERE a.id != b.id
  AND a.cpf IS NOT NULL AND TRIM(a.cpf) != ''
  AND b.cpf IS NOT NULL AND TRIM(b.cpf) != ''
  AND REGEXP_REPLACE(a.cpf, '[^0-9]', '', 'g') = REGEXP_REPLACE(b.cpf, '[^0-9]', '', 'g')
  AND a.updated_at < b.updated_at;

-- 2. Criar tabela especialidades normalizada
CREATE TABLE public.especialidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Especialidades são visíveis por todos autenticados"
  ON public.especialidades FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins podem gerenciar especialidades"
  ON public.especialidades FOR ALL
  USING (public.is_admin(auth.uid()));

-- 3. Popular com dados existentes
INSERT INTO public.especialidades (nome)
SELECT DISTINCT UPPER(TRIM(especialidade))
FROM public.leads
WHERE especialidade IS NOT NULL AND TRIM(especialidade) != ''
ON CONFLICT (nome) DO NOTHING;

-- 4. Adicionar FK na tabela leads
ALTER TABLE public.leads ADD COLUMN especialidade_id UUID REFERENCES public.especialidades(id);
CREATE INDEX idx_leads_especialidade_id ON public.leads (especialidade_id);

-- 5. Dropar triggers de user-land temporariamente
DROP TRIGGER IF EXISTS trigger_lead_chave_unica ON public.leads;
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
DROP TRIGGER IF EXISTS validate_lead_status_trigger ON public.leads;

-- 6. Preencher especialidade_id
UPDATE public.leads l
SET especialidade_id = e.id
FROM public.especialidades e
WHERE UPPER(TRIM(l.especialidade)) = e.nome
  AND l.especialidade IS NOT NULL
  AND TRIM(l.especialidade) != '';

-- 7. Recriar triggers
CREATE TRIGGER trigger_lead_chave_unica
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.generate_lead_chave_unica();

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER validate_lead_status_trigger
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.validate_lead_status();

-- 8. Índices para SELECT DISTINCT
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_origem ON public.leads (origem) WHERE origem IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_uf ON public.leads (uf) WHERE uf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_cidade ON public.leads (cidade) WHERE cidade IS NOT NULL;
