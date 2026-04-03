
-- 3. Atualizar política da tabela ages_contratos
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos" ON public.ages_contratos;
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos" ON public.ages_contratos;
CREATE POLICY "Authorized users can manage ages_contratos" 
ON public.ages_contratos 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 4. Atualizar política da tabela ages_producao
DROP POLICY IF EXISTS "Authorized users can manage ages_producao" ON public.ages_producao;
DROP POLICY IF EXISTS "Authorized users can manage ages_producao" ON public.ages_producao;
CREATE POLICY "Authorized users can manage ages_producao" 
ON public.ages_producao 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 5. Atualizar política da tabela ages_licitacoes
DROP POLICY IF EXISTS "Authorized users can manage ages_licitacoes" ON public.ages_licitacoes;
DROP POLICY IF EXISTS "Authorized users can manage ages_licitacoes" ON public.ages_licitacoes;
CREATE POLICY "Authorized users can manage ages_licitacoes" 
ON public.ages_licitacoes 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 6. Atualizar política da tabela ages_leads
DROP POLICY IF EXISTS "Authorized users can manage ages_leads" ON public.ages_leads;
DROP POLICY IF EXISTS "Authorized users can manage ages_leads" ON public.ages_leads;
CREATE POLICY "Authorized users can manage ages_leads" 
ON public.ages_leads 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- 7. Atualizar política da tabela ages_contratos_documentos
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos_documentos" ON public.ages_contratos_documentos;
DROP POLICY IF EXISTS "Authorized users can manage ages_contratos_documentos" ON public.ages_contratos_documentos;
CREATE POLICY "Authorized users can manage ages_contratos_documentos" 
ON public.ages_contratos_documentos 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_ages'::app_role)
);

-- === 20251230160429_72508512-7fd5-4159-b0c9-b20b22cc6a5d.sql ===
-- Tabela de contratos Dr. Escala (estrutura igual a contratos)
CREATE TABLE IF NOT EXISTS public.contratos_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_interno SERIAL,
  codigo_contrato TEXT,
  cliente_id UUID REFERENCES public.clientes(id),
  unidade_id UUID REFERENCES public.unidades(id),
  medico_id UUID REFERENCES public.medicos(id),
  licitacao_origem_id UUID REFERENCES public.licitacoes(id),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  data_termino DATE,
  prazo_meses INTEGER,
  valor_estimado NUMERIC,
  tipo_servico TEXT[],
  tipo_contratacao TEXT,
  especialidade_contrato TEXT,
  objeto_contrato TEXT,
  condicao_pagamento TEXT,
  documento_url TEXT,
  status_contrato TEXT DEFAULT 'Ativo',
  assinado TEXT DEFAULT 'Pendente',
  motivo_pendente TEXT,
  dias_aviso_vencimento INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de contratos Dr. Oportunidade (estrutura igual a contratos)
CREATE TABLE IF NOT EXISTS public.contratos_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo_interno SERIAL,
  codigo_contrato TEXT,
  cliente_id UUID REFERENCES public.clientes(id),
  unidade_id UUID REFERENCES public.unidades(id),
  medico_id UUID REFERENCES public.medicos(id),
  licitacao_origem_id UUID REFERENCES public.licitacoes(id),
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  data_termino DATE,
  prazo_meses INTEGER,
  valor_estimado NUMERIC,
  tipo_servico TEXT[],
  tipo_contratacao TEXT,
  especialidade_contrato TEXT,
  objeto_contrato TEXT,
  condicao_pagamento TEXT,
  documento_url TEXT,
  status_contrato TEXT DEFAULT 'Ativo',
  assinado TEXT DEFAULT 'Pendente',
  motivo_pendente TEXT,
  dias_aviso_vencimento INTEGER DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Anexos Dr. Escala
CREATE TABLE IF NOT EXISTS public.contrato_anexos_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Anexos Dr. Oportunidade
CREATE TABLE IF NOT EXISTS public.contrato_anexos_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Aditivos tempo Dr. Escala
CREATE TABLE IF NOT EXISTS public.contrato_aditivos_tempo_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_termino DATE NOT NULL,
  prazo_meses INTEGER NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Aditivos tempo Dr. Oportunidade
CREATE TABLE IF NOT EXISTS public.contrato_aditivos_tempo_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  data_termino DATE NOT NULL,
  prazo_meses INTEGER NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contratos_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_dr_oportunidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_anexos_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_anexos_dr_oportunidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_aditivos_tempo_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_aditivos_tempo_dr_oportunidade ENABLE ROW LEVEL SECURITY;

-- Policies para usuários autenticados
DROP POLICY IF EXISTS "Authenticated users can view contratos_dr_escala" ON public.contratos_dr_escala;
CREATE POLICY "Authenticated users can view contratos_dr_escala" ON public.contratos_dr_escala FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contratos_dr_escala" ON public.contratos_dr_escala;
CREATE POLICY "Authenticated users can insert contratos_dr_escala" ON public.contratos_dr_escala FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contratos_dr_escala" ON public.contratos_dr_escala;
CREATE POLICY "Authenticated users can update contratos_dr_escala" ON public.contratos_dr_escala FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contratos_dr_escala" ON public.contratos_dr_escala;
CREATE POLICY "Authenticated users can delete contratos_dr_escala" ON public.contratos_dr_escala FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view contratos_dr_oportunidade" ON public.contratos_dr_oportunidade;
CREATE POLICY "Authenticated users can view contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contratos_dr_oportunidade" ON public.contratos_dr_oportunidade;
CREATE POLICY "Authenticated users can insert contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contratos_dr_oportunidade" ON public.contratos_dr_oportunidade;
CREATE POLICY "Authenticated users can update contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contratos_dr_oportunidade" ON public.contratos_dr_oportunidade;
CREATE POLICY "Authenticated users can delete contratos_dr_oportunidade" ON public.contratos_dr_oportunidade FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala;
CREATE POLICY "Authenticated users can view contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala;
CREATE POLICY "Authenticated users can insert contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala;
CREATE POLICY "Authenticated users can update contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala;
CREATE POLICY "Authenticated users can delete contrato_anexos_dr_escala" ON public.contrato_anexos_dr_escala FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade;
CREATE POLICY "Authenticated users can view contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade;
CREATE POLICY "Authenticated users can insert contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade;
CREATE POLICY "Authenticated users can update contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade;
CREATE POLICY "Authenticated users can delete contrato_anexos_dr_oportunidade" ON public.contrato_anexos_dr_oportunidade FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala;
CREATE POLICY "Authenticated users can view contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala;
CREATE POLICY "Authenticated users can insert contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala;
CREATE POLICY "Authenticated users can update contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala;
CREATE POLICY "Authenticated users can delete contrato_aditivos_tempo_dr_escala" ON public.contrato_aditivos_tempo_dr_escala FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can view contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade;
CREATE POLICY "Authenticated users can view contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can insert contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade;
CREATE POLICY "Authenticated users can insert contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated users can update contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade;
CREATE POLICY "Authenticated users can update contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can delete contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade;
CREATE POLICY "Authenticated users can delete contrato_aditivos_tempo_dr_oportunidade" ON public.contrato_aditivos_tempo_dr_oportunidade FOR DELETE TO authenticated USING (true);

-- Trigger para updated_at
CREATE TRIGGER update_contratos_dr_escala_updated_at BEFORE UPDATE ON public.contratos_dr_escala FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contratos_dr_oportunidade_updated_at BEFORE UPDATE ON public.contratos_dr_oportunidade FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contrato_aditivos_tempo_dr_escala_updated_at BEFORE UPDATE ON public.contrato_aditivos_tempo_dr_escala FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contrato_aditivos_tempo_dr_oportunidade_updated_at BEFORE UPDATE ON public.contrato_aditivos_tempo_dr_oportunidade FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251230161602_b6c28f81-58ee-4759-bb62-8876580d7c0f.sql ===
-- Criar tabela de itens para Dr. Escala
CREATE TABLE IF NOT EXISTS public.contrato_itens_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  valor_item NUMERIC(15,2) NOT NULL,
  quantidade INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de itens para Dr. Oportunidade
CREATE TABLE IF NOT EXISTS public.contrato_itens_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  valor_item NUMERIC(15,2) NOT NULL,
  quantidade INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de renovações para Dr. Escala
CREATE TABLE IF NOT EXISTS public.contrato_renovacoes_dr_escala (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_escala(id) ON DELETE CASCADE,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC(5,2),
  valor NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de renovações para Dr. Oportunidade
CREATE TABLE IF NOT EXISTS public.contrato_renovacoes_dr_oportunidade (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos_dr_oportunidade(id) ON DELETE CASCADE,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC(5,2),
  valor NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contrato_itens_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_itens_dr_oportunidade ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_renovacoes_dr_escala ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_renovacoes_dr_oportunidade ENABLE ROW LEVEL SECURITY;

-- RLS Policies para itens Dr. Escala
DROP POLICY IF EXISTS "Authenticated users can view itens dr escala" ON public.contrato_itens_dr_escala;
CREATE POLICY "Authenticated users can view itens dr escala" 
ON public.contrato_itens_dr_escala FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert itens dr escala" ON public.contrato_itens_dr_escala;
CREATE POLICY "Authenticated users can insert itens dr escala" 
ON public.contrato_itens_dr_escala FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update itens dr escala" ON public.contrato_itens_dr_escala;
CREATE POLICY "Authenticated users can update itens dr escala" 
ON public.contrato_itens_dr_escala FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete itens dr escala" ON public.contrato_itens_dr_escala;
CREATE POLICY "Authenticated users can delete itens dr escala" 
ON public.contrato_itens_dr_escala FOR DELETE TO authenticated USING (true);

-- RLS Policies para itens Dr. Oportunidade
DROP POLICY IF EXISTS "Authenticated users can view itens dr oportunidade" ON public.contrato_itens_dr_oportunidade;
CREATE POLICY "Authenticated users can view itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert itens dr oportunidade" ON public.contrato_itens_dr_oportunidade;
CREATE POLICY "Authenticated users can insert itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update itens dr oportunidade" ON public.contrato_itens_dr_oportunidade;
CREATE POLICY "Authenticated users can update itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete itens dr oportunidade" ON public.contrato_itens_dr_oportunidade;
CREATE POLICY "Authenticated users can delete itens dr oportunidade" 
ON public.contrato_itens_dr_oportunidade FOR DELETE TO authenticated USING (true);

-- RLS Policies para renovações Dr. Escala
DROP POLICY IF EXISTS "Authenticated users can view renovacoes dr escala" ON public.contrato_renovacoes_dr_escala;
CREATE POLICY "Authenticated users can view renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert renovacoes dr escala" ON public.contrato_renovacoes_dr_escala;
CREATE POLICY "Authenticated users can insert renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update renovacoes dr escala" ON public.contrato_renovacoes_dr_escala;
CREATE POLICY "Authenticated users can update renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete renovacoes dr escala" ON public.contrato_renovacoes_dr_escala;
CREATE POLICY "Authenticated users can delete renovacoes dr escala" 
ON public.contrato_renovacoes_dr_escala FOR DELETE TO authenticated USING (true);

-- RLS Policies para renovações Dr. Oportunidade
DROP POLICY IF EXISTS "Authenticated users can view renovacoes dr oportunidade" ON public.contrato_renovacoes_dr_oportunidade;
CREATE POLICY "Authenticated users can view renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert renovacoes dr oportunidade" ON public.contrato_renovacoes_dr_oportunidade;
CREATE POLICY "Authenticated users can insert renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update renovacoes dr oportunidade" ON public.contrato_renovacoes_dr_oportunidade;
CREATE POLICY "Authenticated users can update renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete renovacoes dr oportunidade" ON public.contrato_renovacoes_dr_oportunidade;
CREATE POLICY "Authenticated users can delete renovacoes dr oportunidade" 
ON public.contrato_renovacoes_dr_oportunidade FOR DELETE TO authenticated USING (true);

-- === 20251230170734_3812e1fd-452c-4d30-a3eb-f40548913748.sql ===
-- Função para remover automaticamente o card do Kanban quando os 3 campos de aprovação forem marcados
CREATE OR REPLACE FUNCTION public.auto_remove_kanban_card_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Se todas as 3 aprovações estão marcadas como true
  IF NEW.aprovacao_contrato_assinado = true 
     AND NEW.aprovacao_documentacao_unidade = true 
     AND NEW.aprovacao_cadastro_unidade = true THEN
    -- Deleta o card do kanban vinculado a este médico
    DELETE FROM public.medico_kanban_cards 
    WHERE medico_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger que executa após UPDATE na tabela medicos
CREATE TRIGGER trigger_remove_kanban_on_approval
  AFTER UPDATE ON public.medicos
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_remove_kanban_card_on_approval();

-- Limpar cards órfãos existentes (médicos já aprovados que ainda estão no Kanban)
DELETE FROM public.medico_kanban_cards 
WHERE medico_id IN (
  SELECT m.id FROM public.medicos m
  WHERE m.aprovacao_contrato_assinado = true
    AND m.aprovacao_documentacao_unidade = true
    AND m.aprovacao_cadastro_unidade = true
);

-- === 20251230173522_88d75721-d8d7-4747-b8d5-01f2059c8b43.sql ===
-- Permitir que lideres, gestor_contratos e gestor_captacao gerenciem config_lista_items
DROP POLICY IF EXISTS "Gestores and lideres can manage config_lista_items" ON public.config_lista_items;
CREATE POLICY "Gestores and lideres can manage config_lista_items"
ON public.config_lista_items
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'lideres') OR 
  public.has_role(auth.uid(), 'gestor_contratos') OR 
  public.has_role(auth.uid(), 'gestor_captacao')
)
WITH CHECK (
  public.has_role(auth.uid(), 'lideres') OR 
  public.has_role(auth.uid(), 'gestor_contratos') OR 
  public.has_role(auth.uid(), 'gestor_captacao')
);

-- === 20260102140501_f7963732-ce84-4d6c-8493-bea61c679913.sql ===
-- =============================================
-- FASE 1: Tabelas para Clientes e Unidades AGES
-- =============================================

-- 1.1 Criar tabela ages_clientes
CREATE TABLE IF NOT EXISTS public.ages_clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome_empresa TEXT NOT NULL,
  nome_fantasia TEXT,
  razao_social TEXT,
  cnpj TEXT,
  endereco TEXT,
  uf TEXT,
  cidade TEXT,
  email_contato TEXT,
  telefone_contato TEXT,
  contato_principal TEXT,
  status_cliente TEXT NOT NULL DEFAULT 'Ativo',
  especialidade_cliente TEXT,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 1.2 Criar tabela ages_unidades
CREATE TABLE IF NOT EXISTS public.ages_unidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.ages_clientes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  codigo TEXT,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 1.3 Adicionar novas colunas em ages_contratos para referenciar ages_clientes e ages_unidades
-- Primeiro, adicionar as novas colunas
ALTER TABLE public.ages_contratos 
  ADD COLUMN IF NOT EXISTS ages_cliente_id UUID REFERENCES public.ages_clientes(id),
  ADD COLUMN IF NOT EXISTS ages_unidade_id UUID REFERENCES public.ages_unidades(id);

-- 1.4 Habilitar RLS
ALTER TABLE public.ages_clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_unidades ENABLE ROW LEVEL SECURITY;

-- 1.5 Políticas RLS para ages_clientes
DROP POLICY IF EXISTS "Authenticated users can view ages_clientes" ON public.ages_clientes;
CREATE POLICY "Authenticated users can view ages_clientes"
  ON public.ages_clientes
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_clientes" ON public.ages_clientes;
CREATE POLICY "Authorized users can manage ages_clientes"
  ON public.ages_clientes
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_ages'::app_role)
  );

-- 1.6 Políticas RLS para ages_unidades
DROP POLICY IF EXISTS "Authenticated users can view ages_unidades" ON public.ages_unidades;
CREATE POLICY "Authenticated users can view ages_unidades"
  ON public.ages_unidades
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_unidades" ON public.ages_unidades;
CREATE POLICY "Authorized users can manage ages_unidades"
  ON public.ages_unidades
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_ages'::app_role)
  );

-- 1.7 Trigger para updated_at em ages_clientes
CREATE TRIGGER update_ages_clientes_updated_at
  BEFORE UPDATE ON public.ages_clientes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 1.8 Trigger para updated_at em ages_unidades
CREATE TRIGGER update_ages_unidades_updated_at
  BEFORE UPDATE ON public.ages_unidades
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 1.9 Índices para performance
CREATE INDEX IF NOT EXISTS idx_ages_clientes_status ON public.ages_clientes(status_cliente);
CREATE INDEX IF NOT EXISTS idx_ages_clientes_uf ON public.ages_clientes(uf);
CREATE INDEX IF NOT EXISTS idx_ages_unidades_cliente ON public.ages_unidades(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ages_contratos_ages_cliente ON public.ages_contratos(ages_cliente_id);
CREATE INDEX IF NOT EXISTS idx_ages_contratos_ages_unidade ON public.ages_contratos(ages_unidade_id);

-- === 20260102145941_a8e4317e-2ec4-45a9-b80f-7c2b4aefc1cf.sql ===
-- Adicionar mais campos ao ages_leads para ficar igual ao GSS
ALTER TABLE public.ages_leads 
ADD COLUMN IF NOT EXISTS cpf TEXT,
ADD COLUMN IF NOT EXISTS rg TEXT,
ADD COLUMN IF NOT EXISTS data_nascimento DATE,
ADD COLUMN IF NOT EXISTS endereco TEXT,
ADD COLUMN IF NOT EXISTS cep TEXT,
ADD COLUMN IF NOT EXISTS registro_profissional TEXT,
ADD COLUMN IF NOT EXISTS banco TEXT,
ADD COLUMN IF NOT EXISTS agencia TEXT,
ADD COLUMN IF NOT EXISTS conta_corrente TEXT,
ADD COLUMN IF NOT EXISTS chave_pix TEXT,
ADD COLUMN IF NOT EXISTS telefones_adicionais TEXT[],
ADD COLUMN IF NOT EXISTS modalidade_contrato TEXT,
ADD COLUMN IF NOT EXISTS local_prestacao_servico TEXT,
ADD COLUMN IF NOT EXISTS data_inicio_contrato DATE,
ADD COLUMN IF NOT EXISTS valor_contrato NUMERIC,
ADD COLUMN IF NOT EXISTS especificacoes_contrato TEXT;

-- Criar tabela de histórico para ages_leads
CREATE TABLE IF NOT EXISTS public.ages_lead_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.ages_leads(id) ON DELETE CASCADE,
  tipo_evento TEXT NOT NULL,
  descricao_resumida TEXT NOT NULL,
  dados_anteriores JSONB,
  dados_novos JSONB,
  campos_alterados TEXT[],
  usuario_id UUID,
  usuario_nome TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de anexos para ages_leads
CREATE TABLE IF NOT EXISTS public.ages_lead_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.ages_leads(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  tipo_documento TEXT,
  observacoes TEXT,
  uploaded_by UUID,
  uploaded_by_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ages_lead_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_lead_anexos ENABLE ROW LEVEL SECURITY;

-- Policies para histórico
DROP POLICY IF EXISTS "Users can view ages lead historico" ON public.ages_lead_historico;
CREATE POLICY "Users can view ages lead historico" 
ON public.ages_lead_historico 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Users can insert ages lead historico" ON public.ages_lead_historico;
CREATE POLICY "Users can insert ages lead historico" 
ON public.ages_lead_historico 
FOR INSERT 
WITH CHECK (true);

-- Policies para anexos
DROP POLICY IF EXISTS "Users can view ages lead anexos" ON public.ages_lead_anexos;
CREATE POLICY "Users can view ages lead anexos" 
ON public.ages_lead_anexos 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Users can insert ages lead anexos" ON public.ages_lead_anexos;
CREATE POLICY "Users can insert ages lead anexos" 
ON public.ages_lead_anexos 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update ages lead anexos" ON public.ages_lead_anexos;
CREATE POLICY "Users can update ages lead anexos" 
ON public.ages_lead_anexos 
FOR UPDATE 
USING (true);

DROP POLICY IF EXISTS "Users can delete ages lead anexos" ON public.ages_lead_anexos;
CREATE POLICY "Users can delete ages lead anexos" 
ON public.ages_lead_anexos 
FOR DELETE 
USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ages_lead_historico_lead_id ON public.ages_lead_historico(lead_id);
CREATE INDEX IF NOT EXISTS idx_ages_lead_anexos_lead_id ON public.ages_lead_anexos(lead_id);

-- === 20260102171234_5e8ab19e-41ae-43a7-a616-4270adbb9a04.sql ===
-- Tornar o bucket ages-documentos público para permitir uploads
UPDATE storage.buckets 
SET public = true 
WHERE id = 'ages-documentos';

-- Criar política de upload se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage' 
    AND policyname = 'Permitir upload ages-documentos'
  ) THEN
    DROP POLICY IF EXISTS "Permitir upload ages-documentos" ON storage.objects;
CREATE POLICY "Permitir upload ages-documentos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'ages-documentos' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- Criar política de leitura pública se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage' 
    AND policyname = 'Permitir leitura ages-documentos'
  ) THEN
    DROP POLICY IF EXISTS "Permitir leitura ages-documentos" ON storage.objects;
CREATE POLICY "Permitir leitura ages-documentos"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'ages-documentos');
  END IF;
END $$;

-- Criar política de delete se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'objects' 
    AND schemaname = 'storage' 
    AND policyname = 'Permitir delete ages-documentos'
  ) THEN
    DROP POLICY IF EXISTS "Permitir delete ages-documentos" ON storage.objects;
CREATE POLICY "Permitir delete ages-documentos"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'ages-documentos' AND auth.role() = 'authenticated');
  END IF;
END $$;

-- === 20260102172924_2d9ecf95-0402-4621-aebb-222a98e88bb7.sql ===
-- Adicionar campo unidades_vinculadas ao ages_leads
ALTER TABLE public.ages_leads 
ADD COLUMN IF NOT EXISTS unidades_vinculadas uuid[] DEFAULT '{}'::uuid[];

-- Criar tabela de propostas AGES
CREATE TABLE IF NOT EXISTS public.ages_propostas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.ages_leads(id) ON DELETE CASCADE,
  profissional_id uuid REFERENCES public.ages_profissionais(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.ages_clientes(id) ON DELETE SET NULL,
  unidade_id uuid REFERENCES public.ages_unidades(id) ON DELETE SET NULL,
  contrato_id uuid REFERENCES public.ages_contratos(id) ON DELETE SET NULL,
  valor numeric,
  status text NOT NULL DEFAULT 'rascunho',
  observacoes text,
  descricao text,
  id_proposta text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ages_propostas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Authenticated users can view ages_propostas" ON public.ages_propostas;
CREATE POLICY "Authenticated users can view ages_propostas"
ON public.ages_propostas FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_propostas" ON public.ages_propostas;
CREATE POLICY "Authorized users can manage ages_propostas"
ON public.ages_propostas FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_ages')
);

-- Trigger para updated_at
CREATE TRIGGER update_ages_propostas_updated_at
  BEFORE UPDATE ON public.ages_propostas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- === 20260102191409_4e500cd0-d9cd-4301-a213-ab7c6557e597.sql ===

-- Tabela para armazenar contas/perfis de marketing
CREATE TABLE IF NOT EXISTS public.marketing_contas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.marketing_contas ENABLE ROW LEVEL SECURITY;

-- Política para visualização
DROP POLICY IF EXISTS "Authenticated users can view marketing_contas" ON public.marketing_contas;
CREATE POLICY "Authenticated users can view marketing_contas"
ON public.marketing_contas
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Política para gerenciamento
DROP POLICY IF EXISTS "Authorized users can manage marketing_contas" ON public.marketing_contas;
CREATE POLICY "Authorized users can manage marketing_contas"
ON public.marketing_contas
FOR ALL
USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR 
    has_role(auth.uid(), 'diretoria'::app_role)
);

-- Alterar coluna conta_perfil para permitir null
ALTER TABLE public.marketing_conteudos 
ALTER COLUMN conta_perfil DROP NOT NULL;


-- === 20260102194559_779f2c2f-7cc7-4bdd-b749-652669bc708b.sql ===

-- Adicionar colunas faltantes na tabela ages_contratos
ALTER TABLE public.ages_contratos 
ADD COLUMN IF NOT EXISTS assinado text DEFAULT 'Pendente',
ADD COLUMN IF NOT EXISTS motivo_pendente text,
ADD COLUMN IF NOT EXISTS prazo_meses integer,
ADD COLUMN IF NOT EXISTS codigo_interno integer;

-- Criar sequência para codigo_interno em ages_contratos
CREATE SEQUENCE IF NOT EXISTS ages_contratos_codigo_interno_seq START WITH 1;

-- Definir default para codigo_interno usando a sequência
ALTER TABLE public.ages_contratos 
ALTER COLUMN codigo_interno SET DEFAULT nextval('ages_contratos_codigo_interno_seq');

-- Criar tabela ages_contrato_itens
CREATE TABLE IF NOT EXISTS public.ages_contrato_itens (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id uuid NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  item text NOT NULL,
  valor_item numeric NOT NULL,
  quantidade integer DEFAULT 1,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Criar tabela ages_contrato_renovacoes
CREATE TABLE IF NOT EXISTS public.ages_contrato_renovacoes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id uuid NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  data_vigencia date NOT NULL,
  percentual_reajuste numeric,
  valor numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Criar tabela ages_contrato_aditivos
CREATE TABLE IF NOT EXISTS public.ages_contrato_aditivos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id uuid NOT NULL REFERENCES public.ages_contratos(id) ON DELETE CASCADE,
  data_inicio date NOT NULL,
  prazo_meses integer NOT NULL,
  data_termino date NOT NULL,
  observacoes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Habilitar RLS nas novas tabelas
ALTER TABLE public.ages_contrato_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_contrato_renovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ages_contrato_aditivos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para ages_contrato_itens
DROP POLICY IF EXISTS "Authenticated users can view ages_contrato_itens" ON public.ages_contrato_itens;
CREATE POLICY "Authenticated users can view ages_contrato_itens" 
ON public.ages_contrato_itens 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_contrato_itens" ON public.ages_contrato_itens;
CREATE POLICY "Authorized users can manage ages_contrato_itens" 
ON public.ages_contrato_itens 
FOR ALL 
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_ages'::app_role));

-- Políticas RLS para ages_contrato_renovacoes
DROP POLICY IF EXISTS "Authenticated users can view ages_contrato_renovacoes" ON public.ages_contrato_renovacoes;
CREATE POLICY "Authenticated users can view ages_contrato_renovacoes" 
ON public.ages_contrato_renovacoes 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_contrato_renovacoes" ON public.ages_contrato_renovacoes;
CREATE POLICY "Authorized users can manage ages_contrato_renovacoes" 
ON public.ages_contrato_renovacoes 
FOR ALL 
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_ages'::app_role));

-- Políticas RLS para ages_contrato_aditivos
DROP POLICY IF EXISTS "Authenticated users can view ages_contrato_aditivos" ON public.ages_contrato_aditivos;
CREATE POLICY "Authenticated users can view ages_contrato_aditivos" 
ON public.ages_contrato_aditivos 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authorized users can manage ages_contrato_aditivos" ON public.ages_contrato_aditivos;
CREATE POLICY "Authorized users can manage ages_contrato_aditivos" 
ON public.ages_contrato_aditivos 
FOR ALL 
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_ages'::app_role));

-- Trigger para updated_at nas novas tabelas
CREATE OR REPLACE FUNCTION public.update_ages_contrato_related_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_ages_contrato_itens_updated_at
BEFORE UPDATE ON public.ages_contrato_itens
FOR EACH ROW
EXECUTE FUNCTION public.update_ages_contrato_related_updated_at();

CREATE TRIGGER update_ages_contrato_renovacoes_updated_at
BEFORE UPDATE ON public.ages_contrato_renovacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_ages_contrato_related_updated_at();

CREATE TRIGGER update_ages_contrato_aditivos_updated_at
BEFORE UPDATE ON public.ages_contrato_aditivos
FOR EACH ROW
EXECUTE FUNCTION public.update_ages_contrato_related_updated_at();


-- === 20260105115408_0cfaa47a-0dd9-4809-aff1-f009fbb87b9d.sql ===
-- Adicionar campos faltantes na tabela ages_contratos
ALTER TABLE public.ages_contratos
ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT,
ADD COLUMN IF NOT EXISTS valor_estimado TEXT,
ADD COLUMN IF NOT EXISTS dias_antecedencia_aviso INTEGER DEFAULT 60;

-- === 20260105144855_cd5b1afe-8b7e-4f0b-afa2-9e862d77182f.sql ===
-- Drop existing restrictive SELECT policies and recreate with diretoria access

-- 1. contratos-documentos - Add diretoria to SELECT
DROP POLICY IF EXISTS "Authorized users can view contract documents" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view contract documents" ON storage.objects;
CREATE POLICY "Authorized users can view contract documents" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'contratos-documentos' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role) OR
    has_role(auth.uid(), 'gestor_financeiro'::app_role) OR
    has_role(auth.uid(), 'coordenador_escalas'::app_role)
  )
);

-- 2. medicos-documentos - Create SELECT policy with diretoria
DROP POLICY IF EXISTS "Authorized users can view medicos documents" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view medicos documents" ON storage.objects;
CREATE POLICY "Authorized users can view medicos documents" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'medicos-documentos' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role) OR
    has_role(auth.uid(), 'coordenador_escalas'::app_role)
  )
);

-- 3. editais-pdfs - Add diretoria to SELECT
DROP POLICY IF EXISTS "Authenticated users can view editais PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view editais PDFs" ON storage.objects;
CREATE POLICY "Authenticated users can view editais PDFs" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'editais-pdfs' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- 4. suporte-anexos - Create SELECT policy with diretoria and support roles
DROP POLICY IF EXISTS "Users can view support attachments" ON storage.objects;
DROP POLICY IF EXISTS "Users can view support attachments" ON storage.objects;
CREATE POLICY "Users can view support attachments" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'suporte-anexos' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role) OR
    auth.uid() IS NOT NULL
  )
);

-- 5. campanhas-pecas - Add diretoria access
DROP POLICY IF EXISTS "Authorized users can view campanhas pecas" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view campanhas pecas" ON storage.objects;
CREATE POLICY "Authorized users can view campanhas pecas" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'campanhas-pecas' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- 6. eventos-materiais - Add diretoria access
DROP POLICY IF EXISTS "Authorized users can view eventos materiais" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view eventos materiais" ON storage.objects;
CREATE POLICY "Authorized users can view eventos materiais" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'eventos-materiais' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- 7. materiais-biblioteca - Add diretoria access
DROP POLICY IF EXISTS "Authorized users can view materiais biblioteca" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view materiais biblioteca" ON storage.objects;
CREATE POLICY "Authorized users can view materiais biblioteca" ON storage.objects 
FOR SELECT USING (
  bucket_id = 'materiais-biblioteca' AND (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'diretoria'::app_role) OR
    has_role(auth.uid(), 'lideres'::app_role)
  )
);

-- === 20260105162552_e57088e8-00f2-4fe1-81a1-50e267a57fff.sql ===
-- Atualizar constraint de status_contrato para incluir 'Em Processo de Renovação' que é usado no frontend
ALTER TABLE public.contratos DROP CONSTRAINT IF EXISTS contratos_status_contrato_check;

ALTER TABLE public.contratos ADD CONSTRAINT contratos_status_contrato_check 
  CHECK (status_contrato = ANY (ARRAY[
    'Ativo'::text, 
    'Inativo'::text, 
    'Encerrado'::text, 
    'Suspenso'::text, 
    'Em Renovação'::text, 
    'Em Processo de Renovação'::text, 
    'Pre-Contrato'::text
  ]));

-- Para ages_contratos - adicionar constraints (campos são TEXT)
ALTER TABLE public.ages_contratos DROP CONSTRAINT IF EXISTS ages_contratos_status_check;

ALTER TABLE public.ages_contratos ADD CONSTRAINT ages_contratos_status_check 
  CHECK (status IS NULL OR status = ANY (ARRAY[
    'Ativo'::text, 
    'Inativo'::text, 
    'Encerrado'::text, 
    'Suspenso'::text, 
    'Em Renovação'::text, 
    'Em Processo de Renovação'::text, 
    'Pre-Contrato'::text
  ]));

ALTER TABLE public.ages_contratos DROP CONSTRAINT IF EXISTS ages_contratos_assinado_check;

ALTER TABLE public.ages_contratos ADD CONSTRAINT ages_contratos_assinado_check 
  CHECK (assinado IS NULL OR assinado = ANY (ARRAY[
    'Sim'::text, 
    'Pendente'::text, 
    'Em Análise'::text, 
    'Aguardando Retorno'::text
  ]));

-- === 20260105171030_44ed8510-129e-4796-b46e-92516772c20a.sql ===
-- Tabela para anotações do prontuário médico (área de notas rica)
CREATE TABLE IF NOT EXISTS public.lead_anotacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'nota', -- 'nota', 'desconversao', 'blacklist', 'alerta'
  titulo TEXT,
  conteudo TEXT NOT NULL,
  imagens TEXT[] DEFAULT '{}', -- URLs das imagens
  metadados JSONB DEFAULT '{}', -- dados extras como motivo desconversão, etc
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Foreign key para leads
ALTER TABLE public.lead_anotacoes 
ADD CONSTRAINT lead_anotacoes_lead_id_fkey 
FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;

-- Índices
CREATE INDEX IF NOT EXISTS idx_lead_anotacoes_lead_id ON public.lead_anotacoes(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_anotacoes_tipo ON public.lead_anotacoes(tipo);
CREATE INDEX IF NOT EXISTS idx_lead_anotacoes_created_at ON public.lead_anotacoes(created_at DESC);

-- Enable RLS
ALTER TABLE public.lead_anotacoes ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS "Authenticated users can view lead_anotacoes" ON public.lead_anotacoes;
CREATE POLICY "Authenticated users can view lead_anotacoes"
ON public.lead_anotacoes FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert lead_anotacoes" ON public.lead_anotacoes;
CREATE POLICY "Authenticated users can insert lead_anotacoes"
ON public.lead_anotacoes FOR INSERT
TO authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update lead_anotacoes" ON public.lead_anotacoes;
CREATE POLICY "Authenticated users can update lead_anotacoes"
ON public.lead_anotacoes FOR UPDATE
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can delete lead_anotacoes" ON public.lead_anotacoes;
CREATE POLICY "Authenticated users can delete lead_anotacoes"
ON public.lead_anotacoes FOR DELETE
TO authenticated
USING (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_lead_anotacoes_updated_at
BEFORE UPDATE ON public.lead_anotacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket para imagens das anotações
INSERT INTO storage.buckets (id, name, public) 
VALUES ('lead-anotacoes', 'lead-anotacoes', true)
ON CONFLICT (id) DO NOTHING;

-- Policies do storage
DROP POLICY IF EXISTS "Anyone can view lead-anotacoes images" ON storage.objects;
CREATE POLICY "Anyone can view lead-anotacoes images"
ON storage.objects FOR SELECT
USING (bucket_id = 'lead-anotacoes');

DROP POLICY IF EXISTS "Authenticated users can upload lead-anotacoes images" ON storage.objects;
CREATE POLICY "Authenticated users can upload lead-anotacoes images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'lead-anotacoes');

DROP POLICY IF EXISTS "Authenticated users can delete lead-anotacoes images" ON storage.objects;
CREATE POLICY "Authenticated users can delete lead-anotacoes images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'lead-anotacoes');

-- === 20260106115208_60a23a9f-3637-48b6-8eee-8b7653672ca4.sql ===
-- Criar tabela de notificações genéricas do sistema
CREATE TABLE IF NOT EXISTS public.system_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'kanban_ativo', 'licitacao', 'contrato', etc.
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  link TEXT, -- URL para redirecionar ao clicar
  referencia_id UUID, -- ID do registro relacionado (card, licitação, etc.)
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);