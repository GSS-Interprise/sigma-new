-- Criar tabela de canais de comunicação
CREATE TABLE public.comunicacao_canais (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  tipo TEXT NOT NULL DEFAULT 'grupo', -- 'grupo', 'direto'
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de participantes dos canais
CREATE TABLE public.comunicacao_participantes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  canal_id UUID NOT NULL REFERENCES public.comunicacao_canais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ultima_leitura TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(canal_id, user_id)
);

-- Criar tabela de mensagens
CREATE TABLE public.comunicacao_mensagens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  canal_id UUID NOT NULL REFERENCES public.comunicacao_canais(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  user_nome TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  anexos TEXT[],
  data_envio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Criar tabela de status de leitura das mensagens
CREATE TABLE public.comunicacao_leituras (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mensagem_id UUID NOT NULL REFERENCES public.comunicacao_mensagens(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  data_leitura TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(mensagem_id, user_id)
);

-- Criar tabela de notificações
CREATE TABLE public.comunicacao_notificacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  canal_id UUID NOT NULL REFERENCES public.comunicacao_canais(id) ON DELETE CASCADE,
  mensagem_id UUID NOT NULL REFERENCES public.comunicacao_mensagens(id) ON DELETE CASCADE,
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.comunicacao_canais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_participantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_leituras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comunicacao_notificacoes ENABLE ROW LEVEL SECURITY;

-- RLS Policies para canais
CREATE POLICY "Users can view channels they participate in"
  ON public.comunicacao_canais FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comunicacao_participantes
      WHERE canal_id = comunicacao_canais.id AND user_id = auth.uid()
    ) OR criado_por = auth.uid()
  );

CREATE POLICY "Users can create channels"
  ON public.comunicacao_canais FOR INSERT
  WITH CHECK (auth.uid() = criado_por);

CREATE POLICY "Channel creators can update their channels"
  ON public.comunicacao_canais FOR UPDATE
  USING (auth.uid() = criado_por);

-- RLS Policies para participantes
CREATE POLICY "Users can view participants in their channels"
  ON public.comunicacao_participantes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comunicacao_participantes cp2
      WHERE cp2.canal_id = comunicacao_participantes.canal_id 
      AND cp2.user_id = auth.uid()
    )
  );

CREATE POLICY "Channel creators can add participants"
  ON public.comunicacao_participantes FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.comunicacao_canais
      WHERE id = canal_id AND criado_por = auth.uid()
    )
  );

CREATE POLICY "Users can update their own participation"
  ON public.comunicacao_participantes FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS Policies para mensagens
CREATE POLICY "Users can view messages in their channels"
  ON public.comunicacao_mensagens FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comunicacao_participantes
      WHERE canal_id = comunicacao_mensagens.canal_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Participants can send messages"
  ON public.comunicacao_mensagens FOR INSERT
  WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.comunicacao_participantes
      WHERE canal_id = comunicacao_mensagens.canal_id AND user_id = auth.uid()
    )
  );

-- RLS Policies para leituras
CREATE POLICY "Users can view message read status in their channels"
  ON public.comunicacao_leituras FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comunicacao_mensagens m
      JOIN public.comunicacao_participantes p ON p.canal_id = m.canal_id
      WHERE m.id = comunicacao_leituras.mensagem_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can mark messages as read"
  ON public.comunicacao_leituras FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS Policies para notificações
CREATE POLICY "Users can view their own notifications"
  ON public.comunicacao_notificacoes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can create notifications"
  ON public.comunicacao_notificacoes FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON public.comunicacao_notificacoes FOR UPDATE
  USING (auth.uid() = user_id);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_comunicacao_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_comunicacao_canais_updated_at
  BEFORE UPDATE ON public.comunicacao_canais
  FOR EACH ROW EXECUTE FUNCTION public.update_comunicacao_updated_at();

CREATE TRIGGER update_comunicacao_mensagens_updated_at
  BEFORE UPDATE ON public.comunicacao_mensagens
  FOR EACH ROW EXECUTE FUNCTION public.update_comunicacao_updated_at();

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_mensagens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_notificacoes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.comunicacao_leituras;

-- Create storage bucket for message attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('comunicacao-anexos', 'comunicacao-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for comunicacao-anexos
CREATE POLICY "Users can upload attachments to their channels"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'comunicacao-anexos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view attachments in their channels"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'comunicacao-anexos');

CREATE POLICY "Users can delete their own attachments"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'comunicacao-anexos' AND
    auth.uid()::text = (storage.foldername(name))[1]
  );