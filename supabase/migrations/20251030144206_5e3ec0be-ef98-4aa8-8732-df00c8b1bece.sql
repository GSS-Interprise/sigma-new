-- Criar tabela de atividades/comentários das licitações
CREATE TABLE public.licitacoes_atividades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('comentario', 'status_alterado', 'campo_atualizado', 'anexo_adicionado')),
  descricao TEXT NOT NULL,
  campo_alterado TEXT,
  valor_antigo TEXT,
  valor_novo TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.licitacoes_atividades ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários autenticados podem visualizar atividades"
ON public.licitacoes_atividades
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem criar atividades"
ON public.licitacoes_atividades
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Criar índice para melhor performance
CREATE INDEX idx_licitacoes_atividades_licitacao_id ON public.licitacoes_atividades(licitacao_id);
CREATE INDEX idx_licitacoes_atividades_created_at ON public.licitacoes_atividades(created_at DESC);