-- Criar enum para status de licitações
CREATE TYPE status_licitacao AS ENUM (
  'captacao_edital',
  'edital_analise',
  'deliberacao',
  'esclarecimentos_impugnacao',
  'cadastro_proposta',
  'aguardando_sessao',
  'em_disputa',
  'proposta_final',
  'recurso_contrarrazao',
  'adjudicacao_homologacao',
  'arrematados',
  'descarte_edital',
  'nao_ganhamos'
);

-- Criar enum para status de disparos
CREATE TYPE status_disparo AS ENUM (
  'nova_oportunidade',
  'disparo',
  'analise_proposta',
  'negociacao',
  'investigacao',
  'proposta_aceita',
  'proposta_arquivada',
  'relacionamento_medico'
);

-- Criar enum para status de relacionamento médico
CREATE TYPE status_relacionamento AS ENUM (
  'inicio_identificacao',
  'captacao_documentacao',
  'pendencia_documentacao',
  'documentacao_finalizada',
  'criacao_escalas'
);

-- Tabela de licitações
CREATE TABLE licitacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_edital TEXT NOT NULL,
  orgao TEXT NOT NULL,
  objeto TEXT NOT NULL,
  valor_estimado NUMERIC(15,2),
  data_abertura DATE,
  data_limite DATE,
  status status_licitacao NOT NULL DEFAULT 'captacao_edital',
  responsavel_id UUID REFERENCES auth.users(id),
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de tarefas/worklists
CREATE TABLE worklist_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo TEXT NOT NULL, -- 'home', 'licitacoes', 'disparos', 'contratos', 'relacionamento', 'escalas'
  titulo TEXT NOT NULL,
  descricao TEXT,
  status TEXT NOT NULL,
  responsavel_id UUID REFERENCES auth.users(id),
  data_limite DATE,
  prioridade TEXT DEFAULT 'media',
  licitacao_id UUID REFERENCES licitacoes(id) ON DELETE CASCADE,
  contrato_id UUID REFERENCES contratos(id) ON DELETE CASCADE,
  relacionamento_id UUID REFERENCES relacionamento_medico(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Adicionar novos campos em contratos
ALTER TABLE contratos
ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT,
ADD COLUMN IF NOT EXISTS valor_estimado NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS prazo_meses INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS data_termino DATE;

-- Adicionar campo quantidade em contrato_itens
ALTER TABLE contrato_itens
ADD COLUMN IF NOT EXISTS quantidade INTEGER DEFAULT 1 CHECK (quantidade >= 1);

-- Adicionar campo UF em clientes se não existir
ALTER TABLE clientes
ADD COLUMN IF NOT EXISTS uf TEXT;

-- Habilitar RLS nas novas tabelas
ALTER TABLE licitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE worklist_tarefas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para licitações
CREATE POLICY "Authorized users can manage licitacoes"
ON licitacoes
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

-- Políticas RLS para worklist_tarefas
CREATE POLICY "Users can view their own tasks"
ON worklist_tarefas
FOR SELECT
USING (
  auth.uid() = responsavel_id OR 
  auth.uid() = created_by OR
  is_admin(auth.uid())
);

CREATE POLICY "Authorized users can create tasks"
ON worklist_tarefas
FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

CREATE POLICY "Authorized users can update tasks"
ON worklist_tarefas
FOR UPDATE
USING (
  auth.uid() = responsavel_id OR 
  auth.uid() = created_by OR
  is_admin(auth.uid())
);

CREATE POLICY "Authorized users can delete tasks"
ON worklist_tarefas
FOR DELETE
USING (
  auth.uid() = created_by OR
  is_admin(auth.uid())
);

-- Função para calcular data de término do contrato
CREATE OR REPLACE FUNCTION calculate_data_termino()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.data_inicio IS NOT NULL AND NEW.prazo_meses IS NOT NULL THEN
    NEW.data_termino := (NEW.data_inicio + (NEW.prazo_meses || ' months')::INTERVAL - INTERVAL '1 day')::DATE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular data de término
DROP TRIGGER IF EXISTS set_data_termino ON contratos;
CREATE TRIGGER set_data_termino
  BEFORE INSERT OR UPDATE OF data_inicio, prazo_meses
  ON contratos
  FOR EACH ROW
  EXECUTE FUNCTION calculate_data_termino();

-- Função para criar tarefa em Disparos quando licitação for arrematada
CREATE OR REPLACE FUNCTION create_disparo_task_on_licitacao_won()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    INSERT INTO worklist_tarefas (
      modulo,
      titulo,
      descricao,
      status,
      data_limite,
      licitacao_id,
      created_by
    ) VALUES (
      'disparos',
      'Iniciar captação pós-licitação',
      'Licitação arrematada: ' || NEW.numero_edital || ' - ' || NEW.objeto,
      'nova_oportunidade',
      CURRENT_DATE + INTERVAL '2 days',
      NEW.id,
      NEW.responsavel_id
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para automação Licitações → Disparos
DROP TRIGGER IF EXISTS licitacao_to_disparo_automation ON licitacoes;
CREATE TRIGGER licitacao_to_disparo_automation
  AFTER INSERT OR UPDATE OF status
  ON licitacoes
  FOR EACH ROW
  EXECUTE FUNCTION create_disparo_task_on_licitacao_won();

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_worklist_responsavel ON worklist_tarefas(responsavel_id);
CREATE INDEX IF NOT EXISTS idx_worklist_modulo ON worklist_tarefas(modulo);
CREATE INDEX IF NOT EXISTS idx_worklist_status ON worklist_tarefas(status);
CREATE INDEX IF NOT EXISTS idx_licitacoes_status ON licitacoes(status);
CREATE INDEX IF NOT EXISTS idx_clientes_uf ON clientes(uf);

-- Trigger para updated_at
CREATE TRIGGER update_licitacoes_updated_at
  BEFORE UPDATE ON licitacoes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_worklist_updated_at
  BEFORE UPDATE ON worklist_tarefas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();