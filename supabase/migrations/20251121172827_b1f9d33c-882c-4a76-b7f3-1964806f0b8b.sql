-- Criar tabela central de auditoria
CREATE TABLE IF NOT EXISTS public.auditoria_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Quem realizou a ação
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome TEXT NOT NULL,
  usuario_perfil TEXT,
  
  -- Onde e o quê foi feito
  modulo TEXT NOT NULL, -- contratos, medicos, licitacoes, etc
  tabela TEXT NOT NULL, -- nome da tabela afetada
  acao TEXT NOT NULL, -- INSERT, UPDATE, DELETE, VIEW, EXPORT, APPROVE, etc
  
  -- Contexto da ação
  registro_id TEXT, -- ID do registro afetado
  registro_descricao TEXT, -- descrição legível do registro
  
  -- Dados da alteração
  dados_antigos JSONB, -- valores antes da mudança
  dados_novos JSONB, -- valores após a mudança
  campos_alterados TEXT[], -- lista de campos modificados
  
  -- Controle e segurança
  autorizado BOOLEAN DEFAULT true,
  motivo_bloqueio TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- Informações adicionais
  detalhes TEXT,
  metadata JSONB
);

-- Criar índices para performance
CREATE INDEX idx_auditoria_logs_created_at ON public.auditoria_logs(created_at DESC);
CREATE INDEX idx_auditoria_logs_usuario_id ON public.auditoria_logs(usuario_id);
CREATE INDEX idx_auditoria_logs_modulo ON public.auditoria_logs(modulo);
CREATE INDEX idx_auditoria_logs_tabela ON public.auditoria_logs(tabela);
CREATE INDEX idx_auditoria_logs_acao ON public.auditoria_logs(acao);
CREATE INDEX idx_auditoria_logs_registro_id ON public.auditoria_logs(registro_id);

-- Habilitar RLS
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Admins podem visualizar todos os logs"
ON public.auditoria_logs
FOR SELECT
USING (is_admin(auth.uid()));

CREATE POLICY "Sistema pode inserir logs"
ON public.auditoria_logs
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Usuários podem ver seus próprios logs"
ON public.auditoria_logs
FOR SELECT
USING (auth.uid() = usuario_id);

-- Função para registrar log de auditoria
CREATE OR REPLACE FUNCTION public.log_auditoria(
  p_modulo TEXT,
  p_tabela TEXT,
  p_acao TEXT,
  p_registro_id TEXT DEFAULT NULL,
  p_registro_descricao TEXT DEFAULT NULL,
  p_dados_antigos JSONB DEFAULT NULL,
  p_dados_novos JSONB DEFAULT NULL,
  p_campos_alterados TEXT[] DEFAULT NULL,
  p_detalhes TEXT DEFAULT NULL,
  p_usuario_id UUID DEFAULT NULL,
  p_usuario_nome TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log_id UUID;
  v_user_id UUID;
  v_user_nome TEXT;
  v_user_perfil TEXT;
BEGIN
  -- Obter informações do usuário
  v_user_id := COALESCE(p_usuario_id, auth.uid());
  
  IF v_user_id IS NOT NULL THEN
    SELECT nome_completo INTO v_user_nome
    FROM profiles
    WHERE id = v_user_id;
    
    SELECT string_agg(role::text, ', ') INTO v_user_perfil
    FROM user_roles
    WHERE user_id = v_user_id;
  END IF;
  
  v_user_nome := COALESCE(p_usuario_nome, v_user_nome, 'Sistema');
  
  -- Inserir log
  INSERT INTO auditoria_logs (
    usuario_id,
    usuario_nome,
    usuario_perfil,
    modulo,
    tabela,
    acao,
    registro_id,
    registro_descricao,
    dados_antigos,
    dados_novos,
    campos_alterados,
    detalhes
  ) VALUES (
    v_user_id,
    v_user_nome,
    v_user_perfil,
    p_modulo,
    p_tabela,
    p_acao,
    p_registro_id,
    p_registro_descricao,
    p_dados_antigos,
    p_dados_novos,
    p_campos_alterados,
    p_detalhes
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;

-- Função trigger genérica para auditoria
CREATE OR REPLACE FUNCTION public.trigger_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modulo TEXT;
  v_campos_alterados TEXT[];
  v_key TEXT;
BEGIN
  -- Determinar módulo baseado na tabela
  v_modulo := CASE TG_TABLE_NAME
    WHEN 'contratos' THEN 'Contratos'
    WHEN 'contrato_itens' THEN 'Contratos'
    WHEN 'contrato_renovacoes' THEN 'Contratos'
    WHEN 'contratos_medico' THEN 'Contratos'
    WHEN 'medicos' THEN 'Médicos'
    WHEN 'medico_vinculo_unidade' THEN 'Médicos'
    WHEN 'clientes' THEN 'Clientes'
    WHEN 'unidades' THEN 'Clientes'
    WHEN 'licitacoes' THEN 'Licitações'
    WHEN 'disparos_log' THEN 'Disparos'
    WHEN 'disparos_programados' THEN 'Disparos'
    WHEN 'campanhas' THEN 'Marketing'
    WHEN 'marketing_leads' THEN 'Marketing'
    WHEN 'suporte_tickets' THEN 'Suporte'
    WHEN 'patrimonio' THEN 'Patrimônio'
    WHEN 'escalas' THEN 'Escalas'
    WHEN 'profiles' THEN 'Configurações'
    WHEN 'user_roles' THEN 'Configurações'
    WHEN 'permissoes' THEN 'Configurações'
    ELSE 'Sistema'
  END;
  
  IF TG_OP = 'INSERT' THEN
    PERFORM log_auditoria(
      v_modulo,
      TG_TABLE_NAME,
      'INSERT',
      NEW.id::text,
      NULL,
      NULL,
      to_jsonb(NEW),
      NULL,
      'Registro criado'
    );
    RETURN NEW;
    
  ELSIF TG_OP = 'UPDATE' THEN
    -- Identificar campos alterados
    FOR v_key IN SELECT jsonb_object_keys(to_jsonb(NEW))
    LOOP
      IF to_jsonb(OLD) ->> v_key IS DISTINCT FROM to_jsonb(NEW) ->> v_key THEN
        v_campos_alterados := array_append(v_campos_alterados, v_key);
      END IF;
    END LOOP;
    
    IF array_length(v_campos_alterados, 1) > 0 THEN
      PERFORM log_auditoria(
        v_modulo,
        TG_TABLE_NAME,
        'UPDATE',
        NEW.id::text,
        NULL,
        to_jsonb(OLD),
        to_jsonb(NEW),
        v_campos_alterados,
        'Registro atualizado'
      );
    END IF;
    RETURN NEW;
    
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_auditoria(
      v_modulo,
      TG_TABLE_NAME,
      'DELETE',
      OLD.id::text,
      NULL,
      to_jsonb(OLD),
      NULL,
      NULL,
      'Registro excluído'
    );
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;

-- Criar triggers para as principais tabelas

-- CONTRATOS
DROP TRIGGER IF EXISTS audit_contratos ON contratos;
CREATE TRIGGER audit_contratos
  AFTER INSERT OR UPDATE OR DELETE ON contratos
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_contrato_itens ON contrato_itens;
CREATE TRIGGER audit_contrato_itens
  AFTER INSERT OR UPDATE OR DELETE ON contrato_itens
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_contrato_renovacoes ON contrato_renovacoes;
CREATE TRIGGER audit_contrato_renovacoes
  AFTER INSERT OR UPDATE OR DELETE ON contrato_renovacoes
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_contratos_medico ON contratos_medico;
CREATE TRIGGER audit_contratos_medico
  AFTER INSERT OR UPDATE OR DELETE ON contratos_medico
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- MÉDICOS
DROP TRIGGER IF EXISTS audit_medicos ON medicos;
CREATE TRIGGER audit_medicos
  AFTER INSERT OR UPDATE OR DELETE ON medicos
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_medico_vinculo_unidade ON medico_vinculo_unidade;
CREATE TRIGGER audit_medico_vinculo_unidade
  AFTER INSERT OR UPDATE OR DELETE ON medico_vinculo_unidade
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- CLIENTES
DROP TRIGGER IF EXISTS audit_clientes ON clientes;
CREATE TRIGGER audit_clientes
  AFTER INSERT OR UPDATE OR DELETE ON clientes
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_unidades ON unidades;
CREATE TRIGGER audit_unidades
  AFTER INSERT OR UPDATE OR DELETE ON unidades
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- LICITAÇÕES
DROP TRIGGER IF EXISTS audit_licitacoes ON licitacoes;
CREATE TRIGGER audit_licitacoes
  AFTER INSERT OR UPDATE OR DELETE ON licitacoes
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- DISPAROS
DROP TRIGGER IF EXISTS audit_disparos_log ON disparos_log;
CREATE TRIGGER audit_disparos_log
  AFTER INSERT OR UPDATE OR DELETE ON disparos_log
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_disparos_programados ON disparos_programados;
CREATE TRIGGER audit_disparos_programados
  AFTER INSERT OR UPDATE OR DELETE ON disparos_programados
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- MARKETING
DROP TRIGGER IF EXISTS audit_campanhas ON campanhas;
CREATE TRIGGER audit_campanhas
  AFTER INSERT OR UPDATE OR DELETE ON campanhas
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_marketing_leads ON marketing_leads;
CREATE TRIGGER audit_marketing_leads
  AFTER INSERT OR UPDATE OR DELETE ON marketing_leads
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- SUPORTE
DROP TRIGGER IF EXISTS audit_suporte_tickets ON suporte_tickets;
CREATE TRIGGER audit_suporte_tickets
  AFTER INSERT OR UPDATE OR DELETE ON suporte_tickets
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- PATRIMÔNIO
DROP TRIGGER IF EXISTS audit_patrimonio ON patrimonio;
CREATE TRIGGER audit_patrimonio
  AFTER INSERT OR UPDATE OR DELETE ON patrimonio
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- ESCALAS
DROP TRIGGER IF EXISTS audit_escalas ON escalas;
CREATE TRIGGER audit_escalas
  AFTER INSERT OR UPDATE OR DELETE ON escalas
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

-- CONFIGURAÇÕES
DROP TRIGGER IF EXISTS audit_profiles ON profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_user_roles ON user_roles;
CREATE TRIGGER audit_user_roles
  AFTER INSERT OR UPDATE OR DELETE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();

DROP TRIGGER IF EXISTS audit_permissoes ON permissoes;
CREATE TRIGGER audit_permissoes
  AFTER INSERT OR UPDATE OR DELETE ON permissoes
  FOR EACH ROW EXECUTE FUNCTION trigger_auditoria();