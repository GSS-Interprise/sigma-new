-- 1. Criar novo enum
CREATE TYPE public.app_role_new AS ENUM (
  'admin',
  'gestor_contratos',
  'gestor_captacao',
  'coordenador_escalas',
  'gestor_financeiro',
  'diretoria'
);

-- 2. Adicionar colunas temporárias
ALTER TABLE public.user_roles ADD COLUMN role_new app_role_new;
ALTER TABLE public.menu_permissions ADD COLUMN role_new app_role_new;

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
ALTER TABLE public.user_roles DROP COLUMN role;
ALTER TABLE public.menu_permissions DROP COLUMN role;

-- 7. Dropar enum antigo
DROP TYPE public.app_role;

-- 8. Renomear novo enum e colunas
ALTER TYPE public.app_role_new RENAME TO app_role;
ALTER TABLE public.user_roles RENAME COLUMN role_new TO role;
ALTER TABLE public.user_roles ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.menu_permissions RENAME COLUMN role_new TO role;
ALTER TABLE public.menu_permissions ALTER COLUMN role SET NOT NULL;

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
CREATE POLICY "Admins and gestores can manage contratos_demanda"
  ON public.contratos_demanda FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'));

CREATE POLICY "Admins, gestores and recrutadores can manage demandas"
  ON public.demandas FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Admins and recrutadores can manage propostas_medicas"
  ON public.propostas_medicas FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Admins and recrutadores can manage contratos_medico"
  ON public.contratos_medico FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Admins and coordenadores can manage escalas"
  ON public.escalas FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'coordenador_escalas'));

CREATE POLICY "Admins and financeiro can manage pagamentos_medico"
  ON public.pagamentos_medico FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_financeiro'));

CREATE POLICY "Admins and financeiro can manage recebimentos_cliente"
  ON public.recebimentos_cliente FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_financeiro'));

CREATE POLICY "Admins and recrutadores can manage medicos"
  ON public.medicos FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Coordenadores can view medicos"
  ON public.medicos FOR SELECT
  USING (has_role(auth.uid(), 'coordenador_escalas'));

CREATE POLICY "Authorized users can manage contratos"
  ON public.contratos FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Authorized users can manage relacionamento_medico"
  ON public.relacionamento_medico FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Authorized users can upload contract documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'contratos-documentos' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  );

CREATE POLICY "Authorized users can view contract documents"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'contratos-documentos' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  );

CREATE POLICY "Authorized users can update contract documents"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'contratos-documentos' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  );

CREATE POLICY "Authorized users can delete contract documents"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'contratos-documentos' AND
    (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  );

CREATE POLICY "Admins and recrutadores can manage leads"
  ON public.leads FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Coordenadores can view leads"
  ON public.leads FOR SELECT
  USING (has_role(auth.uid(), 'coordenador_escalas'));

CREATE POLICY "Authorized users can manage blacklist"
  ON public.blacklist FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao') OR has_role(auth.uid(), 'gestor_contratos'));

CREATE POLICY "Authorized users can manage clientes"
  ON public.clientes FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Authorized users can manage contrato_itens"
  ON public.contrato_itens FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Authorized users can manage contrato_renovacoes"
  ON public.contrato_renovacoes FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'))
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Authorized users can view contrato_anexos"
  ON public.contrato_anexos FOR SELECT
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Authorized users can insert contrato_anexos"
  ON public.contrato_anexos FOR INSERT
  WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos') OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage config_lista_items"
  ON public.config_lista_items FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view all historico_acessos"
  ON public.historico_acessos FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage menu_permissions"
  ON public.menu_permissions FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can view all disparos_log"
  ON public.disparos_log FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admins can manage chips"
  ON public.chips FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Users can view their own disparos_programados"
  ON public.disparos_programados FOR SELECT
  USING ((auth.uid() = usuario_id) OR is_admin(auth.uid()));

CREATE POLICY "Users can update their own disparos_programados"
  ON public.disparos_programados FOR UPDATE
  USING ((auth.uid() = usuario_id) OR is_admin(auth.uid()));

CREATE POLICY "Admins can delete disparos_programados"
  ON public.disparos_programados FOR DELETE
  USING (is_admin(auth.uid()));

-- 11. Criar tabela de permissões granulares
CREATE TABLE public.permissoes (
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

CREATE POLICY "Admins can manage permissoes"
  ON public.permissoes FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view permissoes"
  ON public.permissoes FOR SELECT
  USING (true);

-- 12. Criar tabela de logs
CREATE TABLE public.permissoes_log (
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

CREATE POLICY "Admins can view permissoes_log"
  ON public.permissoes_log FOR SELECT
  USING (is_admin(auth.uid()));

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
CREATE TRIGGER update_permissoes_updated_at
  BEFORE UPDATE ON public.permissoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();