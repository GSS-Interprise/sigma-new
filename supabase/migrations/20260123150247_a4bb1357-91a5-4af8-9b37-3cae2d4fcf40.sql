-- Adicionar campos de rastreamento de resposta na tabela licitacoes_atividades
ALTER TABLE public.licitacoes_atividades 
ADD COLUMN resposta_esperada_ate TIMESTAMP WITH TIME ZONE,
ADD COLUMN responsavel_resposta_id UUID REFERENCES auth.users(id),
ADD COLUMN setor_responsavel TEXT,
ADD COLUMN respondido_em TIMESTAMP WITH TIME ZONE,
ADD COLUMN respondido_por UUID REFERENCES auth.users(id),
ADD COLUMN is_critico BOOLEAN DEFAULT false;

-- Criar índice para consultas de mensagens pendentes
CREATE INDEX idx_licitacoes_atividades_resposta_pendente 
ON public.licitacoes_atividades(resposta_esperada_ate) 
WHERE resposta_esperada_ate IS NOT NULL AND respondido_em IS NULL;

-- Criar índice para mensagens críticas
CREATE INDEX idx_licitacoes_atividades_criticas 
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
CREATE POLICY "Usuários autenticados podem visualizar notificações de prazo"
ON public.licitacoes_notificacoes_prazo
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Sistema pode inserir notificações de prazo"
ON public.licitacoes_notificacoes_prazo
FOR INSERT
WITH CHECK (true);

-- Índice para evitar notificações duplicadas
CREATE UNIQUE INDEX idx_licitacoes_notificacoes_prazo_unique 
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