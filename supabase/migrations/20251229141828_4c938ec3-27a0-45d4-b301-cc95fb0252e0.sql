-- Tabela de histórico de imports
CREATE TABLE public.radiologia_imports_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_id TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT NOT NULL,
  total_registros INTEGER DEFAULT 0,
  registros_novos INTEGER DEFAULT 0,
  registros_atualizados INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de snapshots (dados antes da atualização)
CREATE TABLE public.radiologia_pendencias_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES public.radiologia_imports_historico(id) ON DELETE CASCADE,
  pendencia_id UUID NOT NULL,
  dados_anteriores JSONB NOT NULL,
  tipo_operacao TEXT NOT NULL CHECK (tipo_operacao IN ('insert', 'update')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_imports_historico_cliente ON public.radiologia_imports_historico(cliente_id);
CREATE INDEX idx_imports_historico_created ON public.radiologia_imports_historico(created_at DESC);
CREATE INDEX idx_snapshots_import ON public.radiologia_pendencias_snapshots(import_id);
CREATE INDEX idx_snapshots_pendencia ON public.radiologia_pendencias_snapshots(pendencia_id);

-- RLS
ALTER TABLE public.radiologia_imports_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radiologia_pendencias_snapshots ENABLE ROW LEVEL SECURITY;

-- Políticas para imports_historico
CREATE POLICY "Authenticated users can view radiologia_imports_historico"
ON public.radiologia_imports_historico FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage radiologia_imports_historico"
ON public.radiologia_imports_historico FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_radiologia') OR has_role(auth.uid(), 'gestor_contratos'));

-- Políticas para snapshots
CREATE POLICY "Authenticated users can view radiologia_pendencias_snapshots"
ON public.radiologia_pendencias_snapshots FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage radiologia_pendencias_snapshots"
ON public.radiologia_pendencias_snapshots FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_radiologia') OR has_role(auth.uid(), 'gestor_contratos'));