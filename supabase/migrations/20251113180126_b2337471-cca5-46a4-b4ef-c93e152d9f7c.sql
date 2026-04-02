-- Adicionar novos campos à tabela radiologia_pendencias para suportar importação Excel
ALTER TABLE public.radiologia_pendencias 
ADD COLUMN IF NOT EXISTS data_exame DATE,
ADD COLUMN IF NOT EXISTS hora_exame TIME,
ADD COLUMN IF NOT EXISTS nome_paciente TEXT,
ADD COLUMN IF NOT EXISTS prioridade TEXT,
ADD COLUMN IF NOT EXISTS atribuido_a TEXT,
ADD COLUMN IF NOT EXISTS tipo_atendimento TEXT,
ADD COLUMN IF NOT EXISTS descricao_exame TEXT,
ADD COLUMN IF NOT EXISTS id_paciente TEXT,
ADD COLUMN IF NOT EXISTS numero_imagens INTEGER,
ADD COLUMN IF NOT EXISTS acesso TEXT UNIQUE, -- Campo chave para evitar duplicatas
ADD COLUMN IF NOT EXISTS modalidade TEXT,
ADD COLUMN IF NOT EXISTS ae_origem TEXT,
ADD COLUMN IF NOT EXISTS data_nascimento DATE,
ADD COLUMN IF NOT EXISTS medico_prescritor TEXT,
ADD COLUMN IF NOT EXISTS nota TEXT,
ADD COLUMN IF NOT EXISTS tempo_decorrido TEXT,
ADD COLUMN IF NOT EXISTS arquivo_importacao TEXT,
ADD COLUMN IF NOT EXISTS data_importacao TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS importado_por UUID REFERENCES auth.users(id);

-- Criar índice no campo acesso para busca rápida
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_acesso ON public.radiologia_pendencias(acesso);

-- Criar tabela para histórico de importações
CREATE TABLE IF NOT EXISTS public.radiologia_importacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  arquivo_nome TEXT NOT NULL,
  total_linhas INTEGER NOT NULL,
  linhas_inseridas INTEGER NOT NULL,
  linhas_atualizadas INTEGER NOT NULL,
  linhas_erro INTEGER NOT NULL,
  erros JSONB,
  importado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS na tabela de importações
ALTER TABLE public.radiologia_importacoes ENABLE ROW LEVEL SECURITY;

-- Política RLS para importações
CREATE POLICY "Usuários autorizados podem ver importações"
  ON public.radiologia_importacoes
  FOR SELECT
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_radiologia'::app_role) OR
    has_role(auth.uid(), 'gestor_contratos'::app_role)
  );

CREATE POLICY "Usuários autorizados podem criar importações"
  ON public.radiologia_importacoes
  FOR INSERT
  WITH CHECK (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_radiologia'::app_role) OR
    has_role(auth.uid(), 'gestor_contratos'::app_role)
  );

-- Trigger para updated_at
CREATE TRIGGER update_radiologia_importacoes_updated_at
  BEFORE UPDATE ON public.radiologia_importacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();