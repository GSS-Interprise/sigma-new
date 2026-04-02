
-- Table to track modules in maintenance mode
CREATE TABLE public.modulos_manutencao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modulo_key text NOT NULL UNIQUE,
  motivo text,
  desativado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.modulos_manutencao ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read (to check if module is disabled)
CREATE POLICY "Authenticated users can view maintenance status"
ON public.modulos_manutencao FOR SELECT TO authenticated USING (true);

-- Only admins can insert/delete
CREATE POLICY "Admins can insert maintenance"
ON public.modulos_manutencao FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete maintenance"
ON public.modulos_manutencao FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
