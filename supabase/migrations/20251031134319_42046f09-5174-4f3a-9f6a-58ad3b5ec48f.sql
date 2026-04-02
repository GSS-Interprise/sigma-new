-- Criar tabela para gerenciar colunas do Kanban de licitações
CREATE TABLE IF NOT EXISTS public.licitacoes_colunas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  status_vinculado status_licitacao NOT NULL UNIQUE,
  ordem INTEGER NOT NULL,
  cor TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.licitacoes_colunas ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Usuários autenticados podem visualizar colunas"
  ON public.licitacoes_colunas
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autorizados podem gerenciar colunas"
  ON public.licitacoes_colunas
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role)
  );

-- Trigger para updated_at
CREATE TRIGGER update_licitacoes_colunas_updated_at
  BEFORE UPDATE ON public.licitacoes_colunas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Popular com as colunas existentes (IDs fixos correspondendo aos status reais)
INSERT INTO public.licitacoes_colunas (id, nome, status_vinculado, ordem, cor) VALUES
  ('f47ac10b-58cc-4372-a567-0e02b2c3d479', 'Captação de edital', 'captacao_edital', 1, '#3b82f6'),
  ('a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d', 'Análise de edital', 'edital_analise', 2, '#8b5cf6'),
  ('b2c3d4e5-f6a7-4b5c-9d0e-1f2a3b4c5d6e', 'Esclarecimentos/Impugnação', 'esclarecimentos_impugnacao', 3, '#ec4899'),
  ('c3d4e5f6-a7b8-4c5d-0e1f-2a3b4c5d6e7f', 'Cadastro de proposta', 'cadastro_proposta', 4, '#f59e0b'),
  ('d4e5f6a7-b8c9-4d5e-1f2a-3b4c5d6e7f8a', 'Proposta final', 'proposta_final', 5, '#10b981'),
  ('e5f6a7b8-c9d0-4e5f-2a3b-4c5d6e7f8a9b', 'Aguardando sessão', 'aguardando_sessao', 6, '#06b6d4'),
  ('f6a7b8c9-d0e1-4f5a-3b4c-5d6e7f8a9b0c', 'Em disputa', 'em_disputa', 7, '#6366f1'),
  ('a7b8c9d0-e1f2-4a5b-4c5d-6e7f8a9b0c1d', 'Deliberação', 'deliberacao', 8, '#a855f7'),
  ('b8c9d0e1-f2a3-4b5c-5d6e-7f8a9b0c1d2e', 'Recurso/Contrarrazão', 'recurso_contrarrazao', 9, '#f97316'),
  ('c9d0e1f2-a3b4-4c5d-6e7f-8a9b0c1d2e3f', 'Adjudicação/Homologação', 'adjudicacao_homologacao', 10, '#22c55e'),
  ('d0e1f2a3-b4c5-4d5e-7f8a-9b0c1d2e3f4a', 'Arrematados', 'arrematados', 11, '#16a34a'),
  ('e1f2a3b4-c5d6-4e5f-8a9b-0c1d2e3f4a5b', 'Não ganhamos', 'nao_ganhamos', 12, '#ef4444'),
  ('f2a3b4c5-d6e7-4f5a-9b0c-1d2e3f4a5b6c', 'Descarte de edital', 'descarte_edital', 13, '#64748b')
ON CONFLICT (status_vinculado) DO NOTHING;