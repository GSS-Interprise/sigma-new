-- Criar tabela de anotações gerais para o módulo de disparos
CREATE TABLE IF NOT EXISTS public.disparos_anotacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  texto_anotacao TEXT NOT NULL,
  data_hora TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  usuario_nome TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Criar índices para melhor performance nas consultas
CREATE INDEX IF NOT EXISTS idx_disparos_anotacoes_cliente_id ON public.disparos_anotacoes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_disparos_anotacoes_data_hora ON public.disparos_anotacoes(data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_disparos_anotacoes_texto ON public.disparos_anotacoes USING gin(to_tsvector('portuguese', texto_anotacao));

-- Habilitar RLS
ALTER TABLE public.disparos_anotacoes ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários autenticados podem ver anotações"
  ON public.disparos_anotacoes
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem criar anotações"
  ON public.disparos_anotacoes
  FOR INSERT
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem editar suas próprias anotações"
  ON public.disparos_anotacoes
  FOR UPDATE
  USING (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem deletar suas próprias anotações"
  ON public.disparos_anotacoes
  FOR DELETE
  USING (auth.uid() = usuario_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_disparos_anotacoes_updated_at
  BEFORE UPDATE ON public.disparos_anotacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();