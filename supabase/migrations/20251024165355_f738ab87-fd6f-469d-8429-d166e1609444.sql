-- Adicionar novos campos à tabela radiologia_pendencias
ALTER TABLE radiologia_pendencias 
  ADD COLUMN IF NOT EXISTS data_deteccao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS quantidade_pendente INTEGER DEFAULT 1 CHECK (quantidade_pendente >= 1),
  ADD COLUMN IF NOT EXISTS descricao_inicial TEXT,
  ADD COLUMN IF NOT EXISTS status_pendencia TEXT DEFAULT 'aberta' CHECK (status_pendencia IN ('aberta', 'em_analise', 'encaminhada_medico', 'aguardando_laudo', 'resolvida')),
  ADD COLUMN IF NOT EXISTS responsavel_atual_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS prazo_limite_sla TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '48 hours'),
  ADD COLUMN IF NOT EXISTS data_resolucao TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS descricao_resolucao TEXT,
  ADD COLUMN IF NOT EXISTS observacoes_internas TEXT,
  ADD COLUMN IF NOT EXISTS id_exame_externo TEXT;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_status ON radiologia_pendencias(status_pendencia);
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_cliente ON radiologia_pendencias(cliente_id);
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_medico ON radiologia_pendencias(medico_id);
CREATE INDEX IF NOT EXISTS idx_radiologia_pendencias_data_deteccao ON radiologia_pendencias(data_deteccao);

-- Criar tabela de histórico de pendências
CREATE TABLE IF NOT EXISTS radiologia_pendencias_historico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pendencia_id UUID NOT NULL REFERENCES radiologia_pendencias(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT NOT NULL,
  data_hora TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  acao TEXT NOT NULL,
  detalhes TEXT,
  anexos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pendencias_historico_pendencia ON radiologia_pendencias_historico(pendencia_id);
CREATE INDEX IF NOT EXISTS idx_pendencias_historico_data ON radiologia_pendencias_historico(data_hora);

-- Criar tabela de comentários de pendências
CREATE TABLE IF NOT EXISTS radiologia_pendencias_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pendencia_id UUID NOT NULL REFERENCES radiologia_pendencias(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT NOT NULL,
  comentario TEXT NOT NULL,
  anexos TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pendencias_comentarios_pendencia ON radiologia_pendencias_comentarios(pendencia_id);

-- Criar tabela de configuração de SLA por cliente (opcional)
CREATE TABLE IF NOT EXISTS radiologia_config_sla_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  segmento segmento_radiologia NOT NULL,
  sla_horas INTEGER NOT NULL DEFAULT 48,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(cliente_id, segmento)
);

-- RLS Policies para radiologia_pendencias_historico
ALTER TABLE radiologia_pendencias_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view historico"
ON radiologia_pendencias_historico FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

CREATE POLICY "Authorized users can insert historico"
ON radiologia_pendencias_historico FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- RLS Policies para radiologia_pendencias_comentarios
ALTER TABLE radiologia_pendencias_comentarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can view comentarios"
ON radiologia_pendencias_comentarios FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

CREATE POLICY "Authorized users can insert comentarios"
ON radiologia_pendencias_comentarios FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

CREATE POLICY "Users can update own comentarios"
ON radiologia_pendencias_comentarios FOR UPDATE
USING (auth.uid() = usuario_id);

-- RLS Policies para radiologia_config_sla_cliente
ALTER TABLE radiologia_config_sla_cliente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authorized users can manage config_sla"
ON radiologia_config_sla_cliente FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- Trigger para atualizar updated_at em comentários
CREATE OR REPLACE FUNCTION update_radiologia_pendencias_comentarios_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_pendencias_comentarios_updated_at
BEFORE UPDATE ON radiologia_pendencias_comentarios
FOR EACH ROW
EXECUTE FUNCTION update_radiologia_pendencias_comentarios_updated_at();

-- Trigger para atualizar updated_at em config_sla
CREATE TRIGGER update_config_sla_updated_at
BEFORE UPDATE ON radiologia_config_sla_cliente
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();