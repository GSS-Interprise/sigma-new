
-- Create leads_bloqueio_temporario table
CREATE TABLE public.leads_bloqueio_temporario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  removed_by UUID
);

-- Enable RLS
ALTER TABLE public.leads_bloqueio_temporario ENABLE ROW LEVEL SECURITY;

-- Indexes for fast lookup
CREATE INDEX idx_leads_bloqueio_lead_id ON public.leads_bloqueio_temporario(lead_id);
CREATE INDEX idx_leads_bloqueio_active ON public.leads_bloqueio_temporario(lead_id) WHERE removed_at IS NULL;

-- SELECT: all authenticated users
CREATE POLICY "Authenticated can view bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: authenticated users (must set their own created_by)
CREATE POLICY "Authenticated can insert bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- UPDATE (unblocking - setting removed_at): all authenticated users
CREATE POLICY "Authenticated can update bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE: only admin / gestor_captacao
CREATE POLICY "Admins can delete bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_captacao')
  );
