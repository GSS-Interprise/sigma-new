
-- Tabela para rastrear quem visualizou cada entrada do histórico do lead
CREATE TABLE public.lead_historico_visualizacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL,
  entry_id TEXT NOT NULL,
  entry_source TEXT NOT NULL,
  user_id UUID NOT NULL,
  user_nome TEXT NOT NULL,
  visualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index para busca rápida por lead
CREATE INDEX idx_lead_hist_viz_lead_id ON public.lead_historico_visualizacoes(lead_id);

-- Index para busca por entry
CREATE INDEX idx_lead_hist_viz_entry ON public.lead_historico_visualizacoes(entry_id, entry_source);

-- Evitar duplicatas (mesmo user visualizando o mesmo entry)
CREATE UNIQUE INDEX idx_lead_hist_viz_unique ON public.lead_historico_visualizacoes(entry_id, entry_source, user_id);

-- Enable RLS
ALTER TABLE public.lead_historico_visualizacoes ENABLE ROW LEVEL SECURITY;

-- Qualquer usuário autenticado pode ver visualizações
CREATE POLICY "Authenticated users can view visualizacoes"
ON public.lead_historico_visualizacoes
FOR SELECT
TO authenticated
USING (true);

-- Usuários autenticados podem inserir suas próprias visualizações
CREATE POLICY "Users can insert own visualizacoes"
ON public.lead_historico_visualizacoes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Usuários podem atualizar suas próprias visualizações (para atualizar o timestamp)
CREATE POLICY "Users can update own visualizacoes"
ON public.lead_historico_visualizacoes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);
