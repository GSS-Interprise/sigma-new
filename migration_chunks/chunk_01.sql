
-- === 20251010143434_b998850d-5b68-44a0-bdd5-f471be2d10d3.sql ===
-- Adicionar novos campos na tabela clientes
DO $$ BEGIN ALTER TABLE public.clientes 
  ADD COLUMN IF NOT EXISTS email_financeiro TEXT,
  ADD COLUMN IF NOT EXISTS telefone_financeiro TEXT,
  ADD COLUMN IF NOT EXISTS nome_unidade TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Adicionar novos campos na tabela contratos
DO $$ BEGIN ALTER TABLE public.contratos 
  ADD COLUMN IF NOT EXISTS codigo_interno INTEGER,
  ADD COLUMN IF NOT EXISTS objeto_contrato TEXT,
  ADD COLUMN IF NOT EXISTS tipo_servico TEXT[]; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Alterar o enum de status_assinatura_contrato
DO $$ BEGIN ALTER TYPE status_assinatura_contrato ADD VALUE IF NOT EXISTS 'Em Análise'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE status_assinatura_contrato ADD VALUE IF NOT EXISTS 'Aguardando Retorno'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Criar tabela para itens do contrato
CREATE TABLE IF NOT EXISTS public.contrato_itens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE NOT NULL,
  item TEXT NOT NULL,
  valor_item NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela para renovações de contrato
CREATE TABLE IF NOT EXISTS public.contrato_renovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE NOT NULL,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC(5, 2),
  valor NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar tabela para histórico de anexos
CREATE TABLE IF NOT EXISTS public.contrato_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE CASCADE NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contrato_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_renovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_anexos ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contrato_itens
DROP POLICY IF EXISTS "Authorized users can manage contrato_itens" ON public.contrato_itens;
CREATE POLICY "Authorized users can manage contrato_itens"
ON public.contrato_itens
FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role));

-- RLS Policies for contrato_renovacoes
DROP POLICY IF EXISTS "Authorized users can manage contrato_renovacoes" ON public.contrato_renovacoes;
CREATE POLICY "Authorized users can manage contrato_renovacoes"
ON public.contrato_renovacoes
FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role));

-- RLS Policies for contrato_anexos
DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can view contrato_anexos"
ON public.contrato_anexos
FOR SELECT
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role));

DROP POLICY IF EXISTS "Authorized users can insert contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can insert contrato_anexos"
ON public.contrato_anexos
FOR INSERT
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'::app_role) OR has_role(auth.uid(), 'recrutador'::app_role));

-- Triggers para updated_at
CREATE OR REPLACE TRIGGER update_contrato_itens_updated_at
BEFORE UPDATE ON public.contrato_itens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_contrato_renovacoes_updated_at
BEFORE UPDATE ON public.contrato_renovacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251010150942_c79e9319-87d5-4945-aaec-17d1693f72b3.sql ===
-- Add estado column to clientes table
DO $$ BEGIN ALTER TABLE public.clientes 
ADD COLUMN estado TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- === 20251010194608_d235d6ac-c147-48bc-acc5-98ea88c902d3.sql ===
-- 1. Criar novo enum
DO $$ BEGIN CREATE TYPE public.app_role_new AS ENUM (
  'admin',
  'gestor_contratos',
  'gestor_captacao',
  'coordenador_escalas',
  'gestor_financeiro',
  'diretoria'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Adicionar colunas temporárias
DO $$ BEGIN ALTER TABLE public.user_roles ADD COLUMN role_new app_role_new; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.menu_permissions ADD COLUMN role_new app_role_new; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- 3. Migrar dados
UPDATE public.user_roles SET role_new = 
  CASE role::text
    WHEN 'admin' THEN 'admin'::app_role_new
    WHEN 'gestor_demanda' THEN 'gestor_contratos'::app_role_new
    WHEN 'recrutador' THEN 'gestor_captacao'::app_role_new
    WHEN 'coordenador_escalas' THEN 'coordenador_escalas'::app_role_new
    WHEN 'financeiro' THEN 'gestor_financeiro'::app_role_new
  END;

UPDATE public.menu_permissions SET role_new = 
  CASE role::text
    WHEN 'admin' THEN 'admin'::app_role_new
    WHEN 'gestor_demanda' THEN 'gestor_contratos'::app_role_new
    WHEN 'recrutador' THEN 'gestor_captacao'::app_role_new
    WHEN 'coordenador_escalas' THEN 'coordenador_escalas'::app_role_new
    WHEN 'financeiro' THEN 'gestor_financeiro'::app_role_new
  END;

-- 4. Dropar TODAS as políticas que dependem has_role ou is_admin
DROP POLICY IF EXISTS "Admins and gestores can manage contratos_demanda" ON public.contratos_demanda;
DROP POLICY IF EXISTS "Admins, gestores and recrutadores can manage demandas" ON public.demandas;
DROP POLICY IF EXISTS "Admins and recrutadores can manage propostas_medicas" ON public.propostas_medicas;
DROP POLICY IF EXISTS "Admins and recrutadores can manage contratos_medico" ON public.contratos_medico;
DROP POLICY IF EXISTS "Admins and coordenadores can manage escalas" ON public.escalas;
DROP POLICY IF EXISTS "Admins and financeiro can manage pagamentos_medico" ON public.pagamentos_medico;
DROP POLICY IF EXISTS "Admins and financeiro can manage recebimentos_cliente" ON public.recebimentos_cliente;
DROP POLICY IF EXISTS "Admins and recrutadores can manage medicos" ON public.medicos;
DROP POLICY IF EXISTS "Coordenadores can view medicos" ON public.medicos;
DROP POLICY IF EXISTS "Authorized users can manage contratos" ON public.contratos;
DROP POLICY IF EXISTS "Authorized users can manage relacionamento_medico" ON public.relacionamento_medico;
DROP POLICY IF EXISTS "Authorized users can upload contract documents" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can view contract documents" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can update contract documents" ON storage.objects;
DROP POLICY IF EXISTS "Authorized users can delete contract documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins and recrutadores can manage leads" ON public.leads;
DROP POLICY IF EXISTS "Coordenadores can view leads" ON public.leads;
DROP POLICY IF EXISTS "Authorized users can manage blacklist" ON public.blacklist;
DROP POLICY IF EXISTS "Authorized users can manage clientes" ON public.clientes;
DROP POLICY IF EXISTS "Authorized users can manage contrato_itens" ON public.contrato_itens;
DROP POLICY IF EXISTS "Authorized users can manage contrato_renovacoes" ON public.contrato_renovacoes;
DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
DROP POLICY IF EXISTS "Authorized users can insert contrato_anexos" ON public.contrato_anexos;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage config_lista_items" ON public.config_lista_items;
DROP POLICY IF EXISTS "Admins can view all historico_acessos" ON public.historico_acessos;
DROP POLICY IF EXISTS "Admins can manage menu_permissions" ON public.menu_permissions;
DROP POLICY IF EXISTS "Admins can view all disparos_log" ON public.disparos_log;
DROP POLICY IF EXISTS "Admins can manage chips" ON public.chips;
DROP POLICY IF EXISTS "Users can view their own disparos_programados" ON public.disparos_programados;
DROP POLICY IF EXISTS "Users can update their own disparos_programados" ON public.disparos_programados;
DROP POLICY IF EXISTS "Admins can delete disparos_programados" ON public.disparos_programados;

-- 5. Dropar funções
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role);
DROP FUNCTION IF EXISTS public.is_admin(uuid);

-- 6. Remover colunas antigas
DO $$ BEGIN ALTER TABLE public.user_roles DROP COLUMN role; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.menu_permissions DROP COLUMN role; EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- 7. Dropar enum antigo
DROP TYPE public.app_role;

-- 8. Renomear novo enum e colunas
ALTER TYPE public.app_role_new RENAME TO app_role;
ALTER TABLE public.user_roles RENAME COLUMN role_new TO role;
DO $$ BEGIN ALTER TABLE public.user_roles ALTER COLUMN role SET NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $$;
ALTER TABLE public.menu_permissions RENAME COLUMN role_new TO role;
DO $$ BEGIN ALTER TABLE public.menu_permissions ALTER COLUMN role SET NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- 9. Recriar funções
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- 10. Recriar TODAS as políticas RLS
DROP POLICY IF EXISTS "Admins and gestores can manage contratos_demanda" ON public.contratos_demanda;
CREATE POLICY "Admins and gestores can manage contratos_demanda"
  ON public.contratos_demanda FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'));

DROP POLICY IF EXISTS "Admins, gestores and recrutadores can manage demandas" ON public.demandas;
CREATE POLICY "Admins, gestores and recrutadores can manage demandas"
  ON public.demandas FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Admins and recrutadores can manage propostas_medicas" ON public.propostas_medicas;
CREATE POLICY "Admins and recrutadores can manage propostas_medicas"
  ON public.propostas_medicas FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Admins and recrutadores can manage contratos_medico" ON public.contratos_medico;
CREATE POLICY "Admins and recrutadores can manage contratos_medico"
  ON public.contratos_medico FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Admins and coordenadores can manage escalas" ON public.escalas;
CREATE POLICY "Admins and coordenadores can manage escalas"
  ON public.escalas FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'coordenador_escalas'));

DROP POLICY IF EXISTS "Admins and financeiro can manage pagamentos_medico" ON public.pagamentos_medico;
CREATE POLICY "Admins and financeiro can manage pagamentos_medico"
  ON public.pagamentos_medico FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_financeiro'));

DROP POLICY IF EXISTS "Admins and financeiro can manage recebimentos_cliente" ON public.recebimentos_cliente;
CREATE POLICY "Admins and financeiro can manage recebimentos_cliente"
  ON public.recebimentos_cliente FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_financeiro'));

DROP POLICY IF EXISTS "Admins and recrutadores can manage medicos" ON public.medicos;
CREATE POLICY "Admins and recrutadores can manage medicos"
  ON public.medicos FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Coordenadores can view medicos" ON public.medicos;
CREATE POLICY "Coordenadores can view medicos"
  ON public.medicos FOR SELECT
  USING (has_role(auth.uid(), 'coordenador_escalas'));

DROP POLICY IF EXISTS "Authorized users can manage contratos" ON public.contratos;
CREATE POLICY "Authorized users can manage contratos"
  ON public.contratos FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Authorized users can manage relacionamento_medico" ON public.relacionamento_medico;
CREATE POLICY "Authorized users can manage relacionamento_medico"
  ON public.relacionamento_medico FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Authorized users can upload contract documents" ON storage.objects;
CREATE POLICY "Authorized users can upload contract documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contratos-documentos' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  );

DROP POLICY IF EXISTS "Authorized users can view contract documents" ON storage.objects;
CREATE POLICY "Authorized users can view contract documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contratos-documentos' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  );

DROP POLICY IF EXISTS "Authorized users can update contract documents" ON storage.objects;
CREATE POLICY "Authorized users can update contract documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'contratos-documentos' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  );

DROP POLICY IF EXISTS "Authorized users can delete contract documents" ON storage.objects;
CREATE POLICY "Authorized users can delete contract documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'contratos-documentos' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  );

DROP POLICY IF EXISTS "Admins and recrutadores can manage leads" ON public.leads;
CREATE POLICY "Admins and recrutadores can manage leads"
  ON public.leads FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Coordenadores can view leads" ON public.leads;
CREATE POLICY "Coordenadores can view leads"
  ON public.leads FOR SELECT
  USING (has_role(auth.uid(), 'coordenador_escalas'));

DROP POLICY IF EXISTS "Authorized users can manage blacklist" ON public.blacklist;
CREATE POLICY "Authorized users can manage blacklist"
  ON public.blacklist FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao') OR has_role(auth.uid(), 'gestor_contratos'));

DROP POLICY IF EXISTS "Authorized users can manage clientes" ON public.clientes;
CREATE POLICY "Authorized users can manage clientes"
  ON public.clientes FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Authorized users can manage contrato_itens" ON public.contrato_itens;
CREATE POLICY "Authorized users can manage contrato_itens"
  ON public.contrato_itens FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Authorized users can manage contrato_renovacoes" ON public.contrato_renovacoes;
CREATE POLICY "Authorized users can manage contrato_renovacoes"
  ON public.contrato_renovacoes FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can view contrato_anexos"
  ON public.contrato_anexos FOR SELECT
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Authorized users can insert contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can insert contrato_anexos"
  ON public.contrato_anexos FOR INSERT
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage config_lista_items" ON public.config_lista_items;
CREATE POLICY "Admins can manage config_lista_items"
  ON public.config_lista_items FOR ALL
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all historico_acessos" ON public.historico_acessos;
CREATE POLICY "Admins can view all historico_acessos"
  ON public.historico_acessos FOR SELECT
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage menu_permissions" ON public.menu_permissions;
CREATE POLICY "Admins can manage menu_permissions"
  ON public.menu_permissions FOR ALL
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can view all disparos_log" ON public.disparos_log;
CREATE POLICY "Admins can view all disparos_log"
  ON public.disparos_log FOR SELECT
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can manage chips" ON public.chips;
CREATE POLICY "Admins can manage chips"
  ON public.chips FOR ALL
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own disparos_programados" ON public.disparos_programados;
CREATE POLICY "Users can view their own disparos_programados"
  ON public.disparos_programados FOR SELECT
  USING ((auth.uid() = usuario_id) OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update their own disparos_programados" ON public.disparos_programados;
CREATE POLICY "Users can update their own disparos_programados"
  ON public.disparos_programados FOR UPDATE
  USING ((auth.uid() = usuario_id) OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can delete disparos_programados" ON public.disparos_programados;
CREATE POLICY "Admins can delete disparos_programados"
  ON public.disparos_programados FOR DELETE
  USING (is_admin(auth.uid()));

-- 11. Criar tabela de permissões granulares
CREATE TABLE IF NOT EXISTS public.permissoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo TEXT NOT NULL,
  acao TEXT NOT NULL,
  perfil app_role NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(modulo, acao, perfil)
);

ALTER TABLE public.permissoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage permissoes" ON public.permissoes;
CREATE POLICY "Admins can manage permissoes"
  ON public.permissoes FOR ALL
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view permissoes" ON public.permissoes;
CREATE POLICY "Authenticated users can view permissoes"
  ON public.permissoes FOR SELECT
  USING (true);

-- 12. Criar tabela de logs
CREATE TABLE IF NOT EXISTS public.permissoes_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  modulo TEXT NOT NULL,
  acao TEXT NOT NULL,
  perfil app_role NOT NULL,
  campo_modificado TEXT NOT NULL,
  valor_anterior TEXT,
  valor_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.permissoes_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view permissoes_log" ON public.permissoes_log;
CREATE POLICY "Admins can view permissoes_log"
  ON public.permissoes_log FOR SELECT
  USING (is_admin(auth.uid()));

DROP POLICY IF EXISTS "System can insert permissoes_log" ON public.permissoes_log;
CREATE POLICY "System can insert permissoes_log"
  ON public.permissoes_log FOR INSERT
  WITH CHECK (true);

-- 13. Criar função para verificar permissão granular
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id UUID,
  _modulo TEXT,
  _acao TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE 
    WHEN EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = _user_id AND role = 'admin'
    ) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.permissoes p
      JOIN public.user_roles ur ON ur.role = p.perfil
      WHERE ur.user_id = _user_id
        AND p.modulo = _modulo
        AND p.acao = _acao
        AND p.ativo = true
    )
  END;
$$;

-- 14. Inserir permissões padrão
INSERT INTO public.permissoes (modulo, acao, perfil, ativo) VALUES
('dashboard', 'visualizar', 'admin', true),
('dashboard', 'visualizar', 'gestor_contratos', true),
('dashboard', 'visualizar', 'gestor_captacao', true),
('dashboard', 'visualizar', 'coordenador_escalas', true),
('dashboard', 'visualizar', 'gestor_financeiro', true),
('dashboard', 'visualizar', 'diretoria', true),
('clientes', 'visualizar', 'admin', true),
('clientes', 'visualizar', 'gestor_contratos', true),
('clientes', 'visualizar', 'diretoria', true),
('clientes', 'criar', 'admin', true),
('clientes', 'criar', 'gestor_contratos', true),
('clientes', 'editar', 'admin', true),
('clientes', 'editar', 'gestor_contratos', true),
('clientes', 'excluir', 'admin', true),
('contratos', 'visualizar', 'admin', true),
('contratos', 'visualizar', 'gestor_contratos', true),
('contratos', 'visualizar', 'diretoria', true),
('contratos', 'criar', 'admin', true),
('contratos', 'criar', 'gestor_contratos', true),
('contratos', 'editar', 'admin', true),
('contratos', 'editar', 'gestor_contratos', true),
('contratos', 'excluir', 'admin', true),
('contratos', 'aprovar', 'admin', true),
('contratos', 'aprovar', 'diretoria', true),
('medicos', 'visualizar', 'admin', true),
('medicos', 'visualizar', 'gestor_captacao', true),
('medicos', 'visualizar', 'coordenador_escalas', true),
('medicos', 'visualizar', 'diretoria', true),
('medicos', 'criar', 'admin', true),
('medicos', 'criar', 'gestor_captacao', true),
('medicos', 'editar', 'admin', true),
('medicos', 'editar', 'gestor_captacao', true),
('medicos', 'excluir', 'admin', true),
('relacionamento', 'visualizar', 'admin', true),
('relacionamento', 'visualizar', 'gestor_captacao', true),
('relacionamento', 'visualizar', 'gestor_contratos', true),
('relacionamento', 'criar', 'admin', true),
('relacionamento', 'criar', 'gestor_captacao', true),
('relacionamento', 'criar', 'gestor_contratos', true),
('relacionamento', 'editar', 'admin', true),
('relacionamento', 'editar', 'gestor_captacao', true),
('relacionamento', 'editar', 'gestor_contratos', true),
('relacionamento', 'excluir', 'admin', true),
('disparos', 'visualizar', 'admin', true),
('disparos', 'visualizar', 'gestor_captacao', true),
('disparos', 'criar', 'admin', true),
('disparos', 'criar', 'gestor_captacao', true),
('disparos', 'editar', 'admin', true),
('disparos', 'editar', 'gestor_captacao', true),
('disparos', 'excluir', 'admin', true),
('configuracoes', 'visualizar', 'admin', true),
('configuracoes', 'editar', 'admin', true),
('financeiro', 'visualizar', 'admin', true),
('financeiro', 'visualizar', 'gestor_financeiro', true),
('financeiro', 'visualizar', 'diretoria', true),
('financeiro', 'criar', 'admin', true),
('financeiro', 'criar', 'gestor_financeiro', true),
('financeiro', 'editar', 'admin', true),
('financeiro', 'editar', 'gestor_financeiro', true),
('financeiro', 'excluir', 'admin', true),
('financeiro', 'aprovar', 'admin', true),
('financeiro', 'aprovar', 'diretoria', true);

-- 15. Trigger para updated_at
DROP TRIGGER IF EXISTS "update_permissoes_updated_at" ON public.permissoes;
CREATE TRIGGER update_permissoes_updated_at
  BEFORE UPDATE ON public.permissoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251014192827_6b975d7c-61d5-4a3e-a42d-215d2c701860.sql ===
-- Adicionar coluna para armazenar números de RQE (Registro de Qualificação de Especialista)
-- Usando array de texto pois médicos especialistas podem ter múltiplos RQEs
DO $$ BEGIN ALTER TABLE public.medicos 
ADD COLUMN rqe_numeros text[] DEFAULT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

COMMENT ON COLUMN public.medicos.rqe_numeros IS 'Números de RQE do médico. Campo opcional, usado apenas para especialistas.';

-- === 20251014193351_76f293b6-969b-4f6b-8e07-29b3615ea2d1.sql ===
-- Alterar coluna especialidade para aceitar múltiplas especialidades
-- Primeiro vamos criar uma coluna temporária com array
DO $$ BEGIN ALTER TABLE public.medicos 
ADD COLUMN especialidades text[] DEFAULT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Copiar dados existentes da coluna especialidade para especialidades como array
UPDATE public.medicos 
SET especialidades = ARRAY[especialidade] 
WHERE especialidade IS NOT NULL;

-- Remover a coluna antiga especialidade
DO $$ BEGIN ALTER TABLE public.medicos 
DROP COLUMN especialidade; EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- Renomear a nova coluna para especialidade
ALTER TABLE public.medicos 
RENAME COLUMN especialidades TO especialidade;

-- Adicionar constraint para garantir que não seja vazio se preenchido
DO $$ BEGIN ALTER TABLE public.medicos 
ADD CONSTRAINT medicos_especialidade_not_empty 
CHECK (especialidade IS NULL OR array_length(especialidade, 1) > 0); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.medicos.especialidade IS 'Especialidades médicas do profissional. Campo obrigatório, permite múltiplas especialidades.';

-- === 20251014193708_7f897197-d18a-4aac-8d9d-96e262968230.sql ===
-- Alterar coluna alocado_cliente_id para aceitar múltiplos clientes
-- Primeiro vamos criar uma coluna temporária com array
DO $$ BEGIN ALTER TABLE public.medicos 
ADD COLUMN alocado_clientes_ids uuid[] DEFAULT NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Copiar dados existentes da coluna alocado_cliente_id para alocado_clientes_ids como array
UPDATE public.medicos 
SET alocado_clientes_ids = ARRAY[alocado_cliente_id] 
WHERE alocado_cliente_id IS NOT NULL;

-- Remover a coluna antiga alocado_cliente_id
DO $$ BEGIN ALTER TABLE public.medicos 
DROP COLUMN alocado_cliente_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- Renomear a nova coluna para alocado_cliente_id
ALTER TABLE public.medicos 
RENAME COLUMN alocado_clientes_ids TO alocado_cliente_id;

COMMENT ON COLUMN public.medicos.alocado_cliente_id IS 'IDs dos clientes onde o médico está alocado. Campo opcional, permite múltiplos clientes.';

-- === 20251014200337_92ee3e15-8062-4021-9948-89a06c65bea5.sql ===
-- Create rate limiting table for WhatsApp sends
CREATE TABLE IF NOT EXISTS public.whatsapp_rate_limit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_rate_limit ENABLE ROW LEVEL SECURITY;

-- CREATE INDEX IF NOT EXISTS for efficient rate limit queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_rate_limit_user_time 
ON public.whatsapp_rate_limit(user_id, created_at DESC);

-- Users can only view their own rate limit records
DROP POLICY IF EXISTS "Users can view own rate limits" ON public.whatsapp_rate_limit;
CREATE POLICY "Users can view own rate limits"
ON public.whatsapp_rate_limit
FOR SELECT
USING (auth.uid() = user_id);

-- Allow authenticated users to insert rate limit records
DROP POLICY IF EXISTS "System can track rate limits" ON public.whatsapp_rate_limit;
CREATE POLICY "System can track rate limits"
ON public.whatsapp_rate_limit
FOR INSERT
WITH CHECK (true);

-- Auto-cleanup old records (older than 24 hours) to keep table size manageable
CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_rate_limit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.whatsapp_rate_limit
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$;

-- === 20251016142827_22d0fade-a372-4b5e-bf85-f762147b7457.sql ===
-- Criar enum para status de licitações
DO $$ BEGIN CREATE TYPE status_licitacao AS ENUM (
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
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Criar enum para status de disparos
DO $$ BEGIN CREATE TYPE status_disparo AS ENUM (
  'nova_oportunidade',
  'disparo',
  'analise_proposta',
  'negociacao',
  'investigacao',
  'proposta_aceita',
  'proposta_arquivada',
  'relacionamento_medico'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Criar enum para status de relacionamento médico
DO $$ BEGIN CREATE TYPE status_relacionamento AS ENUM (
  'inicio_identificacao',
  'captacao_documentacao',
  'pendencia_documentacao',
  'documentacao_finalizada',
  'criacao_escalas'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela de licitações
CREATE TABLE IF NOT EXISTS licitacoes (
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
CREATE TABLE IF NOT EXISTS worklist_tarefas (
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
DO $$ BEGIN ALTER TABLE contratos
ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT,
ADD COLUMN IF NOT EXISTS valor_estimado NUMERIC(15,2),
ADD COLUMN IF NOT EXISTS prazo_meses INTEGER DEFAULT 12,
ADD COLUMN IF NOT EXISTS data_termino DATE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Adicionar campo quantidade em contrato_itens
DO $$ BEGIN ALTER TABLE contrato_itens
ADD COLUMN IF NOT EXISTS quantidade INTEGER DEFAULT 1 CHECK (quantidade >= 1); EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Adicionar campo UF em clientes se não existir
DO $$ BEGIN ALTER TABLE clientes
ADD COLUMN IF NOT EXISTS uf TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Habilitar RLS nas novas tabelas
ALTER TABLE licitacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE worklist_tarefas ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para licitações
DROP POLICY IF EXISTS "Authorized users can manage licitacoes" ON licitacoes;
CREATE POLICY "Authorized users can manage licitacoes"
ON licitacoes
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

-- Políticas RLS para worklist_tarefas
DROP POLICY IF EXISTS "Users can view their own tasks" ON worklist_tarefas;
CREATE POLICY "Users can view their own tasks"
ON worklist_tarefas
FOR SELECT
USING (
  auth.uid() = responsavel_id OR 
  auth.uid() = created_by OR
  is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Authorized users can create tasks" ON worklist_tarefas;
CREATE POLICY "Authorized users can create tasks"
ON worklist_tarefas
FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

DROP POLICY IF EXISTS "Authorized users can update tasks" ON worklist_tarefas;
CREATE POLICY "Authorized users can update tasks"
ON worklist_tarefas
FOR UPDATE
USING (
  auth.uid() = responsavel_id OR 
  auth.uid() = created_by OR
  is_admin(auth.uid())
);

DROP POLICY IF EXISTS "Authorized users can delete tasks" ON worklist_tarefas;
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
DROP TRIGGER IF EXISTS "set_data_termino" ON contratos;
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
DROP TRIGGER IF EXISTS "licitacao_to_disparo_automation" ON AFTER;
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
DROP TRIGGER IF EXISTS "update_licitacoes_updated_at" ON licitacoes;
CREATE TRIGGER update_licitacoes_updated_at
  BEFORE UPDATE ON licitacoes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS "update_worklist_updated_at" ON worklist_tarefas;
CREATE TRIGGER update_worklist_updated_at
  BEFORE UPDATE ON worklist_tarefas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- === 20251016145610_6f34eb41-01d1-4bf8-8c81-b911fe7aeba9.sql ===
-- Adicionar novos campos à tabela licitacoes
DO $$ BEGIN ALTER TABLE public.licitacoes
ADD COLUMN IF NOT EXISTS licitacao_codigo TEXT,
ADD COLUMN IF NOT EXISTS municipio_uf TEXT,
ADD COLUMN IF NOT EXISTS modalidade TEXT,
ADD COLUMN IF NOT EXISTS data_disputa TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS etiquetas TEXT[],
ADD COLUMN IF NOT EXISTS fonte TEXT DEFAULT 'Manual',
ADD COLUMN IF NOT EXISTS effect_id TEXT,
ADD COLUMN IF NOT EXISTS titulo TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Criar índices para otimizar buscas e deduplicação
CREATE INDEX IF NOT EXISTS idx_licitacoes_codigo ON public.licitacoes(licitacao_codigo);
CREATE INDEX IF NOT EXISTS idx_licitacoes_effect_id ON public.licitacoes(effect_id);
CREATE INDEX IF NOT EXISTS idx_licitacoes_fonte ON public.licitacoes(fonte);
CREATE INDEX IF NOT EXISTS idx_licitacoes_data_disputa ON public.licitacoes(data_disputa);

-- Criar tabela para logs de sincronização com Effect
CREATE TABLE IF NOT EXISTS public.effect_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  tipo TEXT NOT NULL, -- 'created', 'updated', 'ignored', 'error'
  licitacao_id UUID REFERENCES public.licitacoes(id) ON DELETE SET NULL,
  effect_id TEXT,
  licitacao_codigo TEXT,
  detalhes JSONB,
  erro TEXT,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_effect_sync_logs_created_at ON public.effect_sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_effect_sync_logs_tipo ON public.effect_sync_logs(tipo);
CREATE INDEX IF NOT EXISTS idx_effect_sync_logs_effect_id ON public.effect_sync_logs(effect_id);

-- Habilitar RLS para effect_sync_logs
ALTER TABLE public.effect_sync_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para effect_sync_logs
DROP POLICY IF EXISTS "Authorized users can view effect_sync_logs" ON public.effect_sync_logs;
CREATE POLICY "Authorized users can view effect_sync_logs"
ON public.effect_sync_logs
FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

DROP POLICY IF EXISTS "System can insert effect_sync_logs" ON public.effect_sync_logs;
CREATE POLICY "System can insert effect_sync_logs"
ON public.effect_sync_logs
FOR INSERT
WITH CHECK (true);

-- Criar bucket de storage para PDFs dos editais (se não existir)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'editais-pdfs',
  'editais-pdfs',
  false,
  52428800, -- 50MB limit
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para editais-pdfs
DROP POLICY IF EXISTS "Authenticated users can view editais PDFs" ON storage.objects;
CREATE POLICY "Authenticated users can view editais PDFs"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'editais-pdfs');

DROP POLICY IF EXISTS "Authorized users can upload editais PDFs" ON storage.objects;
CREATE POLICY "Authorized users can upload editais PDFs"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'editais-pdfs' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

DROP POLICY IF EXISTS "Authorized users can update editais PDFs" ON storage.objects;
CREATE POLICY "Authorized users can update editais PDFs"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'editais-pdfs' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

DROP POLICY IF EXISTS "Authorized users can delete editais PDFs" ON storage.objects;
CREATE POLICY "Authorized users can delete editais PDFs"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'editais-pdfs' AND
  (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role))
);

-- Adicionar trigger para updated_at em effect_sync_logs
DROP TRIGGER IF EXISTS "update_effect_sync_logs_updated_at" ON public.effect_sync_logs;
CREATE TRIGGER update_effect_sync_logs_updated_at
BEFORE UPDATE ON public.effect_sync_logs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251016170312_4e1a9753-85dc-4daa-9837-e6d375fcfe26.sql ===
-- Tabela para armazenar tokens de API
CREATE TABLE IF NOT EXISTS public.api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  ativo BOOLEAN DEFAULT true,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE
);

-- Index para busca rápida por token
CREATE INDEX IF NOT EXISTS idx_api_tokens_token ON public.api_tokens(token) WHERE ativo = true;

-- RLS para api_tokens
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage api_tokens" ON public.api_tokens;
CREATE POLICY "Admins can manage api_tokens"
ON public.api_tokens
FOR ALL
USING (is_admin(auth.uid()));

-- Função para validar token de API
CREATE OR REPLACE FUNCTION public.validate_api_token(_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  token_id UUID;
BEGIN
  SELECT id INTO token_id
  FROM public.api_tokens
  WHERE token = _token
    AND ativo = true
    AND (expires_at IS NULL OR expires_at > now());
  
  IF token_id IS NOT NULL THEN
    UPDATE public.api_tokens
    SET last_used_at = now()
    WHERE id = token_id;
  END IF;
  
  RETURN token_id;
END;
$$;

-- === 20251017192550_f5821b20-923c-4e25-a1b8-96b1bbe08874.sql ===
-- Create enums for patrimonio
DO $$ BEGIN CREATE TYPE categoria_patrimonio AS ENUM ('equipamento', 'mobiliario', 'veiculo', 'informatica', 'outros'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE estado_conservacao AS ENUM ('novo', 'usado', 'danificado', 'inservivel'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE status_patrimonio AS ENUM ('ativo', 'transferido', 'baixado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create patrimonio table
CREATE TABLE IF NOT EXISTS public.patrimonio (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_bem TEXT UNIQUE NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria categoria_patrimonio NOT NULL,
  localizacao TEXT,
  setor TEXT,
  responsavel TEXT,
  data_aquisicao DATE NOT NULL,
  valor_aquisicao NUMERIC(12,2) NOT NULL,
  vida_util_anos INTEGER,
  estado_conservacao estado_conservacao NOT NULL DEFAULT 'novo',
  status status_patrimonio NOT NULL DEFAULT 'ativo',
  numero_serie TEXT,
  fornecedor TEXT,
  nota_fiscal TEXT,
  observacoes TEXT,
  documentos_url TEXT[],
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.patrimonio ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Authorized users can manage patrimonio" ON public.patrimonio;
CREATE POLICY "Authorized users can manage patrimonio"
ON public.patrimonio
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role)
);

-- CREATE OR REPLACE FUNCTION to auto-generate codigo_bem
CREATE OR REPLACE FUNCTION generate_codigo_bem()
RETURNS TRIGGER AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_bem FROM 'PAT-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.patrimonio;
  
  NEW.codigo_bem := 'PAT-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DROP TRIGGER IF EXISTS "for" ON public.patrimonio;
Create trigger for auto-generating codigo_bem
CREATE TRIGGER set_codigo_bem
BEFORE INSERT ON public.patrimonio
FOR EACH ROW
WHEN (NEW.codigo_bem IS NULL OR NEW.codigo_bem = '')
EXECUTE FUNCTION generate_codigo_bem();

-- DROP TRIGGER IF EXISTS "for" ON public.patrimonio;
Create trigger for updated_at
CREATE TRIGGER update_patrimonio_updated_at
BEFORE UPDATE ON public.patrimonio
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251017192614_6f9ef244-38cf-4126-85ea-94689b0d8078.sql ===
-- Fix search_path for generate_codigo_bem function
CREATE OR REPLACE FUNCTION generate_codigo_bem()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_bem FROM 'PAT-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.patrimonio;
  
  NEW.codigo_bem := 'PAT-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

-- === 20251017195524_208917d2-ce79-47a2-942c-bac84a4aad6f.sql ===
-- Create centros_custo table
CREATE TABLE IF NOT EXISTS public.centros_custo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  codigo_interno TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.centros_custo ENABLE ROW LEVEL SECURITY;

-- RLS Policies for centros_custo
DROP POLICY IF EXISTS "Authenticated users can view centros_custo" ON public.centros_custo;
CREATE POLICY "Authenticated users can view centros_custo"
ON public.centros_custo
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage centros_custo" ON public.centros_custo;
CREATE POLICY "Admins can manage centros_custo"
ON public.centros_custo
FOR ALL
USING (is_admin(auth.uid()));

-- Create setores table
CREATE TABLE IF NOT EXISTS public.setores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  centro_custo_id UUID NOT NULL REFERENCES public.centros_custo(id) ON DELETE RESTRICT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.setores ENABLE ROW LEVEL SECURITY;

-- RLS Policies for setores
DROP POLICY IF EXISTS "Authenticated users can view setores" ON public.setores;
CREATE POLICY "Authenticated users can view setores"
ON public.setores
FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Admins can manage setores" ON public.setores;
CREATE POLICY "Admins can manage setores"
ON public.setores
FOR ALL
USING (is_admin(auth.uid()));

-- Insert default centros_custo
INSERT INTO public.centros_custo (nome) VALUES
  ('Financeiro'),
  ('Contratos'),
  ('Licitações'),
  ('Radiologia'),
  ('Tecnologia da Informação'),
  ('Escalas'),
  ('Direção'),
  ('Prospecção e Captação'),
  ('Externos');

-- Add setor_id to profiles table
DO $$ BEGIN ALTER TABLE public.profiles
ADD COLUMN setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Add setor_id to patrimonio table
DO $$ BEGIN ALTER TABLE public.patrimonio
ADD COLUMN setor_id UUID REFERENCES public.setores(id) ON DELETE SET NULL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- DROP TRIGGER IF EXISTS "for" ON public.centros_custo;
Create trigger for updated_at
CREATE TRIGGER update_centros_custo_updated_at
BEFORE UPDATE ON public.centros_custo
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_setores_updated_at" ON public.setores;
CREATE TRIGGER update_setores_updated_at
BEFORE UPDATE ON public.setores
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- === 20251023195534_dc69ddf2-f426-482e-86a6-17b3e5153eb4.sql ===
-- Enums para Radiologia
DO $$ BEGIN CREATE TYPE segmento_radiologia AS ENUM ('RX', 'TC', 'US', 'RM', 'MM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE motivo_ajuste_laudo AS ENUM ('Erro de digitação', 'Informação clínica incompleta', 'Padrão fora do protocolo', 'Solicitado pelo cliente', 'Outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE status_ajuste_laudo AS ENUM ('Pendente', 'Em Ajuste', 'Ajustado'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE motivo_indisponibilidade AS ENUM ('Viagem', 'Férias', 'Motivos pessoais', 'Problemas de saúde'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela: radiologia_agendas
CREATE TABLE IF NOT EXISTS public.radiologia_agendas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  data_agenda DATE NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Tabela: radiologia_producao_exames
CREATE TABLE IF NOT EXISTS public.radiologia_producao_exames (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  segmento segmento_radiologia NOT NULL,
  data DATE NOT NULL,
  quantidade INTEGER NOT NULL CHECK (quantidade >= 0),
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);