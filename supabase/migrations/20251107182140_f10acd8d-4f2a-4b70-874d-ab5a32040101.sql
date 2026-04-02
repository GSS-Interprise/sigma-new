-- Criar enum para motivos de ausência
CREATE TYPE public.motivo_ausencia AS ENUM (
  'ferias',
  'atestado_medico',
  'congresso',
  'viagem',
  'folga',
  'outro'
);

-- Tabela de ausências de médicos
CREATE TABLE public.medico_ausencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  motivo public.motivo_ausencia NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  medico_substituto_id UUID REFERENCES public.medicos(id) ON DELETE SET NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.medico_ausencias ENABLE ROW LEVEL SECURITY;

-- Política para visualizar ausências
CREATE POLICY "Usuários autenticados podem ver ausências"
ON public.medico_ausencias
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Política para gerenciar ausências
CREATE POLICY "Gestores podem gerenciar ausências"
ON public.medico_ausencias
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos') OR
  has_role(auth.uid(), 'coordenador_escalas')
);

-- Tabela de remuneração de médicos
CREATE TABLE public.medico_remuneracao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  exame_servico TEXT NOT NULL,
  valor NUMERIC(10, 2) NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.medico_remuneracao ENABLE ROW LEVEL SECURITY;

-- Política para visualizar remuneração
CREATE POLICY "Usuários autenticados podem ver remuneração"
ON public.medico_remuneracao
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Política para gerenciar remuneração
CREATE POLICY "Gestores podem gerenciar remuneração"
ON public.medico_remuneracao
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos') OR
  has_role(auth.uid(), 'gestor_financeiro')
);

-- Tabela para escalas geradas a partir das agendas
CREATE TABLE public.radiologia_agendas_escalas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id UUID NOT NULL REFERENCES public.radiologia_agendas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  total_horas NUMERIC(5, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  concluido BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.radiologia_agendas_escalas ENABLE ROW LEVEL SECURITY;

-- Política para gerenciar escalas
CREATE POLICY "Gestores podem gerenciar escalas"
ON public.radiologia_agendas_escalas
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_radiologia')
);

-- Adicionar campos à tabela radiologia_agendas
ALTER TABLE public.radiologia_agendas 
ADD COLUMN exame_servico TEXT,
ADD COLUMN data_inicio DATE,
ADD COLUMN data_fim DATE,
ADD COLUMN total_horas_dia NUMERIC(5, 2);

-- Atualizar registros existentes
UPDATE public.radiologia_agendas 
SET data_inicio = data_agenda,
    data_fim = data_agenda
WHERE data_inicio IS NULL;

-- Tabela para comparação de produção (hospital vs GSS)
CREATE TABLE public.radiologia_producao_comparacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE NOT NULL,
  exames_hospital INTEGER NOT NULL DEFAULT 0,
  exames_gss INTEGER NOT NULL DEFAULT 0,
  diferenca INTEGER GENERATED ALWAYS AS (exames_gss - exames_hospital) STORED,
  status TEXT NOT NULL DEFAULT 'pendente',
  arquivo_hospital_url TEXT,
  arquivo_gss_url TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.radiologia_producao_comparacao ENABLE ROW LEVEL SECURITY;

-- Política para gerenciar comparações
CREATE POLICY "Gestores podem gerenciar comparações"
ON public.radiologia_producao_comparacao
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_radiologia')
);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_medico_ausencias_updated_at
BEFORE UPDATE ON public.medico_ausencias
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_medico_remuneracao_updated_at
BEFORE UPDATE ON public.medico_remuneracao
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_radiologia_agendas_escalas_updated_at
BEFORE UPDATE ON public.radiologia_agendas_escalas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_radiologia_producao_comparacao_updated_at
BEFORE UPDATE ON public.radiologia_producao_comparacao
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();