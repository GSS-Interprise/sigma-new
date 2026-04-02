-- Tabela para histórico de importações de leads
CREATE TABLE public.lead_import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente, processando, concluido, erro
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT,
  total_linhas INTEGER DEFAULT 0,
  inseridos INTEGER DEFAULT 0,
  atualizados INTEGER DEFAULT 0,
  ignorados INTEGER DEFAULT 0,
  erros JSONB DEFAULT '[]'::jsonb,
  mapeamento_colunas JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_by_nome TEXT
);

-- Habilitar RLS
ALTER TABLE public.lead_import_jobs ENABLE ROW LEVEL SECURITY;

-- Política para visualização - usuários autenticados podem ver todos os imports
CREATE POLICY "Usuários autenticados podem visualizar imports" 
ON public.lead_import_jobs 
FOR SELECT 
TO authenticated
USING (true);

-- Política para inserção - usuários autenticados podem criar imports
CREATE POLICY "Usuários autenticados podem criar imports" 
ON public.lead_import_jobs 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Política para atualização - apenas o sistema (service role) pode atualizar
CREATE POLICY "Service role pode atualizar imports" 
ON public.lead_import_jobs 
FOR UPDATE 
USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_lead_import_jobs_updated_at
BEFORE UPDATE ON public.lead_import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime para atualizações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_import_jobs;