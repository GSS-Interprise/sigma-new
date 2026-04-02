-- Tabela principal de escalas integradas
CREATE TABLE public.escalas_integradas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Identificação da origem
  id_externo TEXT NOT NULL,
  sistema_origem TEXT NOT NULL DEFAULT 'DR_ESCALA',
  
  -- Dados do profissional
  profissional_nome TEXT NOT NULL,
  profissional_crm TEXT,
  profissional_id_externo TEXT,
  
  -- Dados da escala
  setor TEXT NOT NULL,
  unidade TEXT,
  cliente_id UUID REFERENCES public.clientes(id),
  unidade_id UUID REFERENCES public.unidades(id),
  
  -- Data e horários
  data_escala DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  carga_horaria_minutos INTEGER GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (hora_fim - hora_inicio)) / 60
  ) STORED,
  
  -- Tipo e status
  tipo_plantao TEXT,
  status_escala TEXT NOT NULL DEFAULT 'confirmado',
  
  -- Metadados de sincronização
  sincronizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  dados_originais JSONB,
  
  -- Constraint para evitar duplicatas
  CONSTRAINT escalas_integradas_unique_externo UNIQUE (id_externo, sistema_origem)
);

-- Índices para performance
CREATE INDEX idx_escalas_integradas_data ON public.escalas_integradas(data_escala);
CREATE INDEX idx_escalas_integradas_profissional ON public.escalas_integradas(profissional_crm);
CREATE INDEX idx_escalas_integradas_setor ON public.escalas_integradas(setor);
CREATE INDEX idx_escalas_integradas_sistema ON public.escalas_integradas(sistema_origem);
CREATE INDEX idx_escalas_integradas_sincronizado ON public.escalas_integradas(sincronizado_em);

-- Tabela de logs de integração
CREATE TABLE public.escalas_integracao_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Dados da sincronização
  data_sincronizacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  sistema_origem TEXT NOT NULL,
  tipo_operacao TEXT NOT NULL, -- 'api', 'csv', 'excel'
  
  -- Resultado
  status TEXT NOT NULL, -- 'sucesso', 'erro', 'parcial'
  total_registros INTEGER DEFAULT 0,
  registros_sucesso INTEGER DEFAULT 0,
  registros_erro INTEGER DEFAULT 0,
  
  -- Detalhes
  mensagem TEXT,
  erros_detalhados JSONB,
  
  -- Usuário que executou (se manual)
  usuario_id UUID,
  usuario_nome TEXT,
  
  -- Metadados
  ip_origem TEXT,
  arquivo_nome TEXT
);

CREATE INDEX idx_escalas_logs_data ON public.escalas_integracao_logs(data_sincronizacao);
CREATE INDEX idx_escalas_logs_sistema ON public.escalas_integracao_logs(sistema_origem);
CREATE INDEX idx_escalas_logs_status ON public.escalas_integracao_logs(status);

-- Tabela de tokens de API para integração
CREATE TABLE public.escalas_api_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  sistema_origem TEXT NOT NULL DEFAULT 'DR_ESCALA',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  last_used_at TIMESTAMP WITH TIME ZONE,
  created_by UUID
);

CREATE INDEX idx_escalas_tokens_token ON public.escalas_api_tokens(token);

-- Enable RLS
ALTER TABLE public.escalas_integradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_integracao_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_api_tokens ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura para usuários autenticados
CREATE POLICY "Usuários autenticados podem visualizar escalas" 
ON public.escalas_integradas 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem visualizar logs" 
ON public.escalas_integracao_logs 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Apenas admins podem gerenciar tokens
CREATE POLICY "Admins podem gerenciar tokens" 
ON public.escalas_api_tokens 
FOR ALL 
USING (public.is_admin(auth.uid()));

-- Políticas para inserção via service role (API)
CREATE POLICY "Service role pode inserir escalas" 
ON public.escalas_integradas 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Service role pode atualizar escalas" 
ON public.escalas_integradas 
FOR UPDATE 
USING (true);

CREATE POLICY "Service role pode inserir logs" 
ON public.escalas_integracao_logs 
FOR INSERT 
WITH CHECK (true);

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION public.update_escalas_integradas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_escalas_integradas_updated_at
BEFORE UPDATE ON public.escalas_integradas
FOR EACH ROW
EXECUTE FUNCTION public.update_escalas_integradas_updated_at();

-- Função para validar token de API de escalas
CREATE OR REPLACE FUNCTION public.validate_escala_api_token(_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  token_id UUID;
BEGIN
  SELECT id INTO token_id
  FROM public.escalas_api_tokens
  WHERE token = _token
    AND ativo = true
    AND (expires_at IS NULL OR expires_at > now());
  
  IF token_id IS NOT NULL THEN
    UPDATE public.escalas_api_tokens
    SET last_used_at = now()
    WHERE id = token_id;
  END IF;
  
  RETURN token_id;
END;
$$;

-- Comentários para documentação
COMMENT ON TABLE public.escalas_integradas IS 'Escalas recebidas de sistemas externos como Dr. Escala - SOMENTE LEITURA no Sigma';
COMMENT ON TABLE public.escalas_integracao_logs IS 'Logs de sincronização de escalas com sistemas externos';
COMMENT ON TABLE public.escalas_api_tokens IS 'Tokens de autenticação para API de integração de escalas';