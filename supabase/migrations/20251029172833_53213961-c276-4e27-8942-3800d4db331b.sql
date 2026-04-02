-- Create unidades table
CREATE TABLE IF NOT EXISTS public.unidades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codigo TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(cliente_id, nome)
);

-- Create tipo_contratacao enum
CREATE TYPE tipo_contratacao AS ENUM (
  'credenciamento',
  'licitacao',
  'dispensa',
  'direta_privada'
);

-- Add unidade_id and tipo_contratacao to contratos table
ALTER TABLE public.contratos 
ADD COLUMN IF NOT EXISTS unidade_id UUID REFERENCES public.unidades(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS tipo_contratacao tipo_contratacao;

-- Create unique constraint for cliente_id + unidade_id + codigo_contrato
CREATE UNIQUE INDEX IF NOT EXISTS contratos_cliente_unidade_codigo_unique 
ON public.contratos(cliente_id, unidade_id, codigo_contrato) 
WHERE unidade_id IS NOT NULL AND codigo_contrato IS NOT NULL;

-- Create medico_vinculo_unidade table for doctor-unit-contract relationships
CREATE TABLE IF NOT EXISTS public.medico_vinculo_unidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  unidade_id UUID NOT NULL REFERENCES public.unidades(id) ON DELETE CASCADE,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
  data_inicio DATE,
  data_fim DATE,
  status TEXT DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medico_vinculo_unidade ENABLE ROW LEVEL SECURITY;

-- RLS policies for unidades
CREATE POLICY "Authorized users can manage unidades"
ON public.unidades
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

CREATE POLICY "Gestores de radiologia podem visualizar unidades"
ON public.unidades
FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- RLS policies for medico_vinculo_unidade
CREATE POLICY "Authorized users can manage medico_vinculo_unidade"
ON public.medico_vinculo_unidade
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

CREATE POLICY "Coordenadores can view medico_vinculo_unidade"
ON public.medico_vinculo_unidade
FOR SELECT
USING (has_role(auth.uid(), 'coordenador_escalas'::app_role));

-- Data migration: Create "Unidade Principal" for each existing client
INSERT INTO public.unidades (cliente_id, nome, codigo)
SELECT id, 'Unidade Principal', 'UP001'
FROM public.clientes
WHERE NOT EXISTS (
  SELECT 1 FROM public.unidades WHERE unidades.cliente_id = clientes.id
);

-- Update existing contratos to point to "Unidade Principal"
UPDATE public.contratos c
SET unidade_id = (
  SELECT u.id FROM public.unidades u 
  WHERE u.cliente_id = c.cliente_id 
  AND u.nome = 'Unidade Principal'
  LIMIT 1
)
WHERE c.unidade_id IS NULL AND c.cliente_id IS NOT NULL;

-- Migrate existing medico vinculations to medico_vinculo_unidade
INSERT INTO public.medico_vinculo_unidade (
  medico_id, 
  cliente_id, 
  unidade_id, 
  contrato_id,
  status
)
SELECT 
  m.id as medico_id,
  m.cliente_vinculado_id as cliente_id,
  u.id as unidade_id,
  c.id as contrato_id,
  m.status_contrato as status
FROM public.medicos m
JOIN public.unidades u ON u.cliente_id = m.cliente_vinculado_id AND u.nome = 'Unidade Principal'
LEFT JOIN public.contratos c ON c.cliente_id = m.cliente_vinculado_id AND c.medico_id = m.id
WHERE m.cliente_vinculado_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM public.medico_vinculo_unidade mvu 
  WHERE mvu.medico_id = m.id AND mvu.cliente_id = m.cliente_vinculado_id
);

-- Add updated_at trigger for new tables
CREATE TRIGGER update_unidades_updated_at
BEFORE UPDATE ON public.unidades
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_medico_vinculo_unidade_updated_at
BEFORE UPDATE ON public.medico_vinculo_unidade
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();