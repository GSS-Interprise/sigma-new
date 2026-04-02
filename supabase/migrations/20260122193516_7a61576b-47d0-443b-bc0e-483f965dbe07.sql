-- Tabela de fontes de escala (cadastro de planilhas Google Sheets)
CREATE TABLE public.escalas_ambulatoriais_fontes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE CASCADE,
  cliente_nome TEXT NOT NULL,
  tipo_fonte TEXT NOT NULL DEFAULT 'GOOGLE_SHEETS',
  url_planilha TEXT NOT NULL,
  nome_aba TEXT NOT NULL,
  template_id UUID,
  frequencia_sincronizacao TEXT NOT NULL DEFAULT 'manual',
  ultima_sincronizacao TIMESTAMP WITH TIME ZONE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Tabela de templates de leitura de escala
CREATE TABLE public.escalas_ambulatoriais_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  -- Configuração de layout
  linha_inicio_recursos INTEGER NOT NULL DEFAULT 1,
  coluna_recursos TEXT NOT NULL DEFAULT 'A',
  linha_cabecalho_dias INTEGER NOT NULL DEFAULT 1,
  coluna_inicio_dias TEXT NOT NULL DEFAULT 'B',
  linha_subcabecalho_turnos INTEGER,
  -- Mapeamento de turnos
  turnos_config JSONB DEFAULT '{"manha": {"inicio": "07:00", "fim": "12:00"}, "tarde": {"inicio": "13:00", "fim": "18:00"}, "noite": {"inicio": "19:00", "fim": "23:00"}}'::jsonb,
  -- Configurações adicionais
  ignorar_celulas_vazias BOOLEAN NOT NULL DEFAULT true,
  formato_data TEXT DEFAULT 'DD/MM/YYYY',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Adicionar FK do template na tabela de fontes
ALTER TABLE public.escalas_ambulatoriais_fontes 
ADD CONSTRAINT escalas_ambulatoriais_fontes_template_id_fkey 
FOREIGN KEY (template_id) REFERENCES public.escalas_ambulatoriais_templates(id);

-- Tabela de escalas ambulatoriais (dados normalizados)
CREATE TABLE public.escalas_ambulatoriais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fonte_id UUID NOT NULL REFERENCES public.escalas_ambulatoriais_fontes(id) ON DELETE CASCADE,
  cliente_id UUID REFERENCES public.clientes(id),
  cliente_nome TEXT NOT NULL,
  recurso TEXT NOT NULL,
  data_escala DATE NOT NULL,
  turno TEXT,
  hora_inicio TIME,
  hora_fim TIME,
  descricao TEXT,
  origem TEXT NOT NULL DEFAULT 'GOOGLE_SHEETS',
  url_planilha TEXT,
  nome_aba TEXT,
  celula_referencia TEXT,
  sincronizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- Constraint para evitar duplicatas
  CONSTRAINT escalas_ambulatoriais_unique UNIQUE (fonte_id, recurso, data_escala, turno)
);

-- Tabela de logs de sincronização
CREATE TABLE public.escalas_ambulatoriais_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fonte_id UUID REFERENCES public.escalas_ambulatoriais_fontes(id) ON DELETE SET NULL,
  fonte_nome TEXT,
  data_sincronizacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pendente',
  total_registros_lidos INTEGER DEFAULT 0,
  total_registros_inseridos INTEGER DEFAULT 0,
  total_registros_atualizados INTEGER DEFAULT 0,
  total_erros INTEGER DEFAULT 0,
  erros_detalhes JSONB,
  duracao_ms INTEGER,
  usuario_id UUID,
  usuario_nome TEXT
);

-- Índices para performance
CREATE INDEX idx_escalas_ambulatoriais_fonte_id ON public.escalas_ambulatoriais(fonte_id);
CREATE INDEX idx_escalas_ambulatoriais_data ON public.escalas_ambulatoriais(data_escala);
CREATE INDEX idx_escalas_ambulatoriais_cliente ON public.escalas_ambulatoriais(cliente_id);
CREATE INDEX idx_escalas_ambulatoriais_logs_fonte ON public.escalas_ambulatoriais_logs(fonte_id);
CREATE INDEX idx_escalas_ambulatoriais_logs_data ON public.escalas_ambulatoriais_logs(data_sincronizacao);

-- Trigger para updated_at nas fontes
CREATE TRIGGER update_escalas_ambulatoriais_fontes_updated_at
  BEFORE UPDATE ON public.escalas_ambulatoriais_fontes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para updated_at nos templates
CREATE TRIGGER update_escalas_ambulatoriais_templates_updated_at
  BEFORE UPDATE ON public.escalas_ambulatoriais_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para updated_at nas escalas
CREATE TRIGGER update_escalas_ambulatoriais_updated_at
  BEFORE UPDATE ON public.escalas_ambulatoriais
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies
ALTER TABLE public.escalas_ambulatoriais_fontes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_ambulatoriais_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_ambulatoriais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_ambulatoriais_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para usuários autenticados visualizarem
CREATE POLICY "Usuários autenticados podem visualizar fontes"
  ON public.escalas_ambulatoriais_fontes FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins podem gerenciar fontes"
  ON public.escalas_ambulatoriais_fontes FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Usuários autenticados podem visualizar templates"
  ON public.escalas_ambulatoriais_templates FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins podem gerenciar templates"
  ON public.escalas_ambulatoriais_templates FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Usuários autenticados podem visualizar escalas ambulatoriais"
  ON public.escalas_ambulatoriais FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins podem gerenciar escalas ambulatoriais"
  ON public.escalas_ambulatoriais FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Usuários autenticados podem visualizar logs"
  ON public.escalas_ambulatoriais_logs FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Sistema pode inserir logs"
  ON public.escalas_ambulatoriais_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- Template padrão inicial
INSERT INTO public.escalas_ambulatoriais_templates (nome, descricao, linha_inicio_recursos, coluna_recursos, linha_cabecalho_dias, coluna_inicio_dias)
VALUES ('Template Padrão', 'Layout padrão com recursos na coluna A e dias nas colunas B em diante', 2, 'A', 1, 'B');