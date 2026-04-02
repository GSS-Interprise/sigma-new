-- Enums para Radiologia
CREATE TYPE segmento_radiologia AS ENUM ('RX', 'TC', 'US', 'RM', 'MM');
CREATE TYPE motivo_ajuste_laudo AS ENUM ('Erro de digitação', 'Informação clínica incompleta', 'Padrão fora do protocolo', 'Solicitado pelo cliente', 'Outro');
CREATE TYPE status_ajuste_laudo AS ENUM ('Pendente', 'Em Ajuste', 'Ajustado');
CREATE TYPE motivo_indisponibilidade AS ENUM ('Viagem', 'Férias', 'Motivos pessoais', 'Problemas de saúde');

-- Tabela: radiologia_agendas
CREATE TABLE public.radiologia_agendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  data_agenda DATE NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela: radiologia_producao_exames
CREATE TABLE public.radiologia_producao_exames (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  segmento segmento_radiologia NOT NULL,
  data DATE NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela: radiologia_pendencias
CREATE TABLE public.radiologia_pendencias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  segmento segmento_radiologia NOT NULL,
  data_referencia DATE NOT NULL,
  quantidade_pendente INTEGER NOT NULL CHECK (quantidade_pendente >= 0),
  observacoes TEXT,
  anexos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela: radiologia_ajuste_laudos
CREATE TABLE public.radiologia_ajuste_laudos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  medico_responsavel_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  segmento segmento_radiologia NOT NULL,
  identificador_laudo TEXT NOT NULL,
  data_emissao DATE NOT NULL,
  motivo_ajuste motivo_ajuste_laudo NOT NULL,
  descricao_ajuste TEXT NOT NULL,
  status status_ajuste_laudo NOT NULL DEFAULT 'Pendente',
  responsavel_ajuste_id UUID REFERENCES public.medicos(id),
  prazo_ajuste TIMESTAMP WITH TIME ZONE,
  anexos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela: radiologia_exames_atraso
CREATE TABLE public.radiologia_exames_atraso (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  exame TEXT NOT NULL,
  segmento segmento_radiologia NOT NULL,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  data_hora_execucao TIMESTAMP WITH TIME ZONE NOT NULL,
  observacao TEXT,
  anexos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela: radiologia_ecg
CREATE TABLE public.radiologia_ecg (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  paciente TEXT NOT NULL,
  data_hora_liberacao TIMESTAMP WITH TIME ZONE NOT NULL,
  anexos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela: medico_indisponibilidades
CREATE TABLE public.medico_indisponibilidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  motivo motivo_indisponibilidade NOT NULL,
  inicio TIMESTAMP WITH TIME ZONE NOT NULL,
  fim TIMESTAMP WITH TIME ZONE NOT NULL,
  detalhes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CHECK (fim >= inicio)
);

-- Enable RLS
ALTER TABLE public.radiologia_agendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_producao_exames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_pendencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_ajuste_laudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_exames_atraso ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_ecg ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medico_indisponibilidades ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin e gestor_contratos podem gerenciar, outros apenas leitura)
CREATE POLICY "Authorized users can manage radiologia_agendas" ON public.radiologia_agendas
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

CREATE POLICY "Authorized users can manage radiologia_producao_exames" ON public.radiologia_producao_exames
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

CREATE POLICY "Authorized users can manage radiologia_pendencias" ON public.radiologia_pendencias
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

CREATE POLICY "Authorized users can manage radiologia_ajuste_laudos" ON public.radiologia_ajuste_laudos
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

CREATE POLICY "Authorized users can manage radiologia_exames_atraso" ON public.radiologia_exames_atraso
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

CREATE POLICY "Authorized users can manage radiologia_ecg" ON public.radiologia_ecg
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

CREATE POLICY "Authorized users can manage medico_indisponibilidades" ON public.medico_indisponibilidades
  FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role));

-- Triggers para updated_at
CREATE TRIGGER update_radiologia_agendas_updated_at
  BEFORE UPDATE ON public.radiologia_agendas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_radiologia_producao_exames_updated_at
  BEFORE UPDATE ON public.radiologia_producao_exames
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_radiologia_pendencias_updated_at
  BEFORE UPDATE ON public.radiologia_pendencias
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_radiologia_ajuste_laudos_updated_at
  BEFORE UPDATE ON public.radiologia_ajuste_laudos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_radiologia_exames_atraso_updated_at
  BEFORE UPDATE ON public.radiologia_exames_atraso
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_radiologia_ecg_updated_at
  BEFORE UPDATE ON public.radiologia_ecg
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_medico_indisponibilidades_updated_at
  BEFORE UPDATE ON public.medico_indisponibilidades
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();