-- Marketing Conteúdos (Posts de Redes Sociais)
CREATE TABLE public.marketing_conteudos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  conta_perfil TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('post', 'reels', 'story', 'video', 'carousel')),
  objetivo TEXT,
  legenda TEXT,
  materiais TEXT[] DEFAULT '{}',
  checklist JSONB DEFAULT '[]',
  comentarios_internos JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'a_fazer' CHECK (status IN ('a_fazer', 'em_producao', 'em_revisao', 'aprovado', 'agendado', 'publicado')),
  data_publicacao TIMESTAMP WITH TIME ZONE,
  metricas JSONB DEFAULT '{}',
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Marketing Eventos
CREATE TABLE public.marketing_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
  data_fim TIMESTAMP WITH TIME ZONE,
  local TEXT,
  objetivo TEXT,
  tipo_evento TEXT,
  fornecedores JSONB DEFAULT '[]',
  orcamentos JSONB DEFAULT '[]',
  materiais TEXT[] DEFAULT '{}',
  timeline JSONB DEFAULT '{"pre_evento": [], "durante": [], "pos_evento": []}',
  checklist_pre JSONB DEFAULT '[]',
  checklist_durante JSONB DEFAULT '[]',
  checklist_pos JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'planejando' CHECK (status IN ('planejando', 'executando', 'finalizado')),
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Marketing Tráfego Pago
CREATE TABLE public.marketing_trafego_pago (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  objetivo TEXT,
  orcamento NUMERIC(12,2),
  publico TEXT,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('meta_ads', 'google_ads', 'linkedin_ads', 'tiktok_ads', 'outro')),
  data_inicio DATE,
  data_fim DATE,
  criativos TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'planejada' CHECK (status IN ('planejada', 'ativa', 'pausada', 'finalizada')),
  resultados JSONB DEFAULT '{"cpc": null, "cpm": null, "ctr": null, "impressoes": null, "cliques": null, "conversoes": null, "gasto_total": null}',
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Marketing Endomarketing
CREATE TABLE public.marketing_endomarketing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  publico_interno TEXT[],
  objetivo TEXT,
  checklist JSONB DEFAULT '[]',
  artes TEXT[] DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'em_criacao' CHECK (status IN ('em_criacao', 'aprovado', 'enviado')),
  data_envio TIMESTAMP WITH TIME ZONE,
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Banco de Ideias
CREATE TABLE public.marketing_ideias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL CHECK (categoria IN ('post', 'evento', 'campanha', 'endomarketing', 'trafego', 'outro')),
  descricao TEXT,
  referencia_url TEXT,
  referencia_imagem TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'analisada', 'convertida', 'descartada')),
  convertido_para_tipo TEXT,
  convertido_para_id UUID,
  criado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Quadro de Prioridades
CREATE TABLE public.marketing_prioridades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT,
  coluna TEXT NOT NULL DEFAULT 'para_depois' CHECK (coluna IN ('urgente', 'importante', 'em_andamento', 'para_depois')),
  ordem INTEGER DEFAULT 0,
  tipo_relacionado TEXT,
  id_relacionado UUID,
  responsavel_id UUID,
  data_limite DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Planejamento de Campanhas
CREATE TABLE public.marketing_planejamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID REFERENCES public.campanhas(id) ON DELETE SET NULL,
  objetivo TEXT NOT NULL,
  publico TEXT,
  materiais_necessarios TEXT[] DEFAULT '{}',
  cronograma JSONB DEFAULT '[]',
  tarefas JSONB DEFAULT '[]',
  relatorio_final TEXT,
  status TEXT NOT NULL DEFAULT 'em_planejamento' CHECK (status IN ('em_planejamento', 'em_execucao', 'finalizado')),
  responsavel_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketing_conteudos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_trafego_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_endomarketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ideias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_prioridades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_planejamentos ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Usuários autorizados podem gerenciar marketing_conteudos" ON public.marketing_conteudos
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

CREATE POLICY "Usuários autorizados podem gerenciar marketing_eventos" ON public.marketing_eventos
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

CREATE POLICY "Usuários autorizados podem gerenciar marketing_trafego_pago" ON public.marketing_trafego_pago
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

CREATE POLICY "Usuários autorizados podem gerenciar marketing_endomarketing" ON public.marketing_endomarketing
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

CREATE POLICY "Usuários autorizados podem gerenciar marketing_ideias" ON public.marketing_ideias
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

CREATE POLICY "Usuários autorizados podem gerenciar marketing_prioridades" ON public.marketing_prioridades
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));

CREATE POLICY "Usuários autorizados podem gerenciar marketing_planejamentos" ON public.marketing_planejamentos
FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_marketing'::app_role) OR has_role(auth.uid(), 'diretoria'::app_role));