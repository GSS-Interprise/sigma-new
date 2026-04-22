
CREATE TABLE IF NOT EXISTS public.campanha_listas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  lista_id UUID NOT NULL REFERENCES public.disparo_listas(id) ON DELETE CASCADE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, lista_id)
);

ALTER TABLE public.campanha_listas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth can view campanha_listas"
  ON public.campanha_listas FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "auth can insert campanha_listas"
  ON public.campanha_listas FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "auth can delete campanha_listas"
  ON public.campanha_listas FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_campanha_listas_campanha ON public.campanha_listas(campanha_id);
