-- Create centros_custo table
CREATE TABLE public.centros_custo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  codigo_interno TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;

-- RLS Policies for centros_custo
CREATE POLICY "Authenticated users can view centros_custo"
ON public.centros_custo
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage centros_custo"
ON public.centros_custo
FOR ALL
USING (is_admin(auth.uid()));

-- Create setores table
CREATE TABLE public.setores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  centro_custo_id UUID NOT NULL REFERENCES public.centros_custo(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;

-- RLS Policies for setores
CREATE POLICY "Authenticated users can view setores"
ON public.setores
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage setores"
ON public.setores
FOR ALL
USING (is_admin(auth.uid()));

-- Insert default centros_custo
INSERT INTO public.centros_custo (nome) VALUES
  ('Financeiro'),
  ('Contratos'),
  ('Licitações'),
  ('Radiologia'),
  ('Tecnologia da Informação'),
  ('Escalas'),
  ('Direção'),
  ('Prospecção e Captação'),
  ('Externos');

-- Add setor_id to profiles table
ALTER TABLE public.profiles
ADD COLUMN setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;

-- Add setor_id to patrimonio table
ALTER TABLE public.patrimonio
ADD COLUMN setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_centros_custo_updated_at
BEFORE UPDATE ON public.centros_custo
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_setores_updated_at
BEFORE UPDATE ON public.setores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();