-- Adicionar mais campos ao ages_leads para ficar igual ao GSS
ALTER TABLE public.ages_leads 
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS rg TEXT,
ADD COLUMN IF NOT EXISTS data_nascimento DATE,
ADD COLUMN IF NOT EXISTS endereco TEXT,
ADD COLUMN IF NOT EXISTS cep TEXT,
ADD COLUMN IF NOT EXISTS registro_profissional TEXT,
ADD COLUMN IF NOT EXISTS banco TEXT,
ADD COLUMN IF NOT EXISTS agencia TEXT,
ADD COLUMN IF NOT EXISTS conta_corrente TEXT,
ADD COLUMN IF NOT EXISTS chave_pix TEXT,
ADD COLUMN IF NOT EXISTS telefones_adicionais TEXT[],
ADD COLUMN IF NOT EXISTS modalidade_contrato TEXT,
ADD COLUMN IF NOT EXISTS local_prestacao_servico TEXT,
ADD COLUMN IF NOT EXISTS data_inicio_contrato DATE,
ADD COLUMN IF NOT EXISTS valor_contrato NUMERIC,
ADD COLUMN IF NOT EXISTS especificacoes_contrato TEXT;

-- Criar tabela de histórico para ages_leads
CREATE TABLE IF NOT EXISTS public.ages_lead_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.ages_leads(id) ON DELETE CASCADE,
  tipo_evento TEXT NOT NULL,
  descricao_resumida TEXT NOT NULL,
  dados_anteriores JSONB,
  dados_novos JSONB,
  campos_alterados TEXT[],
  usuario_id UUID,
  usuario_nome TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de anexos para ages_leads
CREATE TABLE IF NOT EXISTS public.ages_lead_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.ages_leads(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  tipo_documento TEXT,
  observacoes TEXT,
  uploaded_by UUID,
  uploaded_by_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ages_lead_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_lead_anexos ENABLE ROW LEVEL SECURITY;

-- Policies para histórico
CREATE POLICY "Users can view ages lead historico" 
ON public.ages_lead_historico 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert ages lead historico" 
ON public.ages_lead_historico 
FOR INSERT 
WITH CHECK (true);

-- Policies para anexos
CREATE POLICY "Users can view ages lead anexos" 
ON public.ages_lead_anexos 
FOR SELECT 
USING (true);

CREATE POLICY "Users can insert ages lead anexos" 
ON public.ages_lead_anexos 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update ages lead anexos" 
ON public.ages_lead_anexos 
FOR UPDATE 
USING (true);

CREATE POLICY "Users can delete ages lead anexos" 
ON public.ages_lead_anexos 
FOR DELETE 
USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ages_lead_historico_lead_id ON public.ages_lead_historico(lead_id);
CREATE INDEX IF NOT EXISTS idx_ages_lead_anexos_lead_id ON public.ages_lead_anexos(lead_id);