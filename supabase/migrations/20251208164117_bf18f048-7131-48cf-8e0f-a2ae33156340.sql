-- Create table for captação-specific user permissions
CREATE TABLE public.captacao_permissoes_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pode_disparos_email BOOLEAN NOT NULL DEFAULT false,
  pode_disparos_zap BOOLEAN NOT NULL DEFAULT false,
  pode_acompanhamento BOOLEAN NOT NULL DEFAULT false,
  pode_leads BOOLEAN NOT NULL DEFAULT false,
  pode_blacklist BOOLEAN NOT NULL DEFAULT false,
  pode_seigzaps_config BOOLEAN NOT NULL DEFAULT false,
  pode_contratos_servicos BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.captacao_permissoes_usuario ENABLE ROW LEVEL SECURITY;

-- Function to check if user is leader of captação sector
CREATE OR REPLACE FUNCTION public.is_captacao_leader(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    JOIN public.setores s ON s.id = p.setor_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'lideres'
      AND LOWER(s.nome) LIKE '%capta%'
  )
$$;

-- Function to check if user has specific captação permission
CREATE OR REPLACE FUNCTION public.has_captacao_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- Admins and captação leaders have all permissions
    WHEN is_admin(_user_id) OR is_captacao_leader(_user_id) OR has_role(_user_id, 'gestor_captacao') THEN true
    -- Check specific permission
    ELSE (
      SELECT CASE _permission
        WHEN 'disparos_email' THEN COALESCE(pode_disparos_email, false)
        WHEN 'disparos_zap' THEN COALESCE(pode_disparos_zap, false)
        WHEN 'acompanhamento' THEN COALESCE(pode_acompanhamento, false)
        WHEN 'leads' THEN COALESCE(pode_leads, false)
        WHEN 'blacklist' THEN COALESCE(pode_blacklist, false)
        WHEN 'seigzaps_config' THEN COALESCE(pode_seigzaps_config, false)
        WHEN 'contratos_servicos' THEN COALESCE(pode_contratos_servicos, false)
        ELSE false
      END
      FROM public.captacao_permissoes_usuario
      WHERE user_id = _user_id
    )
  END;
$$;

-- RLS Policies
-- Leaders can view all captação permissions
CREATE POLICY "Leaders can view captação permissions"
ON public.captacao_permissoes_usuario
FOR SELECT
USING (
  is_admin(auth.uid()) OR 
  is_captacao_leader(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao')
);

-- Leaders can insert captação permissions
CREATE POLICY "Leaders can insert captação permissions"
ON public.captacao_permissoes_usuario
FOR INSERT
WITH CHECK (
  is_admin(auth.uid()) OR 
  is_captacao_leader(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao')
);

-- Leaders can update captação permissions
CREATE POLICY "Leaders can update captação permissions"
ON public.captacao_permissoes_usuario
FOR UPDATE
USING (
  is_admin(auth.uid()) OR 
  is_captacao_leader(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao')
);

-- Leaders can delete captação permissions
CREATE POLICY "Leaders can delete captação permissions"
ON public.captacao_permissoes_usuario
FOR DELETE
USING (
  is_admin(auth.uid()) OR 
  is_captacao_leader(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao')
);

-- Users can view their own permissions
CREATE POLICY "Users can view own captação permissions"
ON public.captacao_permissoes_usuario
FOR SELECT
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_captacao_permissoes_updated_at
BEFORE UPDATE ON public.captacao_permissoes_usuario
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();