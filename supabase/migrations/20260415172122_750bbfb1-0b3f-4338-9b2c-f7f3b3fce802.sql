
CREATE TABLE public.sigma_email_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  modulo TEXT NOT NULL,
  referencia_id TEXT,
  destinatario_nome TEXT,
  destinatario_email TEXT NOT NULL,
  assunto TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'enviado',
  erro TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  enviado_por_id UUID,
  enviado_por_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sigma_email_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem ver todos os emails"
  ON public.sigma_email_log
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Edge functions podem inserir emails"
  ON public.sigma_email_log
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_sigma_email_log_modulo ON public.sigma_email_log(modulo);
CREATE INDEX idx_sigma_email_log_created_at ON public.sigma_email_log(created_at DESC);
CREATE INDEX idx_sigma_email_log_status ON public.sigma_email_log(status);
