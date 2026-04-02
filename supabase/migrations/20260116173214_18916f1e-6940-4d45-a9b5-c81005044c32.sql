-- =====================================================
-- ESTRUTURA PARA INTELIGÊNCIA COMPETITIVA POR ITEM
-- =====================================================

-- 1. Tabela de Itens da Licitação
CREATE TABLE public.licitacao_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'outro', -- consulta, exame, servico, plantao, especialidade, outro
  descricao TEXT,
  valor_referencia NUMERIC(15,2),
  quantidade INTEGER DEFAULT 1,
  unidade_medida TEXT, -- unidade, hora, mes, etc
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Tabela de Concorrentes por Item
CREATE TABLE public.licitacao_item_concorrentes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.licitacao_itens(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas_concorrentes(id),
  empresa_nome TEXT NOT NULL,
  empresa_cnpj TEXT,
  valor_ofertado NUMERIC(15,2) NOT NULL,
  posicao INTEGER NOT NULL DEFAULT 1, -- 1º, 2º, 3º...
  situacao TEXT NOT NULL DEFAULT 'habilitada', -- habilitada, inabilitada, desclassificada
  motivo_situacao TEXT, -- motivo de inabilitação ou desclassificação
  is_gss BOOLEAN NOT NULL DEFAULT false,
  is_vencedor BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Índices para performance
CREATE INDEX idx_licitacao_itens_licitacao ON public.licitacao_itens(licitacao_id);
CREATE INDEX idx_licitacao_item_concorrentes_item ON public.licitacao_item_concorrentes(item_id);
CREATE INDEX idx_licitacao_item_concorrentes_empresa ON public.licitacao_item_concorrentes(empresa_id);
CREATE INDEX idx_licitacao_item_concorrentes_is_gss ON public.licitacao_item_concorrentes(is_gss);
CREATE INDEX idx_licitacao_item_concorrentes_is_vencedor ON public.licitacao_item_concorrentes(is_vencedor);

-- 4. Triggers para updated_at
CREATE TRIGGER update_licitacao_itens_updated_at
  BEFORE UPDATE ON public.licitacao_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_licitacao_item_concorrentes_updated_at
  BEFORE UPDATE ON public.licitacao_item_concorrentes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS
ALTER TABLE public.licitacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licitacao_item_concorrentes ENABLE ROW LEVEL SECURITY;

-- Políticas para licitacao_itens
CREATE POLICY "Usuarios autenticados podem ver itens de licitacao"
  ON public.licitacao_itens FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados podem inserir itens de licitacao"
  ON public.licitacao_itens FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuarios autenticados podem atualizar itens de licitacao"
  ON public.licitacao_itens FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados podem deletar itens de licitacao"
  ON public.licitacao_itens FOR DELETE TO authenticated USING (true);

-- Políticas para licitacao_item_concorrentes
CREATE POLICY "Usuarios autenticados podem ver concorrentes de item"
  ON public.licitacao_item_concorrentes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados podem inserir concorrentes de item"
  ON public.licitacao_item_concorrentes FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Usuarios autenticados podem atualizar concorrentes de item"
  ON public.licitacao_item_concorrentes FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Usuarios autenticados podem deletar concorrentes de item"
  ON public.licitacao_item_concorrentes FOR DELETE TO authenticated USING (true);

-- 6. Habilitar realtime para atualizações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.licitacao_itens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.licitacao_item_concorrentes;

-- 7. Comentários para documentação
COMMENT ON TABLE public.licitacao_itens IS 'Itens de uma licitação (consultas, exames, serviços, etc.)';
COMMENT ON TABLE public.licitacao_item_concorrentes IS 'Empresas concorrentes por item de licitação com valores e posições';
COMMENT ON COLUMN public.licitacao_item_concorrentes.is_gss IS 'Marcação automática quando a empresa é GSS';
COMMENT ON COLUMN public.licitacao_item_concorrentes.is_vencedor IS 'Flag para indicar empresa vencedora do item';