-- Adicionar configurações de status para o Kanban de Captação
INSERT INTO kanban_status_config (modulo, status_id, label, ordem, cor, ativo) VALUES
('disparos', 'enviados', 'Enviados', 1, '#3b82f6', true),
('disparos', 'respondidos', 'Respondidos', 2, '#8b5cf6', true),
('disparos', 'em_conversa', 'Em Conversa', 3, '#f59e0b', true),
('disparos', 'qualificados', 'Qualificados', 4, '#10b981', true),
('disparos', 'descartados', 'Descartados', 5, '#ef4444', true)
ON CONFLICT DO NOTHING;

-- Criar tabela para tracking de leads de captação (respostas + conversas)
CREATE TABLE IF NOT EXISTS captacao_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  especialidade TEXT,
  uf TEXT,
  email TEXT,
  telefone TEXT,
  status TEXT NOT NULL DEFAULT 'enviados',
  disparo_log_id UUID REFERENCES disparos_log(id) ON DELETE SET NULL,
  disparo_programado_id UUID REFERENCES disparos_programados(id) ON DELETE SET NULL,
  email_resposta_id UUID REFERENCES email_respostas(id) ON DELETE SET NULL,
  medico_id UUID REFERENCES medicos(id) ON DELETE SET NULL,
  ultima_mensagem_enviada TEXT,
  ultima_resposta_recebida TEXT,
  data_ultimo_contato TIMESTAMP WITH TIME ZONE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Adicionar índices para performance
CREATE INDEX IF NOT EXISTS idx_captacao_leads_status ON captacao_leads(status);
CREATE INDEX IF NOT EXISTS idx_captacao_leads_disparo_log ON captacao_leads(disparo_log_id);
CREATE INDEX IF NOT EXISTS idx_captacao_leads_email ON captacao_leads(email);
CREATE INDEX IF NOT EXISTS idx_captacao_leads_medico ON captacao_leads(medico_id);

-- Habilitar RLS
ALTER TABLE captacao_leads ENABLE ROW LEVEL SECURITY;

-- Política de acesso
CREATE POLICY "Usuários autorizados podem gerenciar captacao_leads"
ON captacao_leads
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- Trigger para updated_at
CREATE TRIGGER update_captacao_leads_updated_at
  BEFORE UPDATE ON captacao_leads
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Criar tabela para tracking de disparos recentes (anti-duplicação)
CREATE TABLE IF NOT EXISTS disparos_historico_contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  telefone TEXT,
  ultima_campanha TEXT,
  ultimo_disparo TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT unique_email_or_phone UNIQUE NULLS NOT DISTINCT (email, telefone)
);

CREATE INDEX IF NOT EXISTS idx_disparos_historico_email ON disparos_historico_contatos(email);
CREATE INDEX IF NOT EXISTS idx_disparos_historico_telefone ON disparos_historico_contatos(telefone);
CREATE INDEX IF NOT EXISTS idx_disparos_historico_ultimo ON disparos_historico_contatos(ultimo_disparo);

-- RLS para historico de contatos
ALTER TABLE disparos_historico_contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autorizados podem gerenciar historico"
ON disparos_historico_contatos
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);