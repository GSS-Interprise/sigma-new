
-- =============================================
-- SIGZAP - MODELAGEM COMPLETA PARA EVOLUTION API
-- =============================================

-- 1. Tabela de Instâncias WhatsApp
CREATE TABLE IF NOT EXISTS public.sigzap_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  instance_uuid TEXT UNIQUE,
  phone_number TEXT,
  status TEXT DEFAULT 'disconnected', -- connected, disconnected, connecting
  profile_name TEXT,
  profile_picture_url TEXT,
  chip_id UUID REFERENCES public.chips(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. Tabela de Contatos
CREATE TABLE IF NOT EXISTS public.sigzap_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_jid TEXT NOT NULL, -- ex: 5511999999999@s.whatsapp.net
  contact_phone TEXT NOT NULL,
  contact_name TEXT,
  profile_picture_url TEXT,
  instance_id UUID REFERENCES public.sigzap_instances(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(contact_jid, instance_id)
);

-- 3. Tabela de Conversas
CREATE TABLE IF NOT EXISTS public.sigzap_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES public.sigzap_contacts(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES public.sigzap_instances(id) ON DELETE CASCADE,
  last_message_text TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  unread_count INTEGER DEFAULT 0,
  assigned_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'open', -- open, in_progress, closed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(contact_id, instance_id)
);

-- 4. Tabela de Mensagens
CREATE TABLE IF NOT EXISTS public.sigzap_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.sigzap_conversations(id) ON DELETE CASCADE,
  wa_message_id TEXT,
  from_me BOOLEAN DEFAULT false,
  sender_jid TEXT,
  message_text TEXT,
  message_type TEXT DEFAULT 'text', -- text, image, video, audio, document, sticker, location, contact, unknown
  message_status TEXT, -- pending, sent, delivered, read, failed
  raw_payload JSONB,
  media_storage_path TEXT,
  media_mime_type TEXT,
  media_caption TEXT,
  media_filename TEXT,
  media_url TEXT,
  quoted_message_id TEXT,
  quoted_message_text TEXT,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. Tabela de Eventos (logs gerais da Evolution)
CREATE TABLE IF NOT EXISTS public.sigzap_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID REFERENCES public.sigzap_instances(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sigzap_contacts_instance ON public.sigzap_contacts(instance_id);
CREATE INDEX IF NOT EXISTS idx_sigzap_contacts_jid ON public.sigzap_contacts(contact_jid);
CREATE INDEX IF NOT EXISTS idx_sigzap_conversations_instance ON public.sigzap_conversations(instance_id);
CREATE INDEX IF NOT EXISTS idx_sigzap_conversations_assigned ON public.sigzap_conversations(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_sigzap_conversations_status ON public.sigzap_conversations(status);
CREATE INDEX IF NOT EXISTS idx_sigzap_messages_conversation ON public.sigzap_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sigzap_messages_sent_at ON public.sigzap_messages(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_sigzap_messages_wa_id ON public.sigzap_messages(wa_message_id);

-- Triggers para updated_at
CREATE OR REPLACE FUNCTION public.update_sigzap_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_sigzap_instances_updated_at
  BEFORE UPDATE ON public.sigzap_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_sigzap_updated_at();

CREATE TRIGGER update_sigzap_contacts_updated_at
  BEFORE UPDATE ON public.sigzap_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_sigzap_updated_at();

CREATE TRIGGER update_sigzap_conversations_updated_at
  BEFORE UPDATE ON public.sigzap_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_sigzap_updated_at();

-- RLS Policies
ALTER TABLE public.sigzap_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sigzap_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sigzap_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sigzap_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sigzap_events ENABLE ROW LEVEL SECURITY;

-- Políticas para sigzap_instances
CREATE POLICY "Usuários autenticados podem visualizar instâncias"
  ON public.sigzap_instances FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins podem gerenciar instâncias"
  ON public.sigzap_instances FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

-- Políticas para sigzap_contacts
CREATE POLICY "Usuários autenticados podem visualizar contatos"
  ON public.sigzap_contacts FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Sistema pode gerenciar contatos"
  ON public.sigzap_contacts FOR ALL
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

-- Políticas para sigzap_conversations
CREATE POLICY "Usuários autenticados podem visualizar conversas"
  ON public.sigzap_conversations FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem atualizar conversas"
  ON public.sigzap_conversations FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Sistema pode inserir conversas"
  ON public.sigzap_conversations FOR INSERT
  WITH CHECK (true);

-- Políticas para sigzap_messages
CREATE POLICY "Usuários autenticados podem visualizar mensagens"
  ON public.sigzap_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem inserir mensagens"
  ON public.sigzap_messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Sistema pode inserir mensagens"
  ON public.sigzap_messages FOR INSERT
  WITH CHECK (true);

-- Políticas para sigzap_events
CREATE POLICY "Admins podem visualizar eventos"
  ON public.sigzap_events FOR SELECT
  USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'));

CREATE POLICY "Sistema pode inserir eventos"
  ON public.sigzap_events FOR INSERT
  WITH CHECK (true);

-- Habilitar Realtime para as tabelas principais
ALTER PUBLICATION supabase_realtime ADD TABLE public.sigzap_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sigzap_messages;

-- Storage bucket para mídia
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'sigzap-media',
  'sigzap-media',
  false,
  52428800, -- 50MB
  ARRAY['image/*', 'video/*', 'audio/*', 'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
) ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para sigzap-media
CREATE POLICY "Usuários autenticados podem visualizar mídia sigzap"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'sigzap-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Sistema pode inserir mídia sigzap"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'sigzap-media');

CREATE POLICY "Admins podem gerenciar mídia sigzap"
  ON storage.objects FOR ALL
  USING (bucket_id = 'sigzap-media' AND (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao')));

-- Migrar dados existentes de chips para sigzap_instances
INSERT INTO public.sigzap_instances (name, instance_uuid, phone_number, status, profile_name, profile_picture_url, chip_id)
SELECT 
  nome,
  instance_id,
  numero,
  CASE WHEN connection_state = 'open' THEN 'connected' ELSE 'disconnected' END,
  profile_name,
  profile_picture_url,
  id
FROM public.chips
WHERE instance_id IS NOT NULL
ON CONFLICT DO NOTHING;
