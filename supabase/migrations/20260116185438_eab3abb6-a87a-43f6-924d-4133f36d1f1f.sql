-- Tabela de campanhas de email (similar a disparos_campanhas)
CREATE TABLE public.email_campanhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  proposta_id UUID REFERENCES public.proposta(id) ON DELETE SET NULL,
  texto_ia TEXT,
  responsavel_id UUID,
  responsavel_nome TEXT,
  status TEXT DEFAULT 'pendente',
  total_contatos INTEGER DEFAULT 0,
  enviados INTEGER DEFAULT 0,
  falhas INTEGER DEFAULT 0,
  respondidos INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de contatos de campanhas de email
CREATE TABLE public.email_contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL REFERENCES public.email_campanhas(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  nome TEXT,
  especialidade TEXT,
  uf TEXT,
  status TEXT DEFAULT 'pendente',
  data_envio TIMESTAMPTZ,
  data_resposta TIMESTAMPTZ,
  erro TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX idx_email_campanhas_proposta ON public.email_campanhas(proposta_id);
CREATE INDEX idx_email_campanhas_ativo ON public.email_campanhas(ativo);
CREATE INDEX idx_email_contatos_campanha ON public.email_contatos(campanha_id);
CREATE INDEX idx_email_contatos_status ON public.email_contatos(status);

-- RLS
ALTER TABLE public.email_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view email_campanhas" ON public.email_campanhas FOR SELECT USING (true);
CREATE POLICY "Users can insert email_campanhas" ON public.email_campanhas FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update email_campanhas" ON public.email_campanhas FOR UPDATE USING (true);
CREATE POLICY "Users can delete email_campanhas" ON public.email_campanhas FOR DELETE USING (true);

CREATE POLICY "Users can view email_contatos" ON public.email_contatos FOR SELECT USING (true);
CREATE POLICY "Users can insert email_contatos" ON public.email_contatos FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update email_contatos" ON public.email_contatos FOR UPDATE USING (true);
CREATE POLICY "Users can delete email_contatos" ON public.email_contatos FOR DELETE USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_email_campanhas_updated_at
  BEFORE UPDATE ON public.email_campanhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_campanhas;