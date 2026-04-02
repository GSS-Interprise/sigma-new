-- Criar enum para status de campanha
CREATE TYPE status_campanha AS ENUM ('planejada', 'ativa', 'pausada', 'finalizada');

-- Criar enum para canais de campanha
CREATE TYPE canal_campanha AS ENUM ('whatsapp', 'email', 'instagram', 'linkedin', 'anuncios', 'eventos');

-- Criar enum para tipo de conteúdo
CREATE TYPE tipo_conteudo AS ENUM ('video', 'card', 'reels', 'artigo', 'newsletter');

-- Criar enum para status de conteúdo
CREATE TYPE status_conteudo AS ENUM ('rascunho', 'pronto', 'publicado');

-- Criar enum para etapas do funil
CREATE TYPE etapa_funil_marketing AS ENUM (
  'lead_gerado',
  'contato_inicial',
  'envio_informacoes',
  'qualificacao',
  'encaminhado_captacao',
  'processo_contratacao',
  'plantao_agendado'
);

-- Criar enum para categoria de material
CREATE TYPE categoria_material AS ENUM ('pdf', 'apresentacao', 'modelo_mensagem', 'logo', 'template', 'politica_interna');

-- Tabela de Campanhas
CREATE TABLE public.campanhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  objetivo TEXT,
  publico_alvo JSONB,
  canal canal_campanha NOT NULL,
  status status_campanha NOT NULL DEFAULT 'planejada',
  data_inicio DATE,
  data_termino DATE,
  orcamento NUMERIC(12, 2),
  responsavel_id UUID REFERENCES auth.users(id),
  setores_vinculados TEXT[],
  empresas_vinculadas UUID[],
  pecas_url TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Conteúdos
CREATE TABLE public.conteudos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  tipo tipo_conteudo NOT NULL,
  data_publicacao DATE,
  status status_conteudo NOT NULL DEFAULT 'rascunho',
  tags TEXT[],
  alcance INTEGER,
  cliques INTEGER,
  engajamento NUMERIC(5, 2),
  anexos TEXT[],
  observacoes TEXT,
  responsavel_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Funil de Marketing (Leads)
CREATE TABLE public.marketing_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  especialidade TEXT,
  cidade TEXT,
  telefone TEXT,
  email TEXT,
  origem_campanha_id UUID REFERENCES public.campanhas(id),
  etapa etapa_funil_marketing NOT NULL DEFAULT 'lead_gerado',
  tags TEXT[],
  observacoes TEXT,
  documentos_url TEXT[],
  responsavel_id UUID REFERENCES auth.users(id),
  historico_interacoes JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Biblioteca de Materiais
CREATE TABLE public.materiais_biblioteca (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria categoria_material NOT NULL,
  arquivo_url TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  pasta TEXT,
  tags TEXT[],
  descricao TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Eventos
CREATE TABLE public.eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  data_evento DATE NOT NULL,
  orcamento NUMERIC(12, 2),
  participantes TEXT[],
  materiais_usados TEXT[],
  pecas_divulgacao TEXT[],
  leads_gerados INTEGER DEFAULT 0,
  relatorio_pos_evento TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Parceiros (CRM)
CREATE TABLE public.parceiros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_empresa TEXT NOT NULL,
  cnpj TEXT,
  contatos_principais JSONB,
  historico_interacoes JSONB DEFAULT '[]'::jsonb,
  materiais_enviados TEXT[],
  oportunidades JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Automações
CREATE TABLE public.automacoes_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  trigger_etapa etapa_funil_marketing,
  acao TEXT NOT NULL,
  webhook_url TEXT,
  config JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais_biblioteca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automacoes_config ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para campanhas
CREATE POLICY "Usuários autorizados podem gerenciar campanhas"
  ON public.campanhas
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role)
  );

-- Políticas RLS para conteudos
CREATE POLICY "Usuários autorizados podem gerenciar conteudos"
  ON public.conteudos
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role)
  );

-- Políticas RLS para marketing_leads
CREATE POLICY "Usuários autorizados podem gerenciar leads de marketing"
  ON public.marketing_leads
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role)
  );

-- Políticas RLS para materiais_biblioteca
CREATE POLICY "Usuários autenticados podem visualizar materiais"
  ON public.materiais_biblioteca
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autorizados podem inserir materiais"
  ON public.materiais_biblioteca
  FOR INSERT
  WITH CHECK (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role)
  );

CREATE POLICY "Usuários autorizados podem atualizar materiais"
  ON public.materiais_biblioteca
  FOR UPDATE
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role)
  );

CREATE POLICY "Usuários autorizados podem deletar materiais"
  ON public.materiais_biblioteca
  FOR DELETE
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role)
  );

-- Políticas RLS para eventos
CREATE POLICY "Usuários autorizados podem gerenciar eventos"
  ON public.eventos
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role)
  );

-- Políticas RLS para parceiros
CREATE POLICY "Usuários autorizados podem gerenciar parceiros"
  ON public.parceiros
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role)
  );

-- Políticas RLS para automacoes_config
CREATE POLICY "Admins e gestores marketing podem gerenciar automações"
  ON public.automacoes_config
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role)
  );

-- Criar storage buckets
INSERT INTO storage.buckets (id, name, public) 
VALUES ('campanhas-pecas', 'campanhas-pecas', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('materiais-biblioteca', 'materiais-biblioteca', false);

INSERT INTO storage.buckets (id, name, public) 
VALUES ('eventos-materiais', 'eventos-materiais', false);

-- Políticas de storage para campanhas-pecas (INSERT)
CREATE POLICY "Upload campanhas autorizado"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'campanhas-pecas' AND
    (is_admin(auth.uid()) OR 
     has_role(auth.uid(), 'gestor_marketing'::app_role) OR
     has_role(auth.uid(), 'gestor_captacao'::app_role))
  );

-- Políticas de storage para campanhas-pecas (SELECT)
CREATE POLICY "Visualizar campanhas autorizado"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'campanhas-pecas' AND
    (is_admin(auth.uid()) OR 
     has_role(auth.uid(), 'gestor_marketing'::app_role) OR
     has_role(auth.uid(), 'gestor_captacao'::app_role) OR
     has_role(auth.uid(), 'diretoria'::app_role))
  );

-- Políticas de storage para materiais-biblioteca (INSERT)
CREATE POLICY "Upload biblioteca autorizado"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'materiais-biblioteca' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role))
  );

-- Políticas de storage para materiais-biblioteca (SELECT)
CREATE POLICY "Visualizar biblioteca autorizado"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'materiais-biblioteca' AND auth.uid() IS NOT NULL
  );

-- Políticas de storage para eventos-materiais (INSERT)
CREATE POLICY "Upload eventos autorizado"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'eventos-materiais' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role))
  );

-- Políticas de storage para eventos-materiais (SELECT)
CREATE POLICY "Visualizar eventos autorizado"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'eventos-materiais' AND
    (is_admin(auth.uid()) OR 
     has_role(auth.uid(), 'gestor_marketing'::app_role) OR
     has_role(auth.uid(), 'diretoria'::app_role))
  );

-- Triggers para updated_at
CREATE TRIGGER update_campanhas_updated_at
  BEFORE UPDATE ON public.campanhas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conteudos_updated_at
  BEFORE UPDATE ON public.conteudos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_marketing_leads_updated_at
  BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_materiais_biblioteca_updated_at
  BEFORE UPDATE ON public.materiais_biblioteca
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_eventos_updated_at
  BEFORE UPDATE ON public.eventos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_parceiros_updated_at
  BEFORE UPDATE ON public.parceiros
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_automacoes_config_updated_at
  BEFORE UPDATE ON public.automacoes_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();