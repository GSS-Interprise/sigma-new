-- Criar tabela de notificações genéricas do sistema
CREATE TABLE public.system_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'kanban_ativo', 'licitacao', 'contrato', etc.
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  link TEXT, -- URL para redirecionar ao clicar
  referencia_id UUID, -- ID do registro relacionado (card, licitação, etc.)
  lida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_system_notifications_user_id ON public.system_notifications(user_id);
CREATE INDEX idx_system_notifications_lida ON public.system_notifications(user_id, lida);
CREATE INDEX idx_system_notifications_tipo ON public.system_notifications(tipo);

-- Enable RLS
ALTER TABLE public.system_notifications ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Users can view their own notifications"
ON public.system_notifications
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
ON public.system_notifications
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "System can insert notifications"
ON public.system_notifications
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can delete their own notifications"
ON public.system_notifications
FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.system_notifications;