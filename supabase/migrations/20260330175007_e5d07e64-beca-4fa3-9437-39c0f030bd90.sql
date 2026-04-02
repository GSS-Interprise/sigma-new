
-- Config table for hourly rates per tipo_plantao/setor
CREATE TABLE public.financeiro_config_valores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  descricao TEXT NOT NULL,
  tipo_plantao TEXT,
  setor TEXT,
  unidade_id UUID REFERENCES public.unidades(id),
  valor_hora NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consolidated payments per doctor per period
CREATE TABLE public.financeiro_pagamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_nome TEXT NOT NULL,
  profissional_id_externo TEXT,
  profissional_crm TEXT,
  mes_referencia INTEGER NOT NULL,
  ano_referencia INTEGER NOT NULL,
  unidade TEXT,
  total_plantoes INTEGER NOT NULL DEFAULT 0,
  total_horas_minutos INTEGER NOT NULL DEFAULT 0,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  data_vencimento DATE,
  data_pagamento DATE,
  observacoes TEXT,
  gerado_por UUID,
  integration_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profissional_id_externo, mes_referencia, ano_referencia, unidade)
);

-- Individual shifts linked to a payment
CREATE TABLE public.financeiro_pagamento_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pagamento_id UUID NOT NULL REFERENCES public.financeiro_pagamentos(id) ON DELETE CASCADE,
  escala_integrada_id UUID REFERENCES public.escalas_integradas(id),
  data_plantao DATE NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  carga_horaria_minutos INTEGER,
  setor TEXT,
  local_nome TEXT,
  valor_hora NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financeiro_config_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_pagamento_itens ENABLE ROW LEVEL SECURITY;

-- RLS policies - authenticated users can read, admins can write
CREATE POLICY "Authenticated users can read config_valores" ON public.financeiro_config_valores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage config_valores" ON public.financeiro_config_valores FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can read pagamentos" ON public.financeiro_pagamentos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage pagamentos" ON public.financeiro_pagamentos FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can read pagamento_itens" ON public.financeiro_pagamento_itens FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage pagamento_itens" ON public.financeiro_pagamento_itens FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_financeiro_config_valores_updated_at BEFORE UPDATE ON public.financeiro_config_valores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_financeiro_pagamentos_updated_at BEFORE UPDATE ON public.financeiro_pagamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
