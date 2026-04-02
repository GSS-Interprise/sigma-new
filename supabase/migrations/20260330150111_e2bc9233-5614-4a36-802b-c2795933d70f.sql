
-- Table to register external BI clients
CREATE TABLE public.bi_clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bi_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bi_clientes"
  ON public.bi_clientes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage bi_clientes"
  ON public.bi_clientes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Table for import history per client
CREATE TABLE public.bi_client_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.bi_clientes(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT,
  total_registros INTEGER NOT NULL DEFAULT 0,
  total_erros INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  uploaded_by UUID,
  uploaded_by_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bi_client_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bi_client_imports"
  ON public.bi_client_imports FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert bi_client_imports"
  ON public.bi_client_imports FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update bi_client_imports"
  ON public.bi_client_imports FOR UPDATE TO authenticated USING (true);

-- Staging table for imported rows with per-row error tracking
CREATE TABLE public.bi_client_import_rows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.bi_client_imports(id) ON DELETE CASCADE,
  linha_numero INTEGER NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pendente',
  erro_mensagem TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bi_client_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bi_client_import_rows"
  ON public.bi_client_import_rows FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert bi_client_import_rows"
  ON public.bi_client_import_rows FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update bi_client_import_rows"
  ON public.bi_client_import_rows FOR UPDATE TO authenticated USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_bi_clientes_updated_at
  BEFORE UPDATE ON public.bi_clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bi_client_imports_updated_at
  BEFORE UPDATE ON public.bi_client_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_bi_client_imports_cliente ON public.bi_client_imports(cliente_id);
CREATE INDEX idx_bi_client_import_rows_import ON public.bi_client_import_rows(import_id);
CREATE INDEX idx_bi_client_import_rows_status ON public.bi_client_import_rows(status);

-- Seed Hospital de Gaspar
INSERT INTO public.bi_clientes (nome, slug) VALUES ('Hospital de Gaspar', 'hospital-de-gaspar');
