
-- AGES Profissionais (cadastro de profissionais não-médicos)
CREATE TABLE public.ages_profissionais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT,
  rg TEXT,
  data_nascimento DATE,
  profissao TEXT NOT NULL,
  registro_profissional TEXT,
  telefone TEXT,
  email TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  banco TEXT,
  agencia TEXT,
  conta_corrente TEXT,
  chave_pix TEXT,
  status TEXT NOT NULL DEFAULT 'pendente_documentacao',
  observacoes TEXT,
  lead_origem_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AGES Profissionais Documentos
CREATE TABLE public.ages_profissionais_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_id UUID NOT NULL REFERENCES public.ages_profissionais(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  data_emissao DATE,
  data_validade DATE,
  observacoes TEXT,
  uploaded_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AGES Contratos (independente dos contratos gerais)
CREATE TABLE public.ages_contratos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_contrato TEXT,
  profissional_id UUID REFERENCES public.ages_profissionais(id),
  cliente_id UUID REFERENCES public.clientes(id),
  unidade_id UUID REFERENCES public.unidades(id),
  tipo_contrato TEXT,
  objeto_contrato TEXT,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  valor_mensal NUMERIC,
  valor_hora NUMERIC,
  carga_horaria_mensal INTEGER,
  documento_url TEXT,
  status TEXT NOT NULL DEFAULT 'em_negociacao',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AGES Produção (controle mensal)
CREATE TABLE public.ages_producao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_id UUID NOT NULL REFERENCES public.ages_profissionais(id),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id),
  unidade_id UUID REFERENCES public.unidades(id),
  mes_referencia INTEGER NOT NULL,
  ano_referencia INTEGER NOT NULL,
  total_horas NUMERIC NOT NULL DEFAULT 0,
  tipo_alocacao TEXT,
  folha_ponto_url TEXT,
  status_conferencia TEXT NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  conferido_por UUID,
  conferido_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(profissional_id, cliente_id, mes_referencia, ano_referencia)
);

-- AGES Leads (leads de profissionais não-médicos)
CREATE TABLE public.ages_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  profissao TEXT,
  telefone TEXT,
  email TEXT,
  cidade TEXT,
  uf TEXT,
  origem TEXT,
  status TEXT NOT NULL DEFAULT 'novo',
  observacoes TEXT,
  arquivo_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- AGES Licitações (vinculadas às licitações gerais, mas com campos extras)
CREATE TABLE public.ages_licitacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID REFERENCES public.licitacoes(id),
  status TEXT NOT NULL DEFAULT 'pregoes_ages',
  prazo_retorno_gss DATE,
  prazo_licitacao DATE,
  responsavel_id UUID,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ages_profissionais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_profissionais_documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_contratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_producao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_licitacoes ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view ages_profissionais" ON public.ages_profissionais FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authorized users can manage ages_profissionais" ON public.ages_profissionais FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

CREATE POLICY "Authenticated users can view ages_profissionais_documentos" ON public.ages_profissionais_documentos FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authorized users can manage ages_profissionais_documentos" ON public.ages_profissionais_documentos FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

CREATE POLICY "Authenticated users can view ages_contratos" ON public.ages_contratos FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authorized users can manage ages_contratos" ON public.ages_contratos FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

CREATE POLICY "Authenticated users can view ages_producao" ON public.ages_producao FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authorized users can manage ages_producao" ON public.ages_producao FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

CREATE POLICY "Authenticated users can view ages_leads" ON public.ages_leads FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can insert ages_leads" ON public.ages_leads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Authorized users can manage ages_leads" ON public.ages_leads FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role));

CREATE POLICY "Authenticated users can view ages_licitacoes" ON public.ages_licitacoes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authorized users can manage ages_licitacoes" ON public.ages_licitacoes FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

-- Kanban status config for AGES
INSERT INTO public.kanban_status_config (modulo, status_id, label, ordem, cor, ativo) VALUES
('ages_licitacoes', 'pregoes_ages', 'Pregões AGES', 1, '#3B82F6', true),
('ages_licitacoes', 'credenciamentos', 'Credenciamentos', 2, '#8B5CF6', true),
('ages_licitacoes', 'aguardando_deliberacao', 'Aguardando Deliberação', 3, '#F59E0B', true),
('ages_licitacoes', 'aguardando_esclarecimento', 'Aguardando Esclarecimento', 4, '#EAB308', true),
('ages_licitacoes', 'processo_juridico', 'Em Processo Jurídico', 5, '#EF4444', true),
('ages_licitacoes', 'cadastro_proposta', 'Cadastro de Proposta', 6, '#06B6D4', true),
('ages_licitacoes', 'aguardando_sessao', 'Aguardando Sessão', 7, '#14B8A6', true),
('ages_licitacoes', 'licitacao_andamento', 'Licitação em Andamento', 8, '#22C55E', true),
('ages_licitacoes', 'arrematados', 'Arrematados', 9, '#10B981', true),
('ages_licitacoes', 'sessoes_encerradas', 'Sessões Encerradas', 10, '#6B7280', true),
('ages_licitacoes', 'suspensos_revogados', 'Editais Suspensos/Revogados', 11, '#DC2626', true),
('ages_licitacoes', 'reprovados', 'Reprovados', 12, '#991B1B', true);

-- Storage bucket for AGES documents
INSERT INTO storage.buckets (id, name, public) VALUES ('ages-documentos', 'ages-documentos', false) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can view ages documents" ON storage.objects FOR SELECT USING (bucket_id = 'ages-documentos' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can upload ages documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'ages-documentos' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated users can delete ages documents" ON storage.objects FOR DELETE USING (bucket_id = 'ages-documentos' AND auth.uid() IS NOT NULL);
