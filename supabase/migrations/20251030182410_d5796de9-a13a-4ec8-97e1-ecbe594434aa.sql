-- Create table for dynamic Kanban status configuration
CREATE TABLE public.kanban_status_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo text NOT NULL,
  status_id text NOT NULL,
  label text NOT NULL,
  ordem integer NOT NULL,
  cor text,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(modulo, status_id)
);

-- Create indexes for better performance
CREATE INDEX idx_kanban_status_modulo ON public.kanban_status_config(modulo);
CREATE INDEX idx_kanban_status_ordem ON public.kanban_status_config(modulo, ordem);

-- Enable RLS
ALTER TABLE public.kanban_status_config ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can view status
CREATE POLICY "Authenticated users can view kanban status"
  ON public.kanban_status_config FOR SELECT
  USING (true);

-- Policy: Only admins can manage status
CREATE POLICY "Admins can manage kanban status"
  ON public.kanban_status_config FOR ALL
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_kanban_status_config_updated_at
  BEFORE UPDATE ON public.kanban_status_config
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert initial data for licitacoes module
INSERT INTO public.kanban_status_config (modulo, status_id, label, ordem) VALUES
('licitacoes', 'captacao_edital', 'Captação de edital', 1),
('licitacoes', 'edital_analise', 'Edital em análise', 2),
('licitacoes', 'deliberacao', 'Deliberação', 3),
('licitacoes', 'esclarecimentos_impugnacao', 'Esclarecimentos/Impugnação', 4),
('licitacoes', 'cadastro_proposta', 'Cadastro de proposta', 5),
('licitacoes', 'aguardando_sessao', 'Aguardando sessão', 6),
('licitacoes', 'em_disputa', 'Em disputa', 7),
('licitacoes', 'proposta_final', 'Proposta final', 8),
('licitacoes', 'recurso_contrarrazao', 'Recurso/Contrarrazão', 9),
('licitacoes', 'adjudicacao_homologacao', 'Adjudicação/Homologação', 10),
('licitacoes', 'arrematados', 'Arrematados', 11),
('licitacoes', 'descarte_edital', 'Descarte de edital', 12),
('licitacoes', 'nao_ganhamos', 'Não ganhamos', 13);