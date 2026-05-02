-- Helper function: verifica se o usuário logado está ativo
CREATE OR REPLACE FUNCTION public.current_user_is_active()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT status = 'ativo' FROM public.profiles WHERE id = auth.uid()),
    false
  )
$$;

-- Garantir que o usuário consiga ler o próprio profile (mesmo suspenso)
-- para o front exibir a tela "acesso suspenso"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='profiles'
      AND policyname='Users can read own profile always'
  ) THEN
    CREATE POLICY "Users can read own profile always"
      ON public.profiles
      FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;