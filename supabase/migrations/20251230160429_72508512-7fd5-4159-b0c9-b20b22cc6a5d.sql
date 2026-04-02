-- Tabela de contratos Dr. Escala (estrutura igual a contratos)
CREATE TABLE public.contratos_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_interno SERIAL,
  codigo_contrato TEXT,
  cliente_id UUID REFERENCES public.clientes(id),
  unidade_id UUID REFERENCES public.unidades(id),
  medico_id UUID REFERENCES public.medicos(id),
  licitacao_origem_id UUID REFERENCES public.licitacoes(id),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  data_termino DATE,
  prazo_meses INTEGER,
  valor_estimado NUMERIC,
  tipo_servico TEXT[],
  tipo_contratacao TEXT,
  especialidade_contrato TEXT,
  objeto_contrato TEXT,
  condicao_pagamento TEXT,
  documento_url TEXT,
  status_contrato TEXT DEFAULT 'Ativo',
  assinado TEXT DEFAULT 'Pendente',
  motivo_pendente TEXT,
  dias_aviso_vencimento INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de contratos Dr. Oportunidade (estrutura igual a contratos)
CREATE TABLE public.contratos_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_interno SERIAL,
  codigo_contrato TEXT,
  cliente_id UUID REFERENCES public.clientes(id),
  unidade_id UUID REFERENCES public.unidades(id),
  medico_id UUID REFERENCES public.medicos(id),
  licitacao_origem_id UUID REFERENCES public.licitacoes(id),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  data_termino DATE,
  prazo_meses INTEGER,
  valor_estimado NUMERIC,
  tipo_servico TEXT[],
  tipo_contratacao TEXT,
  especialidade_contrato TEXT,
  objeto_contrato TEXT,
  condicao_pagamento TEXT,
  documento_url TEXT,
  status_contrato TEXT DEFAULT 'Ativo',
  assinado TEXT DEFAULT 'Pendente',
  motivo_pendente TEXT,
  dias_aviso_vencimento INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Anexos Dr. Escala
CREATE TABLE public.contrato_anexos_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Anexos Dr. Oportunidade
CREATE TABLE public.contrato_anexos_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Aditivos tempo Dr. Escala
CREATE TABLE public.contrato_aditivos_tempo_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_termino DATE NOT NULL,
  prazo_meses INTEGER NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Aditivos tempo Dr. Oportunidade
CREATE TABLE public.contrato_aditivos_tempo_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_termino DATE NOT NULL,
  prazo_meses INTEGER NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contratos_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_dr_oportunidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_anexos_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_anexos_dr_oportunidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_aditivos_tempo_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_aditivos_tempo_dr_oportunidade ENABLE ROW LEVEL SECURITY;

-- Policies para usuários autenticados
CREATE POLICY "Authenticated users can view contratos_dr_escala" ON public.contratos_dr_escala FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contratos_dr_escala" ON public.contratos_dr_escala FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contratos_dr_escala" ON public.contratos_dr_escala FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contratos_dr_escala" ON public.contratos_dr_escala FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR DELETE TO authenticated USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_contratos_dr_escala_updated_at BEFORE UPDATE ON public.contratos_dr_escala FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contratos_dr_oportunidade_updated_at BEFORE UPDATE ON public.contratos_dr_oportunidade FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contrato_aditivos_tempo_dr_escala_updated_at BEFORE UPDATE ON public.contrato_aditivos_tempo_dr_escala FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contrato_aditivos_tempo_dr_oportunidade_updated_at BEFORE UPDATE ON public.contrato_aditivos_tempo_dr_oportunidade FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();