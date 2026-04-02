-- Criar tabela de itens para Dr. Escala
CREATE TABLE public.contrato_itens_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  valor_item NUMERIC(15,2) NOT NULL,
  quantidade INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de itens para Dr. Oportunidade
CREATE TABLE public.contrato_itens_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  valor_item NUMERIC(15,2) NOT NULL,
  quantidade INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de renovações para Dr. Escala
CREATE TABLE public.contrato_renovacoes_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC(5,2),
  valor NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de renovações para Dr. Oportunidade
CREATE TABLE public.contrato_renovacoes_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC(5,2),
  valor NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contrato_itens_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_itens_dr_oportunidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_renovacoes_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_renovacoes_dr_oportunidade ENABLE ROW LEVEL SECURITY;

-- RLS Policies para itens Dr. Escala
CREATE POLICY "Authenticated users can view itens dr escala" 
ON public.contrato_itens_dr_escala FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert itens dr escala" 
ON public.contrato_itens_dr_escala FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update itens dr escala" 
ON public.contrato_itens_dr_escala FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete itens dr escala" 
ON public.contrato_itens_dr_escala FOR DELETE TO authenticated USING (true);

-- RLS Policies para itens Dr. Oportunidade
CREATE POLICY "Authenticated users can view itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR DELETE TO authenticated USING (true);

-- RLS Policies para renovações Dr. Escala
CREATE POLICY "Authenticated users can view renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR DELETE TO authenticated USING (true);

-- RLS Policies para renovações Dr. Oportunidade
CREATE POLICY "Authenticated users can view renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR DELETE TO authenticated USING (true);