-- Tabela para configurações do sistema (webhook URLs, etc.)
CREATE TABLE public.supabase_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chave TEXT NOT NULL UNIQUE,
  valor TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.supabase_config ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver/editar configs
CREATE POLICY "Admins can view config" 
  ON public.supabase_config FOR SELECT 
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert config" 
  ON public.supabase_config FOR INSERT 
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update config" 
  ON public.supabase_config FOR UPDATE 
  USING (public.is_admin(auth.uid()));

-- Trigger para updated_at
CREATE TRIGGER update_supabase_config_updated_at
  BEFORE UPDATE ON public.supabase_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();