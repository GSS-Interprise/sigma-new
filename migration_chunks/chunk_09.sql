CREATE TRIGGER update_user_notas_updated_at
  BEFORE UPDATE ON public.user_notas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket para anexos de notas
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-notas-anexos', 'user-notas-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para anexos
DROP POLICY IF EXISTS "Usuários podem ver seus próprios anexos" ON storage.objects;
CREATE POLICY "Usuários podem ver seus próprios anexos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-notas-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Usuários podem fazer upload de seus próprios anexos" ON storage.objects;
CREATE POLICY "Usuários podem fazer upload de seus próprios anexos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'user-notas-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "Usuários podem deletar seus próprios anexos" ON storage.objects;
CREATE POLICY "Usuários podem deletar seus próprios anexos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'user-notas-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- === 20260116173214_18916f1e-6940-4d45-a9b5-c81005044c32.sql ===
-- =====================================================
-- ESTRUTURA PARA INTELIGÊNCIA COMPETITIVA POR ITEM
-- =====================================================

-- 1. Tabela de Itens da Licitação
CREATE TABLE IF NOT EXISTS public.licitacao_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'outro', -- consulta, exame, servico, plantao, especialidade, outro
  descricao TEXT,
  valor_referencia NUMERIC(15,2),
  quantidade INTEGER DEFAULT 1,
  unidade_medida TEXT, -- unidade, hora, mes, etc
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 2. Tabela de Concorrentes por Item
CREATE TABLE IF NOT EXISTS public.licitacao_item_concorrentes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  item_id UUID NOT NULL REFERENCES public.licitacao_itens(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.empresas_concorrentes(id),
  empresa_nome TEXT NOT NULL,
  empresa_cnpj TEXT,
  valor_ofertado NUMERIC(15,2) NOT NULL,
  posicao INTEGER NOT NULL DEFAULT 1, -- 1º, 2º, 3º...
  situacao TEXT NOT NULL DEFAULT 'habilitada', -- habilitada, inabilitada, desclassificada
  motivo_situacao TEXT, -- motivo de inabilitação ou desclassificação
  is_gss BOOLEAN NOT NULL DEFAULT false,
  is_vencedor BOOLEAN NOT NULL DEFAULT false,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. Índices para performance
CREATE INDEX IF NOT EXISTS idx_licitacao_itens_licitacao ON public.licitacao_itens(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_item_concorrentes_item ON public.licitacao_item_concorrentes(item_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_item_concorrentes_empresa ON public.licitacao_item_concorrentes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_item_concorrentes_is_gss ON public.licitacao_item_concorrentes(is_gss);
CREATE INDEX IF NOT EXISTS idx_licitacao_item_concorrentes_is_vencedor ON public.licitacao_item_concorrentes(is_vencedor);

-- 4. Triggers para updated_at
DROP TRIGGER IF EXISTS "update_licitacao_itens_updated_at" ON public.licitacao_itens;
CREATE TRIGGER update_licitacao_itens_updated_at
  BEFORE UPDATE ON public.licitacao_itens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_licitacao_item_concorrentes_updated_at" ON public.licitacao_item_concorrentes;
CREATE TRIGGER update_licitacao_item_concorrentes_updated_at
  BEFORE UPDATE ON public.licitacao_item_concorrentes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 5. RLS
ALTER TABLE public.licitacao_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.licitacao_item_concorrentes ENABLE ROW LEVEL SECURITY;

-- Políticas para licitacao_itens
DROP POLICY IF EXISTS "Usuarios autenticados podem ver itens de licitacao" ON public.licitacao_itens;
CREATE POLICY "Usuarios autenticados podem ver itens de licitacao"
  ON public.licitacao_itens FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados podem inserir itens de licitacao" ON public.licitacao_itens;
CREATE POLICY "Usuarios autenticados podem inserir itens de licitacao"
  ON public.licitacao_itens FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados podem atualizar itens de licitacao" ON public.licitacao_itens;
CREATE POLICY "Usuarios autenticados podem atualizar itens de licitacao"
  ON public.licitacao_itens FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados podem deletar itens de licitacao" ON public.licitacao_itens;
CREATE POLICY "Usuarios autenticados podem deletar itens de licitacao"
  ON public.licitacao_itens FOR DELETE TO authenticated USING (true);

-- Políticas para licitacao_item_concorrentes
DROP POLICY IF EXISTS "Usuarios autenticados podem ver concorrentes de item" ON public.licitacao_item_concorrentes;
CREATE POLICY "Usuarios autenticados podem ver concorrentes de item"
  ON public.licitacao_item_concorrentes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados podem inserir concorrentes de item" ON public.licitacao_item_concorrentes;
CREATE POLICY "Usuarios autenticados podem inserir concorrentes de item"
  ON public.licitacao_item_concorrentes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Usuarios autenticados podem atualizar concorrentes de item" ON public.licitacao_item_concorrentes;
CREATE POLICY "Usuarios autenticados podem atualizar concorrentes de item"
  ON public.licitacao_item_concorrentes FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Usuarios autenticados podem deletar concorrentes de item" ON public.licitacao_item_concorrentes;
CREATE POLICY "Usuarios autenticados podem deletar concorrentes de item"
  ON public.licitacao_item_concorrentes FOR DELETE TO authenticated USING (true);

-- 6. Habilitar realtime para atualizações em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.licitacao_itens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.licitacao_item_concorrentes;

-- 7. Comentários para documentação
COMMENT ON TABLE public.licitacao_itens IS 'Itens de uma licitação (consultas, exames, serviços, etc.)';
COMMENT ON TABLE public.licitacao_item_concorrentes IS 'Empresas concorrentes por item de licitação com valores e posições';
COMMENT ON COLUMN public.licitacao_item_concorrentes.is_gss IS 'Marcação automática quando a empresa é GSS';
COMMENT ON COLUMN public.licitacao_item_concorrentes.is_vencedor IS 'Flag para indicar empresa vencedora do item';

-- === 20260116183901_2e05c08b-0bf7-4ee2-a575-8697676051d6.sql ===
-- 1. Criar ENUM para tipo de disparo
DO $tw$ BEGIN CREATE TYPE tipo_disparo_enum AS ENUM ('zap', 'email', 'outros'); EXCEPTION WHEN duplicate_object THEN NULL; END $tw$;


-- 2. Adicionar coluna tipo_disparo na tabela proposta
DO $acol$ BEGIN ALTER TABLE public.proposta 
ADD COLUMN tipo_disparo tipo_disparo_enum NOT NULL DEFAULT 'zap'; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- 3. Migração: todas as propostas existentes recebem 'zap'
UPDATE public.proposta SET tipo_disparo = 'zap' WHERE tipo_disparo IS NULL;

-- 4. Criar tabela de interações de email (chat simplificado)
CREATE TABLE IF NOT EXISTS public.email_interacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposta_id UUID REFERENCES public.proposta(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  email_destino TEXT NOT NULL,
  nome_destino TEXT,
  
  -- Direção da mensagem
  direcao TEXT NOT NULL CHECK (direcao IN ('enviado', 'recebido')),
  
  -- Conteúdo
  assunto TEXT,
  corpo TEXT NOT NULL,
  corpo_html TEXT,
  
  -- Metadados
  message_id TEXT, -- ID único do email para threading
  in_reply_to TEXT, -- Para encadeamento
  
  -- Status
  status TEXT DEFAULT 'enviado' CHECK (status IN ('enviado', 'entregue', 'lido', 'respondido', 'falha')),
  
  -- Usuário que enviou (se enviado pelo sistema)
  enviado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  enviado_por_nome TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Índices para performance
CREATE INDEX IF NOT EXISTS idx_email_interacoes_proposta ON public.email_interacoes(proposta_id);
CREATE INDEX IF NOT EXISTS idx_email_interacoes_lead ON public.email_interacoes(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_interacoes_email ON public.email_interacoes(email_destino);
CREATE INDEX IF NOT EXISTS idx_email_interacoes_created ON public.email_interacoes(created_at DESC);

-- 6. Trigger para updated_at
DROP TRIGGER IF EXISTS "update_email_interacoes_updated_at" ON public.email_interacoes;
CREATE TRIGGER update_email_interacoes_updated_at
BEFORE UPDATE ON public.email_interacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Enable RLS
ALTER TABLE public.email_interacoes ENABLE ROW LEVEL SECURITY;

-- 8. Políticas de acesso
DROP POLICY IF EXISTS "Usuários autenticados podem ver interações" ON public.email_interacoes;
CREATE POLICY "Usuários autenticados podem ver interações" 
ON public.email_interacoes 
FOR SELECT 
TO authenticated 
USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem inserir interações" ON public.email_interacoes;
CREATE POLICY "Usuários autenticados podem inserir interações" 
ON public.email_interacoes 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Usuários autenticados podem atualizar interações" ON public.email_interacoes;
CREATE POLICY "Usuários autenticados podem atualizar interações" 
ON public.email_interacoes 
FOR UPDATE 
TO authenticated 
USING (true);

-- 9. Enable realtime para interações
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_interacoes;

-- 10. Adicionar coluna status_email na proposta para tracking
DO $acol$ BEGIN ALTER TABLE public.proposta 
ADD COLUMN status_email TEXT DEFAULT 'aguardando_envio' CHECK (status_email IN ('aguardando_envio', 'enviado', 'entregue', 'respondido', 'falha')); EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- 11. Adicionar timestamp de último envio
DO $acol$ BEGIN ALTER TABLE public.proposta 
ADD COLUMN ultimo_envio_email TIMESTAMPTZ; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- === 20260116185438_eab3abb6-a87a-43f6-924d-4133f36d1f1f.sql ===
-- Tabela de campanhas de email (similar a disparos_campanhas)
CREATE TABLE IF NOT EXISTS public.email_campanhas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  proposta_id UUID REFERENCES public.proposta(id) ON DELETE SET NULL,
  texto_ia TEXT,
  responsavel_id UUID,
  responsavel_nome TEXT,
  status TEXT DEFAULT 'pendente',
  total_contatos INTEGER DEFAULT 0,
  enviados INTEGER DEFAULT 0,
  falhas INTEGER DEFAULT 0,
  respondidos INTEGER DEFAULT 0,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de contatos de campanhas de email
CREATE TABLE IF NOT EXISTS public.email_contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL REFERENCES public.email_campanhas(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  email TEXT NOT NULL,
  nome TEXT,
  especialidade TEXT,
  uf TEXT,
  status TEXT DEFAULT 'pendente',
  data_envio TIMESTAMPTZ,
  data_resposta TIMESTAMPTZ,
  erro TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_email_campanhas_proposta ON public.email_campanhas(proposta_id);
CREATE INDEX IF NOT EXISTS idx_email_campanhas_ativo ON public.email_campanhas(ativo);
CREATE INDEX IF NOT EXISTS idx_email_contatos_campanha ON public.email_contatos(campanha_id);
CREATE INDEX IF NOT EXISTS idx_email_contatos_status ON public.email_contatos(status);

-- RLS
ALTER TABLE public.email_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_contatos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view email_campanhas" ON public.email_campanhas;
CREATE POLICY "Users can view email_campanhas" ON public.email_campanhas FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert email_campanhas" ON public.email_campanhas;
CREATE POLICY "Users can insert email_campanhas" ON public.email_campanhas FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update email_campanhas" ON public.email_campanhas;
CREATE POLICY "Users can update email_campanhas" ON public.email_campanhas FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Users can delete email_campanhas" ON public.email_campanhas;
CREATE POLICY "Users can delete email_campanhas" ON public.email_campanhas FOR DELETE USING (true);

DROP POLICY IF EXISTS "Users can view email_contatos" ON public.email_contatos;
CREATE POLICY "Users can view email_contatos" ON public.email_contatos FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can insert email_contatos" ON public.email_contatos;
CREATE POLICY "Users can insert email_contatos" ON public.email_contatos FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Users can update email_contatos" ON public.email_contatos;
CREATE POLICY "Users can update email_contatos" ON public.email_contatos FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Users can delete email_contatos" ON public.email_contatos;
CREATE POLICY "Users can delete email_contatos" ON public.email_contatos FOR DELETE USING (true);

-- Trigger para updated_at
DROP TRIGGER IF EXISTS "update_email_campanhas_updated_at" ON public.email_campanhas;
CREATE TRIGGER update_email_campanhas_updated_at
  BEFORE UPDATE ON public.email_campanhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_campanhas;

-- === 20260120171612_6e33538f-a530-4094-93e8-df9cf396f84c.sql ===
-- Tabela para motivos de descarte de licitação
CREATE TABLE IF NOT EXISTS public.licitacao_motivos_descarte (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Inserir motivos padrão
INSERT INTO public.licitacao_motivos_descarte (nome) VALUES
  ('EXIGE CLT'),
  ('VALOR BAIXO'),
  ('VOLUMETRIA BAIXA'),
  ('EXCLUSIVIDADE ME/EPP'),
  ('NECESSIDADE DE LOCAL'),
  ('EXIGE EQUIPAMENTO'),
  ('FORA DO ESCOPO'),
  ('EDITAL REPETIDO');

-- Tabela para registrar descartes de licitação
CREATE TABLE IF NOT EXISTS public.licitacao_descartes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  motivo_id UUID NOT NULL REFERENCES public.licitacao_motivos_descarte(id),
  justificativa TEXT NOT NULL CHECK (char_length(justificativa) >= 30),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_by_nome TEXT
);

-- RLS para motivos
ALTER TABLE public.licitacao_motivos_descarte ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem visualizar motivos ativos" ON public.licitacao_motivos_descarte;
CREATE POLICY "Todos podem visualizar motivos ativos"
ON public.licitacao_motivos_descarte FOR SELECT
USING (ativo = true);

DROP POLICY IF EXISTS "Admins podem inserir motivos" ON public.licitacao_motivos_descarte;
CREATE POLICY "Admins podem inserir motivos"
ON public.licitacao_motivos_descarte FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- RLS para descartes
ALTER TABLE public.licitacao_descartes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários autenticados podem ver descartes" ON public.licitacao_descartes;
CREATE POLICY "Usuários autenticados podem ver descartes"
ON public.licitacao_descartes FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem inserir descartes" ON public.licitacao_descartes;
CREATE POLICY "Usuários autenticados podem inserir descartes"
ON public.licitacao_descartes FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Índices
CREATE INDEX IF NOT EXISTS idx_licitacao_descartes_licitacao ON public.licitacao_descartes(licitacao_id);
CREATE INDEX IF NOT EXISTS idx_licitacao_motivos_descarte_ativo ON public.licitacao_motivos_descarte(ativo);

-- === 20260120172834_1df28966-3185-476c-8222-6c2476ddfcfe.sql ===
-- Adicionar colunas de snapshot para indicadores estratégicos
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS valor_estimado NUMERIC;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS uf VARCHAR(2);
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS municipio TEXT;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS orgao TEXT;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS modalidade TEXT;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS numero_edital TEXT;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS objeto TEXT;
ALTER TABLE public.licitacao_descartes ADD COLUMN IF NOT EXISTS motivo_nome TEXT;

-- Comentários para documentação
COMMENT ON COLUMN public.licitacao_descartes.valor_estimado IS 'Snapshot do valor estimado da licitação no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.uf IS 'UF extraída do municipio_uf no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.municipio IS 'Município da licitação no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.orgao IS 'Órgão responsável no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.modalidade IS 'Modalidade da licitação no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.numero_edital IS 'Número do edital no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.objeto IS 'Objeto da licitação no momento do descarte';
COMMENT ON COLUMN public.licitacao_descartes.motivo_nome IS 'Nome do motivo desnormalizado para queries rápidas';

-- === 20260121113924_fc21c0ad-4812-4352-b523-c49ad2222311.sql ===
-- Adicionar política para permitir que líderes/gestores de captação possam atualizar o setor_id de profiles
-- para adicionar/remover usuários do setor de captação

DROP POLICY IF EXISTS "Captação leaders can update user sectors" ON public.profiles;
CREATE POLICY "Captação leaders can update user sectors"
ON public.profiles
FOR UPDATE
USING (
  public.is_captacao_leader(auth.uid()) OR 
  public.has_role(auth.uid(), 'gestor_captacao'::app_role)
)
WITH CHECK (
  public.is_captacao_leader(auth.uid()) OR 
  public.has_role(auth.uid(), 'gestor_captacao'::app_role)
);

-- === 20260121130716_f656ba46-6fce-44f4-b75f-168446643642.sql ===
-- Adicionar coluna assunto_email na tabela email_campanhas
ALTER TABLE public.email_campanhas 
ADD COLUMN IF NOT EXISTS assunto_email TEXT;

-- === 20260121132647_b4a9a625-8bef-4576-9f81-368375b672ed.sql ===
-- Tabela para configurações do sistema (webhook URLs, etc.)
CREATE TABLE IF NOT EXISTS public.supabase_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chave TEXT NOT NULL UNIQUE,
  valor TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.supabase_config ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver/editar configs
DROP POLICY IF EXISTS "Admins can view config" ON public.supabase_config;
CREATE POLICY "Admins can view config" 
  ON public.supabase_config FOR SELECT 
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert config" ON public.supabase_config;
CREATE POLICY "Admins can insert config" 
  ON public.supabase_config FOR INSERT 
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update config" ON public.supabase_config;
CREATE POLICY "Admins can update config" 
  ON public.supabase_config FOR UPDATE 
  USING (public.is_admin(auth.uid()));

-- Trigger para updated_at
DROP TRIGGER IF EXISTS "update_supabase_config_updated_at" ON public.supabase_config;
CREATE TRIGGER update_supabase_config_updated_at
  BEFORE UPDATE ON public.supabase_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- === 20260122185530_2d35df6f-e19f-4e89-82f4-e3c3dfa89904.sql ===
-- Tabela principal de escalas integradas
CREATE TABLE IF NOT EXISTS public.escalas_integradas (
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
CREATE INDEX IF NOT EXISTS idx_escalas_integradas_data ON public.escalas_integradas(data_escala);
CREATE INDEX IF NOT EXISTS idx_escalas_integradas_profissional ON public.escalas_integradas(profissional_crm);
CREATE INDEX IF NOT EXISTS idx_escalas_integradas_setor ON public.escalas_integradas(setor);
CREATE INDEX IF NOT EXISTS idx_escalas_integradas_sistema ON public.escalas_integradas(sistema_origem);
CREATE INDEX IF NOT EXISTS idx_escalas_integradas_sincronizado ON public.escalas_integradas(sincronizado_em);

-- Tabela de logs de integração
CREATE TABLE IF NOT EXISTS public.escalas_integracao_logs (
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

CREATE INDEX IF NOT EXISTS idx_escalas_logs_data ON public.escalas_integracao_logs(data_sincronizacao);
CREATE INDEX IF NOT EXISTS idx_escalas_logs_sistema ON public.escalas_integracao_logs(sistema_origem);
CREATE INDEX IF NOT EXISTS idx_escalas_logs_status ON public.escalas_integracao_logs(status);

-- Tabela de tokens de API para integração
CREATE TABLE IF NOT EXISTS public.escalas_api_tokens (
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

CREATE INDEX IF NOT EXISTS idx_escalas_tokens_token ON public.escalas_api_tokens(token);

-- Enable RLS
ALTER TABLE public.escalas_integradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_integracao_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_api_tokens ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura para usuários autenticados
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar escalas" ON public.escalas_integradas;
CREATE POLICY "Usuários autenticados podem visualizar escalas" 
ON public.escalas_integradas 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar logs" ON public.escalas_integracao_logs;
CREATE POLICY "Usuários autenticados podem visualizar logs" 
ON public.escalas_integracao_logs 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Apenas admins podem gerenciar tokens
DROP POLICY IF EXISTS "Admins podem gerenciar tokens" ON public.escalas_api_tokens;
CREATE POLICY "Admins podem gerenciar tokens" 
ON public.escalas_api_tokens 
FOR ALL 
USING (public.is_admin(auth.uid()));

-- Políticas para inserção via service role (API)
DROP POLICY IF EXISTS "Service role pode inserir escalas" ON public.escalas_integradas;
CREATE POLICY "Service role pode inserir escalas" 
ON public.escalas_integradas 
FOR INSERT 
WITH CHECK (true);

DROP POLICY IF EXISTS "Service role pode atualizar escalas" ON public.escalas_integradas;
CREATE POLICY "Service role pode atualizar escalas" 
ON public.escalas_integradas 
FOR UPDATE 
USING (true);

DROP POLICY IF EXISTS "Service role pode inserir logs" ON public.escalas_integracao_logs;
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

DROP TRIGGER IF EXISTS "update_escalas_integradas_updated_at" ON public.escalas_integradas;
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

-- === 20260122193516_7a61576b-47d0-443b-bc0e-483f965dbe07.sql ===
-- Tabela de fontes de escala (cadastro de planilhas Google Sheets)
CREATE TABLE IF NOT EXISTS public.escalas_ambulatoriais_fontes (
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
CREATE TABLE IF NOT EXISTS public.escalas_ambulatoriais_templates (
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
DO $ac$ BEGIN ALTER TABLE public.escalas_ambulatoriais_fontes 
ADD CONSTRAINT escalas_ambulatoriais_fontes_template_id_fkey 
FOREIGN KEY (template_id) REFERENCES public.escalas_ambulatoriais_templates(id); EXCEPTION WHEN duplicate_object THEN NULL; END $ac$;

-- Tabela de escalas ambulatoriais (dados normalizados)
CREATE TABLE IF NOT EXISTS public.escalas_ambulatoriais (
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
CREATE TABLE IF NOT EXISTS public.escalas_ambulatoriais_logs (
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
CREATE INDEX IF NOT EXISTS idx_escalas_ambulatoriais_fonte_id ON public.escalas_ambulatoriais(fonte_id);
CREATE INDEX IF NOT EXISTS idx_escalas_ambulatoriais_data ON public.escalas_ambulatoriais(data_escala);
CREATE INDEX IF NOT EXISTS idx_escalas_ambulatoriais_cliente ON public.escalas_ambulatoriais(cliente_id);
CREATE INDEX IF NOT EXISTS idx_escalas_ambulatoriais_logs_fonte ON public.escalas_ambulatoriais_logs(fonte_id);
CREATE INDEX IF NOT EXISTS idx_escalas_ambulatoriais_logs_data ON public.escalas_ambulatoriais_logs(data_sincronizacao);

-- Trigger para updated_at nas fontes
DROP TRIGGER IF EXISTS "update_escalas_ambulatoriais_fontes_updated_at" ON public.escalas_ambulatoriais_fontes;
CREATE TRIGGER update_escalas_ambulatoriais_fontes_updated_at
  BEFORE UPDATE ON public.escalas_ambulatoriais_fontes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para updated_at nos templates
DROP TRIGGER IF EXISTS "update_escalas_ambulatoriais_templates_updated_at" ON public.escalas_ambulatoriais_templates;
CREATE TRIGGER update_escalas_ambulatoriais_templates_updated_at
  BEFORE UPDATE ON public.escalas_ambulatoriais_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger para updated_at nas escalas
DROP TRIGGER IF EXISTS "update_escalas_ambulatoriais_updated_at" ON public.escalas_ambulatoriais;
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
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar fontes" ON public.escalas_ambulatoriais_fontes;
CREATE POLICY "Usuários autenticados podem visualizar fontes"
  ON public.escalas_ambulatoriais_fontes FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins podem gerenciar fontes" ON public.escalas_ambulatoriais_fontes;
CREATE POLICY "Admins podem gerenciar fontes"
  ON public.escalas_ambulatoriais_fontes FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar templates" ON public.escalas_ambulatoriais_templates;
CREATE POLICY "Usuários autenticados podem visualizar templates"
  ON public.escalas_ambulatoriais_templates FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins podem gerenciar templates" ON public.escalas_ambulatoriais_templates;
CREATE POLICY "Admins podem gerenciar templates"
  ON public.escalas_ambulatoriais_templates FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar escalas ambulatoriais" ON public.escalas_ambulatoriais;
CREATE POLICY "Usuários autenticados podem visualizar escalas ambulatoriais"
  ON public.escalas_ambulatoriais FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins podem gerenciar escalas ambulatoriais" ON public.escalas_ambulatoriais;
CREATE POLICY "Admins podem gerenciar escalas ambulatoriais"
  ON public.escalas_ambulatoriais FOR ALL
  TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Usuários autenticados podem visualizar logs" ON public.escalas_ambulatoriais_logs;
CREATE POLICY "Usuários autenticados podem visualizar logs"
  ON public.escalas_ambulatoriais_logs FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Sistema pode inserir logs" ON public.escalas_ambulatoriais_logs;
CREATE POLICY "Sistema pode inserir logs"
  ON public.escalas_ambulatoriais_logs FOR INSERT
  TO authenticated WITH CHECK (true);

-- Template padrão inicial
INSERT INTO public.escalas_ambulatoriais_templates (nome, descricao, linha_inicio_recursos, coluna_recursos, linha_cabecalho_dias, coluna_inicio_dias)
VALUES ('Template Padrão', 'Layout padrão com recursos na coluna A e dias nas colunas B em diante', 2, 'A', 1, 'B');

-- === 20260123115414_8190efdd-399f-4205-b8ce-f9597a937bdb.sql ===
-- Add missing enum value used by Kanban column "Conferência"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'status_licitacao'
      AND e.enumlabel = 'conferencia'
  ) THEN
    ALTER TYPE public.status_licitacao ADD VALUE 'conferencia' AFTER 'edital_analise';
  END IF;
END $$;

-- === 20260123150247_a4bb1357-91a5-4af8-9b37-3cae2d4fcf40.sql ===
-- Adicionar campos de rastreamento de resposta na tabela licitacoes_atividades
DO $acol$ BEGIN ALTER TABLE public.licitacoes_atividades 
ADD COLUMN resposta_esperada_ate TIMESTAMP WITH TIME ZONE,
ADD COLUMN responsavel_resposta_id UUID REFERENCES auth.users(id),
ADD COLUMN setor_responsavel TEXT,
ADD COLUMN respondido_em TIMESTAMP WITH TIME ZONE,
ADD COLUMN respondido_por UUID REFERENCES auth.users(id),
ADD COLUMN is_critico BOOLEAN DEFAULT false; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;

-- Criar índice para consultas de mensagens pendentes
CREATE INDEX IF NOT EXISTS idx_licitacoes_atividades_resposta_pendente 
ON public.licitacoes_atividades(resposta_esperada_ate) 
WHERE resposta_esperada_ate IS NOT NULL AND respondido_em IS NULL;

-- Criar índice para mensagens críticas
CREATE INDEX IF NOT EXISTS idx_licitacoes_atividades_criticas 
ON public.licitacoes_atividades(licitacao_id, is_critico) 
WHERE is_critico = true AND respondido_em IS NULL;

-- Adicionar campo de risco na tabela licitacoes para indicador visual
ALTER TABLE public.licitacoes
ADD COLUMN IF NOT EXISTS tem_mensagem_critica_pendente BOOLEAN DEFAULT false;

-- Função para calcular status da mensagem baseado no prazo
CREATE OR REPLACE FUNCTION public.calcular_status_resposta_atividade(
  p_resposta_esperada_ate TIMESTAMP WITH TIME ZONE,
  p_respondido_em TIMESTAMP WITH TIME ZONE
) RETURNS TEXT AS $$
DECLARE
  v_agora TIMESTAMP WITH TIME ZONE;
  v_horas_restantes NUMERIC;
BEGIN
  -- Se já foi respondido, retorna "respondido"
  IF p_respondido_em IS NOT NULL THEN
    RETURN 'respondido';
  END IF;
  
  -- Se não tem prazo definido, retorna null
  IF p_resposta_esperada_ate IS NULL THEN
    RETURN NULL;
  END IF;
  
  v_agora := NOW();
  v_horas_restantes := EXTRACT(EPOCH FROM (p_resposta_esperada_ate - v_agora)) / 3600;
  
  -- Prazo vencido
  IF v_horas_restantes < 0 THEN
    RETURN 'vencido';
  END IF;
  
  -- Prazo próximo (menos de 24 horas)
  IF v_horas_restantes <= 24 THEN
    RETURN 'proximo';
  END IF;
  
  -- Dentro do prazo
  RETURN 'dentro_prazo';
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Função para atualizar indicador de risco na licitação
CREATE OR REPLACE FUNCTION public.atualizar_risco_licitacao()
RETURNS TRIGGER AS $$
BEGIN
  -- Atualizar o campo tem_mensagem_critica_pendente na licitação
  UPDATE public.licitacoes
  SET tem_mensagem_critica_pendente = EXISTS (
    SELECT 1 FROM public.licitacoes_atividades
    WHERE licitacao_id = COALESCE(NEW.licitacao_id, OLD.licitacao_id)
    AND is_critico = true
    AND respondido_em IS NULL
    AND resposta_esperada_ate IS NOT NULL
  )
  WHERE id = COALESCE(NEW.licitacao_id, OLD.licitacao_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Trigger para manter o indicador de risco atualizado
DROP TRIGGER IF EXISTS trigger_atualizar_risco_licitacao ON public.licitacoes_atividades;
DROP TRIGGER IF EXISTS "trigger_atualizar_risco_licitacao" ON public.licitacoes_atividades;
CREATE TRIGGER trigger_atualizar_risco_licitacao
AFTER INSERT OR UPDATE OR DELETE ON public.licitacoes_atividades
FOR EACH ROW
EXECUTE FUNCTION public.atualizar_risco_licitacao();

-- Tabela para configuração de notificações de prazo
CREATE TABLE IF NOT EXISTS public.licitacoes_notificacoes_prazo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  atividade_id UUID NOT NULL REFERENCES public.licitacoes_atividades(id) ON DELETE CASCADE,
  tipo_notificacao TEXT NOT NULL CHECK (tipo_notificacao IN ('prazo_proximo', 'prazo_vencido')),
  notificado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS na nova tabela
ALTER TABLE public.licitacoes_notificacoes_prazo ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar notificações de prazo" ON public.licitacoes_notificacoes_prazo;
CREATE POLICY "Usuários autenticados podem visualizar notificações de prazo"
ON public.licitacoes_notificacoes_prazo
FOR SELECT
USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Sistema pode inserir notificações de prazo" ON public.licitacoes_notificacoes_prazo;
CREATE POLICY "Sistema pode inserir notificações de prazo"
ON public.licitacoes_notificacoes_prazo
FOR INSERT
WITH CHECK (true);

-- Índice para evitar notificações duplicadas
CREATE UNIQUE INDEX IF NOT EXISTS idx_licitacoes_notificacoes_prazo_unique 
ON public.licitacoes_notificacoes_prazo(atividade_id, tipo_notificacao);

-- Habilitar realtime para atividades (se ainda não estiver)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'licitacoes_atividades'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.licitacoes_atividades;
  END IF;
END $$;

-- === 20260123170048_e2f05bd5-9b89-44a7-b926-b1efb83588d6.sql ===
-- Add new status 'suspenso_revogado' to the status_licitacao enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'status_licitacao'
      AND e.enumlabel = 'suspenso_revogado'
  ) THEN
    ALTER TYPE public.status_licitacao ADD VALUE 'suspenso_revogado' AFTER 'descarte_edital';
  END IF;
END $$;

-- === 20260123175102_9b5b9518-3fad-44c1-aadd-518f438f1515.sql ===
-- Adicionar coluna para múltiplas unidades nos contratos AGES
-- Mantém a coluna ages_unidade_id existente para retrocompatibilidade e migração
ALTER TABLE public.ages_contratos 
ADD COLUMN IF NOT EXISTS ages_unidades_ids UUID[] DEFAULT '{}';

-- Migrar dados existentes: copiar ages_unidade_id para o array ages_unidades_ids
UPDATE public.ages_contratos 
SET ages_unidades_ids = ARRAY[ages_unidade_id]
WHERE ages_unidade_id IS NOT NULL 
  AND (ages_unidades_ids IS NULL OR ages_unidades_ids = '{}');

-- Comentário explicativo
COMMENT ON COLUMN public.ages_contratos.ages_unidades_ids IS 'Array de IDs das unidades vinculadas ao contrato (suporta múltiplas unidades)';

-- === 20260123180835_43dec13a-8673-4b13-86b6-01bebb3b505a.sql ===
-- Adicionar política para permitir que usuários autenticados leiam a URL do webhook de email
DROP POLICY IF EXISTS "Authenticated users can read email webhook url" ON public.supabase_config;
CREATE POLICY "Authenticated users can read email webhook url"
ON public.supabase_config
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND chave = 'email_webhook_url'
);

-- === 20260123191531_7e66790a-d208-41a2-866f-7b5282e904c6.sql ===
-- Adicionar coluna de chave composta única para anti-duplicação
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS chave_unica TEXT;

-- Criar função para gerar chave única
CREATE OR REPLACE FUNCTION public.generate_lead_chave_unica()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Gera chave apenas se nome e data_nascimento estão preenchidos
  IF NEW.nome IS NOT NULL AND NEW.data_nascimento IS NOT NULL THEN
    NEW.chave_unica := LOWER(TRIM(NEW.nome)) || '_' || NEW.data_nascimento;
  ELSE
    NEW.chave_unica := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- Criar trigger para INSERT e UPDATE
DROP TRIGGER IF EXISTS trigger_lead_chave_unica ON public.leads;
DROP TRIGGER IF EXISTS "trigger_lead_chave_unica" ON public.leads;
CREATE TRIGGER trigger_lead_chave_unica
BEFORE INSERT OR UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.generate_lead_chave_unica();

-- Atualizar registros existentes (duplicados já removidos)
UPDATE public.leads
SET chave_unica = LOWER(TRIM(nome)) || '_' || data_nascimento
WHERE nome IS NOT NULL AND data_nascimento IS NOT NULL;

-- Criar índice único na chave composta
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_chave_unica 
ON public.leads (chave_unica) 
WHERE chave_unica IS NOT NULL;

-- Comentário para documentação
COMMENT ON COLUMN public.leads.chave_unica IS 'Chave composta única: nome_lowercase + data_nascimento para identificação anti-duplicação';

-- === 20260127142650_97a88449-f6f9-4456-a7cc-8c665c5648d0.sql ===
-- Drop the existing policy
DROP POLICY IF EXISTS "Captação leaders can update user sectors" ON public.profiles;

-- Create a more permissive policy for captação management
-- Allows admin, gestor_captacao, or captação leaders to update setor_id
DROP POLICY IF EXISTS "Captação managers can update user sectors" ON public.profiles;
CREATE POLICY "Captação managers can update user sectors"
ON public.profiles
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR is_captacao_leader(auth.uid())
)
WITH CHECK (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR is_captacao_leader(auth.uid())
);

-- === 20260127143410_a8a47710-d09c-49a1-ad9b-3c7cf21e5d79.sql ===
-- Drop existing UPDATE policies on profiles
DROP POLICY IF EXISTS "Captação managers can update user sectors" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users or admins can update profiles" ON public.profiles;

-- Create a single consolidated UPDATE policy
DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
CREATE POLICY "Profiles update policy"
ON public.profiles
FOR UPDATE
USING (
  -- User can update their own profile
  auth.uid() = id
  -- OR admin can update any profile
  OR is_admin(auth.uid())
  -- OR gestor_captacao can update any profile (for adding captadores)
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  -- OR captação leader can update any profile (for adding captadores)
  OR is_captacao_leader(auth.uid())
)
WITH CHECK (
  auth.uid() = id
  OR is_admin(auth.uid())
  OR has_role(auth.uid(), 'gestor_captacao'::app_role)
  OR is_captacao_leader(auth.uid())
);

-- === 20260127182444_d4868a95-a4b3-4092-b1e1-f1442e6cd592.sql ===
-- Drop existing policies for comunicacao tables
DROP POLICY IF EXISTS "Participantes podem ver canais" ON public.comunicacao_canais;
DROP POLICY IF EXISTS "Usuários autenticados podem criar canais" ON public.comunicacao_canais;
DROP POLICY IF EXISTS "Criadores podem atualizar canais" ON public.comunicacao_canais;
DROP POLICY IF EXISTS "Criadores podem deletar canais" ON public.comunicacao_canais;

DROP POLICY IF EXISTS "Participantes podem ver mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Participantes podem enviar mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Autores podem editar mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Autores podem deletar mensagens" ON public.comunicacao_mensagens;

DROP POLICY IF EXISTS "Usuários podem ver participantes" ON public.comunicacao_participantes;
DROP POLICY IF EXISTS "Participantes podem ser adicionados" ON public.comunicacao_participantes;
DROP POLICY IF EXISTS "Participantes podem sair" ON public.comunicacao_participantes;

DROP POLICY IF EXISTS "Usuários podem ver notificações" ON public.comunicacao_notificacoes;
DROP POLICY IF EXISTS "Sistema pode criar notificações" ON public.comunicacao_notificacoes;
DROP POLICY IF EXISTS "Usuários podem atualizar notificações" ON public.comunicacao_notificacoes;

-- Canais: Admins veem todos, outros veem apenas onde são participantes
DROP POLICY IF EXISTS "Admins ou participantes podem ver canais" ON public.comunicacao_canais;
CREATE POLICY "Admins ou participantes podem ver canais"
ON public.comunicacao_canais FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), id)
);

DROP POLICY IF EXISTS "Usuários autenticados podem criar canais" ON public.comunicacao_canais;
CREATE POLICY "Usuários autenticados podem criar canais"
ON public.comunicacao_canais FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins ou criadores podem atualizar canais" ON public.comunicacao_canais;
CREATE POLICY "Admins ou criadores podem atualizar canais"
ON public.comunicacao_canais FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  OR criado_por = auth.uid()
);

DROP POLICY IF EXISTS "Admins ou criadores podem deletar canais" ON public.comunicacao_canais;
CREATE POLICY "Admins ou criadores podem deletar canais"
ON public.comunicacao_canais FOR DELETE
USING (
  public.is_admin(auth.uid()) 
  OR criado_por = auth.uid()
);

-- Mensagens: Admins veem todas, outros veem apenas de canais onde são participantes
DROP POLICY IF EXISTS "Admins ou participantes podem ver mensagens" ON public.comunicacao_mensagens;
CREATE POLICY "Admins ou participantes podem ver mensagens"
ON public.comunicacao_mensagens FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

DROP POLICY IF EXISTS "Admins ou participantes podem enviar mensagens" ON public.comunicacao_mensagens;
CREATE POLICY "Admins ou participantes podem enviar mensagens"
ON public.comunicacao_mensagens FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

DROP POLICY IF EXISTS "Admins ou autores podem editar mensagens" ON public.comunicacao_mensagens;
CREATE POLICY "Admins ou autores podem editar mensagens"
ON public.comunicacao_mensagens FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Admins ou autores podem deletar mensagens" ON public.comunicacao_mensagens;
CREATE POLICY "Admins ou autores podem deletar mensagens"
ON public.comunicacao_mensagens FOR DELETE
USING (
  public.is_admin(auth.uid()) 
  OR user_id = auth.uid()
);

-- Participantes: Admins veem todos, outros veem apenas de canais onde são participantes
DROP POLICY IF EXISTS "Admins ou participantes podem ver participantes" ON public.comunicacao_participantes;
CREATE POLICY "Admins ou participantes podem ver participantes"
ON public.comunicacao_participantes FOR SELECT
USING (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

DROP POLICY IF EXISTS "Admins ou participantes podem adicionar" ON public.comunicacao_participantes;
CREATE POLICY "Admins ou participantes podem adicionar"
ON public.comunicacao_participantes FOR INSERT
WITH CHECK (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);