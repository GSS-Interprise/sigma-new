-- 1. Criar ENUM para tipo de disparo
CREATE TYPE tipo_disparo_enum AS ENUM ('zap', 'email', 'outros');

-- 2. Adicionar coluna tipo_disparo na tabela proposta
ALTER TABLE public.proposta 
ADD COLUMN tipo_disparo tipo_disparo_enum NOT NULL DEFAULT 'zap';

-- 3. Migração: todas as propostas existentes recebem 'zap'
UPDATE public.proposta SET tipo_disparo = 'zap' WHERE tipo_disparo IS NULL;

-- 4. Criar tabela de interações de email (chat simplificado)
CREATE TABLE public.email_interacoes (
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
CREATE INDEX idx_email_interacoes_proposta ON public.email_interacoes(proposta_id);
CREATE INDEX idx_email_interacoes_lead ON public.email_interacoes(lead_id);
CREATE INDEX idx_email_interacoes_email ON public.email_interacoes(email_destino);
CREATE INDEX idx_email_interacoes_created ON public.email_interacoes(created_at DESC);

-- 6. Trigger para updated_at
CREATE TRIGGER update_email_interacoes_updated_at
BEFORE UPDATE ON public.email_interacoes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Enable RLS
ALTER TABLE public.email_interacoes ENABLE ROW LEVEL SECURITY;

-- 8. Políticas de acesso
CREATE POLICY "Usuários autenticados podem ver interações" 
ON public.email_interacoes 
FOR SELECT 
TO authenticated 
USING (true);

CREATE POLICY "Usuários autenticados podem inserir interações" 
ON public.email_interacoes 
FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar interações" 
ON public.email_interacoes 
FOR UPDATE 
TO authenticated 
USING (true);

-- 9. Enable realtime para interações
ALTER PUBLICATION supabase_realtime ADD TABLE public.email_interacoes;

-- 10. Adicionar coluna status_email na proposta para tracking
ALTER TABLE public.proposta 
ADD COLUMN status_email TEXT DEFAULT 'aguardando_envio' CHECK (status_email IN ('aguardando_envio', 'enviado', 'entregue', 'respondido', 'falha'));

-- 11. Adicionar timestamp de último envio
ALTER TABLE public.proposta 
ADD COLUMN ultimo_envio_email TIMESTAMPTZ;