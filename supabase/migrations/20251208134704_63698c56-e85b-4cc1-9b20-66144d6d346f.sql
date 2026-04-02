-- Create table for medico kanban card attachments
CREATE TABLE public.medico_kanban_card_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  card_id UUID NOT NULL REFERENCES public.medico_kanban_cards(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID,
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.medico_kanban_card_anexos ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Authenticated users can view card attachments"
ON public.medico_kanban_card_anexos
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert card attachments"
ON public.medico_kanban_card_anexos
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can delete card attachments"
ON public.medico_kanban_card_anexos
FOR DELETE
TO authenticated
USING (true);

-- Create storage bucket for kanban card attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('medico-kanban-anexos', 'medico-kanban-anexos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Anyone can view medico kanban attachments"
ON storage.objects FOR SELECT
USING (bucket_id = 'medico-kanban-anexos');

CREATE POLICY "Authenticated users can upload medico kanban attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'medico-kanban-anexos');

CREATE POLICY "Authenticated users can delete medico kanban attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'medico-kanban-anexos');