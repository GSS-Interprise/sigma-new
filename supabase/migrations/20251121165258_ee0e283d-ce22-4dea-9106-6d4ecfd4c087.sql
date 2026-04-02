-- Função para verificar se usuário é líder de um setor específico
CREATE OR REPLACE FUNCTION public.is_setor_leader(_user_id uuid, _setor_id uuid)
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
    WHERE ur.user_id = _user_id
      AND ur.role = 'lideres'
      AND p.setor_id = _setor_id
  )
$$;

-- Função para obter o setor_id do usuário
CREATE OR REPLACE FUNCTION public.get_user_setor(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT setor_id FROM public.profiles WHERE id = _user_id
$$;

-- Função para verificar se usuário é líder (qualquer setor)
CREATE OR REPLACE FUNCTION public.is_leader(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'lideres')
$$;