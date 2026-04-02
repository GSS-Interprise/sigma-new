-- Update RLS to allow admins to update any profile and users to update their own
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users or admins can update profiles"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id OR is_admin(auth.uid()))
WITH CHECK (auth.uid() = id OR is_admin(auth.uid()));

-- Ensure foreign key from profiles.setor_id -> setores.id for nested select and data integrity
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND constraint_type = 'FOREIGN KEY'
      AND constraint_name = 'profiles_setor_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_setor_id_fkey
    FOREIGN KEY (setor_id) REFERENCES public.setores(id) ON DELETE SET NULL;
  END IF;
END $$;