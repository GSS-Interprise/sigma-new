-- Create enums for patrimonio
CREATE TYPE categoria_patrimonio AS ENUM ('equipamento', 'mobiliario', 'veiculo', 'informatica', 'outros');
CREATE TYPE estado_conservacao AS ENUM ('novo', 'usado', 'danificado', 'inservivel');
CREATE TYPE status_patrimonio AS ENUM ('ativo', 'transferido', 'baixado');

-- Create patrimonio table
CREATE TABLE public.patrimonio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_bem TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria categoria_patrimonio NOT NULL,
  localizacao TEXT,
  setor TEXT,
  responsavel TEXT,
  data_aquisicao DATE NOT NULL,
  valor_aquisicao NUMERIC(12,2) NOT NULL,
  vida_util_anos INTEGER,
  estado_conservacao estado_conservacao NOT NULL DEFAULT 'novo',
  status status_patrimonio NOT NULL DEFAULT 'ativo',
  numero_serie TEXT,
  fornecedor TEXT,
  nota_fiscal TEXT,
  observacoes TEXT,
  documentos_url TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patrimonio ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authorized users can manage patrimonio"
ON public.patrimonio
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

-- Create function to auto-generate codigo_bem
CREATE OR REPLACE FUNCTION generate_codigo_bem()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_bem FROM 'PAT-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.patrimonio;
  
  NEW.codigo_bem := 'PAT-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-generating codigo_bem
CREATE TRIGGER set_codigo_bem
BEFORE INSERT ON public.patrimonio
FOR EACH ROW
WHEN (NEW.codigo_bem IS NULL OR NEW.codigo_bem = '')
EXECUTE FUNCTION generate_codigo_bem();

-- Create trigger for updated_at
CREATE TRIGGER update_patrimonio_updated_at
BEFORE UPDATE ON public.patrimonio
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();