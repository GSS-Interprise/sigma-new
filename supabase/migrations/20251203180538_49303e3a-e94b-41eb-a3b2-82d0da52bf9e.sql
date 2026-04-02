-- Create instance_proxy_settings table
CREATE TABLE public.instance_proxy_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.chips(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  host text,
  port integer,
  protocol text DEFAULT 'http',
  username text,
  password text,
  last_sync_status text DEFAULT 'pending',
  last_sync_error text,
  last_sync_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(instance_id)
);

-- Enable RLS
ALTER TABLE public.instance_proxy_settings ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage proxy settings"
ON public.instance_proxy_settings
FOR ALL
USING (is_admin(auth.uid()));

CREATE POLICY "Gestores can view proxy settings"
ON public.instance_proxy_settings
FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role)
);

-- Trigger for updated_at
CREATE TRIGGER update_instance_proxy_settings_updated_at
  BEFORE UPDATE ON public.instance_proxy_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();