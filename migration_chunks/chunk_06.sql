

-- === 20251209181841_efccf096-a9d0-4768-a3f1-d054d422feaf.sql ===
-- Adicionar campo cor à tabela captacao_permissoes_usuario
ALTER TABLE public.captacao_permissoes_usuario 
ADD COLUMN IF NOT EXISTS cor TEXT;

-- === 20251209191836_839c991f-b55b-4d9e-a5f6-47ef5ae3621c.sql ===
-- Tornar o bucket sigzap-media público para permitir acesso às URLs de mídia
UPDATE storage.buckets 
SET public = true 
WHERE id = 'sigzap-media';

-- Se não existir, criar como público
INSERT INTO storage.buckets (id, name, public)
VALUES ('sigzap-media', 'sigzap-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- === 20251210113204_bf598681-a621-4743-95aa-c32122d7254f.sql ===
-- Add approval fields for "Corpo Médico" conversion
ALTER TABLE public.medicos
ADD COLUMN IF NOT EXISTS aprovacao_contrato_assinado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS aprovacao_documentacao_unidade boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS aprovacao_cadastro_unidade boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS data_aprovacao_corpo_medico timestamp with time zone,
ADD COLUMN IF NOT EXISTS aprovado_corpo_medico_por uuid;

-- === 20251210120722_94f8652c-b17e-49db-9c4a-1dfd5c99ed33.sql ===
-- Add policy to allow authenticated users to insert leads
DROP POLICY IF EXISTS "Authenticated users can insert leads" ON public.leads;
CREATE POLICY "Authenticated users can insert leads" 
ON public.leads 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- === 20251212120225_d83064fa-233c-456f-9cb9-44ee135daafb.sql ===
-- Add reaction column to sigzap_messages table
DO $acol$ BEGIN ALTER TABLE public.sigzap_messages 
ADD COLUMN reaction TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- Add comment explaining the column
COMMENT ON COLUMN public.sigzap_messages.reaction IS 'Emoji reaction to this message';

-- === 20251212133705_b59348e3-8480-4a18-a44c-639bac5a0377.sql ===

-- AGES Profissionais (cadastro de profissionais não-médicos)
CREATE TABLE IF NOT EXISTS public.ages_profissionais (
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
CREATE TABLE IF NOT EXISTS public.ages_profissionais_documentos (
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
CREATE TABLE IF NOT EXISTS public.ages_contratos (
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
CREATE TABLE IF NOT EXISTS public.ages_producao (
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
CREATE TABLE IF NOT EXISTS public.ages_leads (
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
CREATE TABLE IF NOT EXISTS public.ages_licitacoes (
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
DROP POLICY IF EXISTS "Authenticated users can view ages_profissionais" ON public.ages_profissionais;
CREATE POLICY "Authenticated users can view ages_profissionais" ON public.ages_profissionais FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authorized users can manage ages_profissionais" ON public.ages_profissionais;
CREATE POLICY "Authorized users can manage ages_profissionais" ON public.ages_profissionais FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view ages_profissionais_documentos" ON public.ages_profissionais_documentos;
CREATE POLICY "Authenticated users can view ages_profissionais_documentos" ON public.ages_profissionais_documentos FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authorized users can manage ages_profissionais_documentos" ON public.ages_profissionais_documentos;
CREATE POLICY "Authorized users can manage ages_profissionais_documentos" ON public.ages_profissionais_documentos FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view ages_contratos" ON public.ages_contratos;
CREATE POLICY "Authenticated users can view ages_contratos" ON public.ages_contratos FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos" ON public.ages_contratos;
CREATE POLICY "Authorized users can manage ages_contratos" ON public.ages_contratos FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view ages_producao" ON public.ages_producao;
CREATE POLICY "Authenticated users can view ages_producao" ON public.ages_producao FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authorized users can manage ages_producao" ON public.ages_producao;
CREATE POLICY "Authorized users can manage ages_producao" ON public.ages_producao FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view ages_leads" ON public.ages_leads;
CREATE POLICY "Authenticated users can view ages_leads" ON public.ages_leads FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can insert ages_leads" ON public.ages_leads;
CREATE POLICY "Authenticated users can insert ages_leads" ON public.ages_leads FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authorized users can manage ages_leads" ON public.ages_leads;
CREATE POLICY "Authorized users can manage ages_leads" ON public.ages_leads FOR ALL USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view ages_licitacoes" ON public.ages_licitacoes;
CREATE POLICY "Authenticated users can view ages_licitacoes" ON public.ages_licitacoes FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authorized users can manage ages_licitacoes" ON public.ages_licitacoes;
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

DROP POLICY IF EXISTS "Authenticated users can view ages documents" ON storage.objects;
CREATE POLICY "Authenticated users can view ages documents" ON storage.objects FOR SELECT USING (bucket_id = 'ages-documentos' AND auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can upload ages documents" ON storage.objects;
CREATE POLICY "Authenticated users can upload ages documents" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'ages-documentos' AND auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Authenticated users can delete ages documents" ON storage.objects;
CREATE POLICY "Authenticated users can delete ages documents" ON storage.objects FOR DELETE USING (bucket_id = 'ages-documentos' AND auth.uid() IS NOT NULL);


-- === 20251212135257_b3e8b3af-8be2-462c-b574-18862c36d8af.sql ===
-- Tabela para documentos de contratos AGES
CREATE TABLE IF NOT EXISTS public.ages_contratos_documentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  tipo_documento TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  observacoes TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ages_contratos_documentos ENABLE ROW LEVEL SECURITY;

-- RLS policies
DROP POLICY IF EXISTS "Authenticated users can view ages_contratos_documentos" ON public.ages_contratos_documentos;
CREATE POLICY "Authenticated users can view ages_contratos_documentos"
  ON public.ages_contratos_documentos FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert ages_contratos_documentos" ON public.ages_contratos_documentos;
CREATE POLICY "Authenticated users can insert ages_contratos_documentos"
  ON public.ages_contratos_documentos FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete ages_contratos_documentos" ON public.ages_contratos_documentos;
CREATE POLICY "Authenticated users can delete ages_contratos_documentos"
  ON public.ages_contratos_documentos FOR DELETE TO authenticated USING (true);

-- === 20251212141345_928bfc09-18e0-4910-81ce-1c673899fc59.sql ===
-- Remover políticas existentes
DROP POLICY IF EXISTS "Authenticated users can delete anexos" ON licitacoes_anexos;
DROP POLICY IF EXISTS "Authenticated users can insert anexos" ON licitacoes_anexos;
DROP POLICY IF EXISTS "Authenticated users can view anexos" ON licitacoes_anexos;

-- Recriar políticas RLS corretamente
DROP POLICY IF EXISTS "Authenticated users can view licitacoes_anexos" ON public.licitacoes_anexos;
CREATE POLICY "Authenticated users can view licitacoes_anexos" 
ON public.licitacoes_anexos 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can insert licitacoes_anexos" ON public.licitacoes_anexos;
CREATE POLICY "Authenticated users can insert licitacoes_anexos" 
ON public.licitacoes_anexos 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated users can delete licitacoes_anexos" ON public.licitacoes_anexos;
CREATE POLICY "Authenticated users can delete licitacoes_anexos" 
ON public.licitacoes_anexos 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- === 20251212165433_bd39e4b1-9d47-4011-a287-e81924571d2c.sql ===
-- Criar sequência para codigo_interno começando do valor máximo atual + 1
CREATE SEQUENCE IF NOT EXISTS contratos_codigo_interno_seq;

-- Ajustar a sequência para começar do próximo valor disponível
SELECT setval('contratos_codigo_interno_seq', COALESCE((SELECT MAX(codigo_interno) FROM contratos), 0) + 1, false);

-- Definir o default do campo codigo_interno para usar a sequência
DO $altc$ BEGIN ALTER TABLE contratos ALTER COLUMN codigo_interno SET DEFAULT nextval('contratos_codigo_interno_seq'); EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $altc$;

-- Criar função para gerar codigo_interno automaticamente se não fornecido
CREATE OR REPLACE FUNCTION public.generate_contrato_codigo_interno()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.codigo_interno IS NULL THEN
    NEW.codigo_interno := nextval('contratos_codigo_interno_seq');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Criar trigger para executar a função antes de inserir
DROP TRIGGER IF EXISTS set_contrato_codigo_interno ON contratos;
DROP TRIGGER IF EXISTS "set_contrato_codigo_interno" ON contratos;
CREATE TRIGGER set_contrato_codigo_interno
  BEFORE INSERT ON contratos
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_contrato_codigo_interno();

-- === 20251212165703_5d38f17c-5579-41eb-9c47-15dbb2f866bf.sql ===

-- ETAPA 1: Criar tabela contrato_rascunho (staging de contratos)
CREATE TABLE IF NOT EXISTS public.contrato_rascunho (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'consolidado', 'cancelado')),
  overlay_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  consolidado_em TIMESTAMP WITH TIME ZONE,
  consolidado_por UUID REFERENCES auth.users(id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_contrato_rascunho_licitacao ON public.contrato_rascunho(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_contrato_rascunho_status ON public.contrato_rascunho(status);
CREATE INDEX IF NOT EXISTS idx_contrato_rascunho_contrato ON public.contrato_rascunho(contrato_id);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS "update_contrato_rascunho_updated_at" ON public.contrato_rascunho;
CREATE TRIGGER update_contrato_rascunho_updated_at
  BEFORE UPDATE ON public.contrato_rascunho
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de anexos do rascunho
CREATE TABLE IF NOT EXISTS public.contrato_rascunho_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_rascunho_id UUID NOT NULL REFERENCES public.contrato_rascunho(id) ON DELETE CASCADE,
  arquivo_url TEXT NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_path TEXT,
  mime_type TEXT,
  origem TEXT NOT NULL DEFAULT 'licitacao_card',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_contrato_rascunho_anexos_rascunho ON public.contrato_rascunho_anexos(contrato_rascunho_id);

-- Adicionar coluna licitacao_origem_id na tabela contratos (aditivo)
ALTER TABLE public.contratos ADD COLUMN IF NOT EXISTS licitacao_origem_id UUID REFERENCES public.licitacoes(id);
CREATE INDEX IF NOT EXISTS idx_contratos_licitacao_origem ON public.contratos(licitacao_origem_id);

-- RLS para contrato_rascunho
ALTER TABLE public.contrato_rascunho ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar rascunhos" ON public.contrato_rascunho;
CREATE POLICY "Usuários autenticados podem visualizar rascunhos"
  ON public.contrato_rascunho FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar rascunhos" ON public.contrato_rascunho;
CREATE POLICY "Usuários autorizados podem gerenciar rascunhos"
  ON public.contrato_rascunho FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'lideres'));

-- RLS para contrato_rascunho_anexos
ALTER TABLE public.contrato_rascunho_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar anexos de rascunho" ON public.contrato_rascunho_anexos;
CREATE POLICY "Usuários autenticados podem visualizar anexos de rascunho"
  ON public.contrato_rascunho_anexos FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar anexos de rascunho" ON public.contrato_rascunho_anexos;
CREATE POLICY "Usuários autorizados podem gerenciar anexos de rascunho"
  ON public.contrato_rascunho_anexos FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'lideres'));


-- === 20251212172425_7ce0e603-57e6-46f4-895d-4767e01cdb27.sql ===
-- Create storage policies for licitacoes-anexos bucket
DROP POLICY IF EXISTS "Authenticated users can upload to licitacoes-anexos" ON storage.objects;
CREATE POLICY "Authenticated users can upload to licitacoes-anexos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'licitacoes-anexos');

DROP POLICY IF EXISTS "Authenticated users can view licitacoes-anexos" ON storage.objects;
CREATE POLICY "Authenticated users can view licitacoes-anexos"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'licitacoes-anexos');

DROP POLICY IF EXISTS "Public can view licitacoes-anexos" ON storage.objects;
CREATE POLICY "Public can view licitacoes-anexos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'licitacoes-anexos');

DROP POLICY IF EXISTS "Authenticated users can update licitacoes-anexos" ON storage.objects;
CREATE POLICY "Authenticated users can update licitacoes-anexos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'licitacoes-anexos');

DROP POLICY IF EXISTS "Authenticated users can delete licitacoes-anexos" ON storage.objects;
CREATE POLICY "Authenticated users can delete licitacoes-anexos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'licitacoes-anexos');

-- === 20251212190826_26587111-b5df-452a-9694-3269401a8a8b.sql ===
-- Adicionar colunas para validação de conversão em contrato
-- Coluna JSONB para armazenar serviços com nome e valor
ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS servicos_contrato jsonb DEFAULT '[]'::jsonb;

-- Comentário explicativo
COMMENT ON COLUMN public.licitacoes.servicos_contrato IS 'Array de serviços do contrato: [{nome: string, valor: number}]';

-- 3 Checkboxes obrigatórios para validação
ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS check_conversao_1 boolean DEFAULT false;

ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS check_conversao_2 boolean DEFAULT false;

ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS check_conversao_3 boolean DEFAULT false;

-- Comentários explicativos
COMMENT ON COLUMN public.licitacoes.check_conversao_1 IS 'Checkbox 1: Documentação verificada';
COMMENT ON COLUMN public.licitacoes.check_conversao_2 IS 'Checkbox 2: Valores conferidos';
COMMENT ON COLUMN public.licitacoes.check_conversao_3 IS 'Checkbox 3: Responsável definido';

-- === 20251212191621_ab8efb82-ea9c-4075-a770-fd49b4904054.sql ===
-- Criar enum para tipos de origem do card
DO $tw$ BEGIN CREATE TYPE origem_tipo_board AS ENUM ('manual', 'licitacao_arrematada'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;


-- Criar enum para status do kanban de captação
DO $tw$ BEGIN CREATE TYPE status_captacao_board AS ENUM ('prospectar', 'analisando', 'em_andamento', 'completo', 'descarte'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;


-- Criar tabela do Kanban de Captação
CREATE TABLE IF NOT EXISTS public.captacao_contratos_board (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  origem_tipo origem_tipo_board NOT NULL DEFAULT 'manual',
  origem_licitacao_id UUID REFERENCES public.licitacoes(id) ON DELETE SET NULL,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
  status status_captacao_board NOT NULL DEFAULT 'prospectar',
  titulo_card TEXT NOT NULL,
  overlay_json JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.captacao_contratos_board ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar cards" ON public.captacao_contratos_board;
CREATE POLICY "Usuários autenticados podem visualizar cards" 
ON public.captacao_contratos_board 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autorizados podem gerenciar cards" ON public.captacao_contratos_board;
CREATE POLICY "Usuários autorizados podem gerenciar cards" 
ON public.captacao_contratos_board 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos')
);

-- Índice único para garantir idempotência (uma licitação só pode gerar um card)
CREATE UNIQUE INDEX IF NOT EXISTS idx_captacao_board_licitacao_unica 
ON public.captacao_contratos_board(origem_licitacao_id) 
WHERE origem_licitacao_id IS NOT NULL;

-- Função para criar card automaticamente quando licitação for arrematada
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
RETURNS TRIGGER AS $$
BEGIN
  -- Só executar se o status mudou para 'arrematados'
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    -- Verificar se já existe card para esta licitação (idempotência)
    IF NOT EXISTS (SELECT 1 FROM public.captacao_contratos_board WHERE origem_licitacao_id = NEW.id) THEN
      INSERT INTO public.captacao_contratos_board (
        origem_tipo,
        origem_licitacao_id,
        status,
        titulo_card,
        overlay_json
      ) VALUES (
        'licitacao_arrematada',
        NEW.id,
        'prospectar',
        COALESCE(NEW.numero_edital, 'Licitação') || ' - ' || COALESCE(LEFT(NEW.objeto, 50), 'Sem objeto'),
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', NEW.objeto,
          'orgao', NEW.orgao,
          'uf', NEW.uf,
          'valor_estimado', NEW.valor_estimado,
          'data_arrematacao', now()
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para chamar a função quando licitação for atualizada
DROP TRIGGER IF EXISTS "trigger_create_captacao_card_on_arrematados" ON public.licitacoes;
CREATE TRIGGER trigger_create_captacao_card_on_arrematados
AFTER UPDATE ON public.licitacoes
FOR EACH ROW
EXECUTE FUNCTION public.create_captacao_card_on_licitacao_arrematada();

-- Trigger para updated_at
DROP TRIGGER IF EXISTS "update_captacao_board_updated_at" ON public.captacao_contratos_board;
CREATE TRIGGER update_captacao_board_updated_at
BEFORE UPDATE ON public.captacao_contratos_board
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.captacao_contratos_board;

-- === 20251212193828_8fc441fc-5b5b-4a95-ab36-315ada911c72.sql ===
-- Corrigir trigger que usa campo 'uf' inexistente (o campo correto é 'municipio_uf')
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só executar se o status mudou para 'arrematados'
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    -- Verificar se já existe card para esta licitação (idempotência)
    IF NOT EXISTS (SELECT 1 FROM public.captacao_contratos_board WHERE origem_licitacao_id = NEW.id) THEN
      INSERT INTO public.captacao_contratos_board (
        origem_tipo,
        origem_licitacao_id,
        status,
        titulo_card,
        overlay_json
      ) VALUES (
        'licitacao_arrematada',
        NEW.id,
        'prospectar',
        COALESCE(NEW.numero_edital, 'Licitação') || ' - ' || COALESCE(LEFT(NEW.objeto, 50), 'Sem objeto'),
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', NEW.objeto,
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'data_arrematacao', now()
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- === 20251212194843_1382c23a-21eb-48b4-9341-284abd76ea0a.sql ===
-- ETAPA 1: Adicionar campo status_kanban e servicos_json ao contrato_rascunho existente
-- (mudanças aditivas, não altera estrutura de contratos)

-- Adicionar coluna status_kanban com enum inline
ALTER TABLE public.contrato_rascunho 
ADD COLUMN IF NOT EXISTS status_kanban text NOT NULL DEFAULT 'prospectar';

-- Adicionar coluna servicos_json para array de serviços
ALTER TABLE public.contrato_rascunho 
ADD COLUMN IF NOT EXISTS servicos_json jsonb DEFAULT '[]'::jsonb;

-- Adicionar checkboxes de validação para licitações
ALTER TABLE public.licitacoes
ADD COLUMN IF NOT EXISTS check_habilitacao boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS check_documentacao boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS check_proposta boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS servicos_licitacao jsonb DEFAULT '[]'::jsonb;

-- ETAPA 2: Atualizar trigger para criar contrato_rascunho em vez de captacao_contratos_board
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Só executar se o status mudou para 'arrematados'
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    
    -- Verificar se já existe contrato_rascunho para esta licitação (idempotência)
    IF NOT EXISTS (SELECT 1 FROM public.contrato_rascunho WHERE licitacao_id = NEW.id) THEN
      
      -- Criar contrato rascunho
      INSERT INTO public.contrato_rascunho (
        licitacao_id,
        status,
        status_kanban,
        overlay_json,
        servicos_json
      ) VALUES (
        NEW.id,
        'rascunho',
        'prospectar',
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', NEW.objeto,
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'modalidade', NEW.modalidade,
          'data_disputa', NEW.data_disputa,
          'data_arrematacao', now()
        ),
        COALESCE(NEW.servicos_licitacao, '[]'::jsonb)
      );
      
      -- Log de auditoria
      PERFORM log_auditoria(
        'Licitações',
        'contrato_rascunho',
        'INSERT',
        NEW.id::text,
        'Licitação ' || COALESCE(NEW.numero_edital, 'S/N') || ' gerou contrato temporário',
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital),
        NULL,
        'Criação automática de contrato temporário após arrematação'
      );
    END IF;
    
    -- Manter compatibilidade: também cria em captacao_contratos_board se não existir
    IF NOT EXISTS (SELECT 1 FROM public.captacao_contratos_board WHERE origem_licitacao_id = NEW.id) THEN
      INSERT INTO public.captacao_contratos_board (
        origem_tipo,
        origem_licitacao_id,
        status,
        titulo_card,
        overlay_json
      ) VALUES (
        'licitacao_arrematada',
        NEW.id,
        'prospectar',
        COALESCE(NEW.numero_edital, 'Licitação') || ' - ' || COALESCE(LEFT(NEW.objeto, 50), 'Sem objeto'),
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', NEW.objeto,
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'data_arrematacao', now()
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Criar trigger se não existir
DROP TRIGGER IF EXISTS trigger_licitacao_arrematada ON public.licitacoes;
DROP TRIGGER IF EXISTS "trigger_licitacao_arrematada" ON public.licitacoes;
CREATE TRIGGER trigger_licitacao_arrematada
  AFTER UPDATE ON public.licitacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_captacao_card_on_licitacao_arrematada();

-- Habilitar realtime para contrato_rascunho
ALTER PUBLICATION supabase_realtime ADD TABLE public.contrato_rascunho;

-- === 20251215115729_297adde4-a48a-4653-93e6-a0958b651bee.sql ===
-- Add array columns for multiple specialties and linked units
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS especialidades text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS unidades_vinculadas uuid[] DEFAULT '{}';

-- === 20251215130129_3dca21d7-276c-47e6-9b31-234193260653.sql ===
-- Adiciona campos status_medico e status_contrato na tabela leads
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS status_medico TEXT DEFAULT 'Ativo',
ADD COLUMN IF NOT EXISTS status_contrato TEXT DEFAULT 'Ativo';

-- === 20251215133411_0f995532-aad4-4cc5-82e5-32f0ac0addf0.sql ===

-- Migration aditiva para migração de médicos para leads
-- Adiciona colunas de rastreamento sem remover nada

-- 1. Coluna para rastrear origem da migração (unique para idempotência)
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS migrado_de_medico_id uuid UNIQUE;

-- 2. Coluna para timestamp da migração
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS migrado_de_medico_em timestamp with time zone;

-- 3. Comentários para documentação
COMMENT ON COLUMN public.leads.migrado_de_medico_id IS 'ID do médico de origem quando migrado do MedicoDialog. Unique para garantir idempotência.';
COMMENT ON COLUMN public.leads.migrado_de_medico_em IS 'Data/hora da migração do MedicoDialog para LeadProntuarioDialog.';

-- 4. Index para performance nas consultas de migração
CREATE INDEX IF NOT EXISTS idx_leads_migrado_de_medico_id ON public.leads(migrado_de_medico_id) WHERE migrado_de_medico_id IS NOT NULL;


-- === 20251215193751_e463fb1a-355e-4499-80ad-1e57861397df.sql ===
-- Tornar bucket comunicacao-anexos público
UPDATE storage.buckets 
SET public = true 
WHERE id = 'comunicacao-anexos';

-- Criar política de visualização pública (drop se existir primeiro)
DROP POLICY IF EXISTS "Public can view comunicacao anexos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view comunicacao anexos" ON storage.objects;
CREATE POLICY "Public can view comunicacao anexos"
ON storage.objects FOR SELECT
USING (bucket_id = 'comunicacao-anexos');

-- Criar política para usuários autenticados fazerem upload
DROP POLICY IF EXISTS "Authenticated users can upload comunicacao anexos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload comunicacao anexos" ON storage.objects;
CREATE POLICY "Authenticated users can upload comunicacao anexos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'comunicacao-anexos');

-- Criar política para usuários autenticados deletarem seus próprios arquivos
DROP POLICY IF EXISTS "Users can delete own comunicacao anexos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own comunicacao anexos" ON storage.objects;
CREATE POLICY "Users can delete own comunicacao anexos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'comunicacao-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- === 20251216113319_029f5d9d-0e62-40d2-8f83-796895bba44b.sql ===
-- Permitir user_id NULL na tabela licitacoes_atividades para atividades do sistema/API
DO $altc$ BEGIN ALTER TABLE licitacoes_atividades ALTER COLUMN user_id DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $altc$;

-- Adicionar política para service_role inserir atividades
DROP POLICY IF EXISTS "Service role pode inserir atividades" ON licitacoes_atividades;
DROP POLICY IF EXISTS "Service role pode inserir atividades" ON licitacoes_atividades;
CREATE POLICY "Service role pode inserir atividades" 
ON licitacoes_atividades 
FOR INSERT 
WITH CHECK (true);

-- === 20251216121411_d4665d71-a3ca-493c-b010-7133d946b436.sql ===
-- Atualizar a função do trigger para também criar contrato real quando licitação é arrematada
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  novo_contrato_id UUID;
  novo_rascunho_id UUID;
BEGIN
  -- Só executar se o status mudou para 'arrematados'
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    
    -- 1. CRIAR CONTRATO REAL na tabela contratos (se não existir)
    IF NOT EXISTS (SELECT 1 FROM public.contratos WHERE licitacao_origem_id = NEW.id) THEN
      INSERT INTO public.contratos (
        codigo_contrato,
        data_inicio,
        data_fim,
        status_contrato,
        licitacao_origem_id,
        valor_estimado,
        objeto_contrato,
        assinado
      ) VALUES (
        'LC-' || COALESCE(NEW.numero_edital, 'S/N'),
        CURRENT_DATE,
        (CURRENT_DATE + INTERVAL '12 months')::DATE,
        'Pre-Contrato',
        NEW.id,
        NEW.valor_estimado,
        LEFT(NEW.objeto, 500),
        'Pendente'
      )
      RETURNING id INTO novo_contrato_id;
      
      -- Log de auditoria do contrato
      PERFORM log_auditoria(
        'Contratos',
        'contratos',
        'INSERT',
        novo_contrato_id::text,
        'Pré-contrato criado automaticamente da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital, 'origem', 'arrematacao_automatica'),
        NULL,
        'Criação automática de pré-contrato após arrematação de licitação'
      );
    END IF;
    
    -- 2. Criar contrato_rascunho para o Kanban de captação (se não existir)
    IF NOT EXISTS (SELECT 1 FROM public.contrato_rascunho WHERE licitacao_id = NEW.id) THEN
      INSERT INTO public.contrato_rascunho (
        licitacao_id,
        status,
        status_kanban,
        overlay_json,
        servicos_json
      ) VALUES (
        NEW.id,
        'rascunho',
        'prospectar',
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', NEW.objeto,
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'modalidade', NEW.modalidade,
          'data_disputa', NEW.data_disputa,
          'data_arrematacao', now()
        ),
        COALESCE(NEW.servicos_contrato, '[]'::jsonb)
      )
      RETURNING id INTO novo_rascunho_id;
      
      -- Log de auditoria do rascunho
      PERFORM log_auditoria(
        'Licitações',
        'contrato_rascunho',
        'INSERT',
        novo_rascunho_id::text,
        'Contrato temporário criado da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital),
        NULL,
        'Criação automática de contrato temporário após arrematação'
      );
    END IF;
    
  END IF;
  RETURN NEW;
END;
$function$;

-- Garantir que o trigger existe
DROP TRIGGER IF EXISTS on_licitacao_arrematada ON public.licitacoes;
DROP TRIGGER IF EXISTS "on_licitacao_arrematada" ON public.licitacoes;
CREATE TRIGGER on_licitacao_arrematada
  AFTER UPDATE ON public.licitacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_captacao_card_on_licitacao_arrematada();

-- === 20251216121842_df937c93-d90b-42f0-9e2e-9ac8e909a520.sql ===

-- Remover o constraint antigo e criar um novo que permita Pre-Contratos sem cliente/medico
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS check_cliente_ou_medico;

-- Criar novo constraint que permite Pre-Contratos sem cliente_id ou medico_id
DO $ac$ BEGIN ALTER TABLE public.contratos ADD CONSTRAINT check_cliente_ou_medico 
  CHECK (
    status_contrato = 'Pre-Contrato' 
    OR cliente_id IS NOT NULL 
    OR medico_id IS NOT NULL
  ); EXCEPTION WHEN duplicate_object THEN NULL; END $ac$;


-- === 20251216122601_3bfe7a7a-3381-4c6b-a094-f678fe348f4b.sql ===

-- Remover o constraint antigo de status_contrato
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_status_contrato_check;

-- Criar novo constraint incluindo 'Pre-Contrato' como valor válido
DO $ac$ BEGIN ALTER TABLE public.contratos ADD CONSTRAINT contratos_status_contrato_check 
  CHECK (status_contrato IN ('Ativo', 'Inativo', 'Encerrado', 'Suspenso', 'Em Renovação', 'Pre-Contrato')); EXCEPTION WHEN duplicate_object THEN NULL; END $ac$;


-- === 20251217115359_9c70c46b-b196-474d-a6a6-40b18c2fe86d.sql ===
-- Add reply_to_id field for message replies
DO $acol$ BEGIN ALTER TABLE public.comunicacao_mensagens 
ADD COLUMN reply_to_id uuid REFERENCES public.comunicacao_mensagens(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- Create index for faster reply lookups
CREATE INDEX IF NOT EXISTS idx_comunicacao_mensagens_reply_to ON public.comunicacao_mensagens(reply_to_id);

-- === 20251217125015_7c267d74-589c-4d5e-b04b-8d440fda7936.sql ===
-- Add DELETE policy for comunicacao_participantes
DROP POLICY IF EXISTS "Channel creators and admins can delete participants" ON comunicacao_participantes;
CREATE POLICY "Channel creators and admins can delete participants"
ON comunicacao_participantes
FOR DELETE
USING (
  (EXISTS (
    SELECT 1 FROM comunicacao_canais
    WHERE comunicacao_canais.id = comunicacao_participantes.canal_id
    AND comunicacao_canais.criado_por = auth.uid()
  ))
  OR is_admin(auth.uid())
);

-- Add DELETE policy for comunicacao_canais (only admins)
DROP POLICY IF EXISTS "Admins can delete channels" ON comunicacao_canais;
CREATE POLICY "Admins can delete channels"
ON comunicacao_canais
FOR DELETE
USING (is_admin(auth.uid()));

-- === 20251217180400_e4cedd58-e1bb-4aee-bec2-3c0e884653e0.sql ===
-- Enable REPLICA IDENTITY FULL for licitacoes table to get old values in realtime updates
ALTER TABLE public.licitacoes REPLICA IDENTITY FULL;

-- === 20251217181247_003afd75-8aee-47ef-af3c-d0fc097e9a2b.sql ===
-- Add FK so PostgREST can join licitacoes_atividades.user_id -> profiles.id
DO $ac$ BEGIN ALTER TABLE public.licitacoes_atividades
  ADD CONSTRAINT licitacoes_atividades_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles (id)
  ON DELETE SET NULL; EXCEPTION WHEN duplicate_object THEN NULL; END $ac$;

-- === 20251217182601_8d33587d-58a2-4bb2-b132-e272f9a3bad3.sql ===
-- Add RLS policies for non-admin users to access contrato_rascunho and contratos

-- 1. Allow gestor_captacao to manage contrato_rascunho
DROP POLICY IF EXISTS "Gestores de captação podem gerenciar contrato_rascunho" ON public.contrato_rascunho;
DROP POLICY IF EXISTS "Gestores de captação podem gerenciar contrato_rascunho" ON public.contrato_rascunho;
CREATE POLICY "Gestores de captação podem gerenciar contrato_rascunho"
ON public.contrato_rascunho
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'lideres')
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'lideres')
);

-- 2. Allow lideres to view contratos (SELECT only)
DROP POLICY IF EXISTS "Líderes podem visualizar contratos" ON public.contratos;
DROP POLICY IF EXISTS "Líderes podem visualizar contratos" ON public.contratos;
CREATE POLICY "Líderes podem visualizar contratos"
ON public.contratos
FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'lideres') OR
  has_role(auth.uid(), 'coordenador_escalas') OR
  has_role(auth.uid(), 'gestor_financeiro') OR
  has_role(auth.uid(), 'diretoria')
);

-- 3. Allow gestor_contratos, gestor_captacao to insert/update/delete contratos
DROP POLICY IF EXISTS "Gestores podem gerenciar contratos" ON public.contratos;
DROP POLICY IF EXISTS "Gestores podem gerenciar contratos" ON public.contratos;
CREATE POLICY "Gestores podem gerenciar contratos"
ON public.contratos
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao')
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao')
);

-- 4. Allow gestor_captacao to manage licitacoes (they can move cards)
DROP POLICY IF EXISTS "Gestores de captação podem gerenciar licitações" ON public.licitacoes;
DROP POLICY IF EXISTS "Gestores de captação podem gerenciar licitações" ON public.licitacoes;
CREATE POLICY "Gestores de captação podem gerenciar licitações"
ON public.licitacoes
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao') OR
  has_role(auth.uid(), 'lideres')
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_captacao') OR
  has_role(auth.uid(), 'lideres')
);

-- 5. Allow authenticated users to view licitacoes (for kanban display)
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar licitações" ON public.licitacoes;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar licitações" ON public.licitacoes;
CREATE POLICY "Usuários autenticados podem visualizar licitações"
ON public.licitacoes
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- 6. Allow gestor_captacao and lideres to insert licitacoes_atividades
DROP POLICY IF EXISTS "Gestores podem inserir atividades de licitações" ON public.licitacoes_atividades;
DROP POLICY IF EXISTS "Gestores podem inserir atividades de licitações" ON public.licitacoes_atividades;
CREATE POLICY "Gestores podem inserir atividades de licitações"
ON public.licitacoes_atividades
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    auth.uid() = user_id OR
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos') OR 
    has_role(auth.uid(), 'gestor_captacao') OR
    has_role(auth.uid(), 'lideres')
  )
);

-- 7. Allow authenticated users to view contrato_rascunho (for display in captação kanban)
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar contrato_rascunho" ON public.contrato_rascunho;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar contrato_rascunho" ON public.contrato_rascunho;
CREATE POLICY "Usuários autenticados podem visualizar contrato_rascunho"
ON public.contrato_rascunho
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- === 20251217214334_2782c1e3-205e-4378-9d4a-d30ca864d1f0.sql ===
-- 1. Add contrato_id and unidade_id to proposta table
ALTER TABLE public.proposta ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES public.contratos(id) ON DELETE SET NULL;
ALTER TABLE public.proposta ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL;

-- 2. Make servico_id nullable (for backwards compatibility)
DO $altc$ BEGIN ALTER TABLE public.proposta ALTER COLUMN servico_id DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $altc$;

-- 3. Create proposta_itens table to store items with values
CREATE TABLE IF NOT EXISTS public.proposta_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.proposta(id) ON DELETE CASCADE,
  contrato_item_id uuid REFERENCES public.contrato_itens(id) ON DELETE SET NULL,
  item_nome text NOT NULL,
  valor_contrato numeric DEFAULT 0,
  valor_medico numeric NOT NULL DEFAULT 0,
  quantidade integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Enable RLS on proposta_itens
ALTER TABLE public.proposta_itens ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for proposta_itens
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar proposta_itens" ON public.proposta_itens;
CREATE POLICY "Usuários autenticados podem visualizar proposta_itens"
ON public.proposta_itens
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Gestores podem gerenciar proposta_itens" ON public.proposta_itens;
CREATE POLICY "Gestores podem gerenciar proposta_itens"
ON public.proposta_itens
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos')
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos')
);

-- 6. Add updated_at trigger for proposta_itens
DROP TRIGGER IF EXISTS "update_proposta_itens_updated_at" ON public.proposta_itens;
CREATE TRIGGER update_proposta_itens_updated_at
BEFORE UPDATE ON public.proposta_itens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_proposta_contrato_id ON public.proposta(contrato_id);
CREATE INDEX IF NOT EXISTS idx_proposta_unidade_id ON public.proposta(unidade_id);
CREATE INDEX IF NOT EXISTS idx_proposta_itens_proposta_id ON public.proposta_itens(proposta_id);

-- === 20251218143501_70b0b795-c815-4719-bba2-db370b692da6.sql ===
-- Desvincula registros
UPDATE public.contratos SET licitacao_origem_id = NULL 
WHERE licitacao_origem_id IN (SELECT id FROM public.licitacoes);

UPDATE public.leads SET licitacao_origem_id = NULL 
WHERE licitacao_origem_id IN (SELECT id FROM public.licitacoes);

-- Deleta registros derivados
DELETE FROM public.captacao_contratos_board 
WHERE origem_licitacao_id IN (SELECT id FROM public.licitacoes);

DELETE FROM public.contrato_rascunho_anexos 
WHERE contrato_rascunho_id IN (
  SELECT id FROM public.contrato_rascunho WHERE licitacao_id IN (SELECT id FROM public.licitacoes)
);

DELETE FROM public.contrato_rascunho 
WHERE licitacao_id IN (SELECT id FROM public.licitacoes);

DELETE FROM public.licitacoes_atividades 
WHERE licitacao_id IN (SELECT id FROM public.licitacoes);

-- Remove todas as licitações
DELETE FROM public.licitacoes;

-- Limpa os buckets de storage
DELETE FROM storage.objects WHERE bucket_id IN ('licitacoes-anexos', 'editais-pdfs');

-- === 20251218144413_4852b6ed-2138-4347-bfa1-c80228eca6c0.sql ===
-- Desvincula registros
UPDATE public.contratos SET licitacao_origem_id = NULL 
WHERE licitacao_origem_id IN (SELECT id FROM public.licitacoes);

UPDATE public.leads SET licitacao_origem_id = NULL 
WHERE licitacao_origem_id IN (SELECT id FROM public.licitacoes);

-- Deleta registros derivados
DELETE FROM public.captacao_contratos_board 
WHERE origem_licitacao_id IN (SELECT id FROM public.licitacoes);

DELETE FROM public.contrato_rascunho_anexos 
WHERE contrato_rascunho_id IN (
  SELECT id FROM public.contrato_rascunho WHERE licitacao_id IN (SELECT id FROM public.licitacoes)
);

DELETE FROM public.contrato_rascunho 
WHERE licitacao_id IN (SELECT id FROM public.licitacoes);

DELETE FROM public.licitacoes_atividades 
WHERE licitacao_id IN (SELECT id FROM public.licitacoes);

-- Remove todas as licitações
DELETE FROM public.licitacoes;

-- Limpa os buckets de storage
DELETE FROM storage.objects WHERE bucket_id IN ('licitacoes-anexos', 'editais-pdfs');

-- === 20251218162716_709f290f-8591-4e7d-9572-4b06e6f70082.sql ===
-- Adicionar campo para dados customizados nas licitações
ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS dados_customizados JSONB DEFAULT '{}'::jsonb;