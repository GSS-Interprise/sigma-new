-- Ensure authenticated users have table-level privileges before RLS policies are evaluated
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.disparo_listas TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.disparo_lista_itens TO authenticated;

-- Centralize dispatch-list access for captacao users and permitted users
CREATE OR REPLACE FUNCTION public.can_manage_disparo_listas(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.is_admin(_user_id)
    OR public.is_captacao_leader(_user_id)
    OR public.has_disparo_permission(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = _user_id
        AND ur.role = 'gestor_captacao'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.setores s ON s.id = p.setor_id
      WHERE p.id = _user_id
        AND LOWER(s.nome) LIKE '%capta%'
    );
$$;

DROP POLICY IF EXISTS "Inserir listas: criador, admin, líder ou com permissão dispar" ON public.disparo_listas;
DROP POLICY IF EXISTS "Atualizar listas: criador, admin, líder ou com permissão disp" ON public.disparo_listas;
DROP POLICY IF EXISTS "Inserir itens: criador, admin, líder ou com permissão disparo" ON public.disparo_lista_itens;
DROP POLICY IF EXISTS "Deletar itens: criador, admin, líder ou com permissão disparo" ON public.disparo_lista_itens;

CREATE POLICY "Criar listas de disparo: captacao ou autorizados"
ON public.disparo_listas
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  OR public.can_manage_disparo_listas(auth.uid())
);

CREATE POLICY "Editar listas de disparo: captacao ou autorizados"
ON public.disparo_listas
FOR UPDATE
TO authenticated
USING (
  auth.uid() = created_by
  OR public.can_manage_disparo_listas(auth.uid())
)
WITH CHECK (
  auth.uid() = created_by
  OR public.can_manage_disparo_listas(auth.uid())
);

CREATE POLICY "Adicionar itens em listas: captacao ou autorizados"
ON public.disparo_lista_itens
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.disparo_listas l
    WHERE l.id = disparo_lista_itens.lista_id
      AND (
        l.created_by = auth.uid()
        OR public.can_manage_disparo_listas(auth.uid())
      )
  )
);

CREATE POLICY "Remover itens de listas: captacao ou autorizados"
ON public.disparo_lista_itens
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.disparo_listas l
    WHERE l.id = disparo_lista_itens.lista_id
      AND (
        l.created_by = auth.uid()
        OR public.can_manage_disparo_listas(auth.uid())
      )
  )
);