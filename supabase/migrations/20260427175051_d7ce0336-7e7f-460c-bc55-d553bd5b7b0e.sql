
-- Permitir que usuários com permissão de disparos (zap ou email) também possam criar/editar listas
DROP POLICY IF EXISTS "Criador, admin ou líder captação podem inserir listas" ON public.disparo_listas;
DROP POLICY IF EXISTS "Criador, admin ou líder captação podem atualizar listas" ON public.disparo_listas;
DROP POLICY IF EXISTS "Criador, admin ou líder captação podem deletar listas" ON public.disparo_listas;
DROP POLICY IF EXISTS "Criador da lista, admin ou líder podem inserir itens" ON public.disparo_lista_itens;
DROP POLICY IF EXISTS "Criador da lista, admin ou líder podem deletar itens" ON public.disparo_lista_itens;

CREATE OR REPLACE FUNCTION public.has_disparo_permission(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.captacao_permissoes_usuario
    WHERE user_id = _user_id
      AND (pode_disparos_zap = true OR pode_disparos_email = true)
  );
$$;

CREATE POLICY "Inserir listas: criador, admin, líder ou com permissão disparo"
ON public.disparo_listas FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_captacao_leader(auth.uid())
  OR has_disparo_permission(auth.uid())
);

CREATE POLICY "Atualizar listas: criador, admin, líder ou com permissão disparo"
ON public.disparo_listas FOR UPDATE TO authenticated
USING (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_captacao_leader(auth.uid())
  OR has_disparo_permission(auth.uid())
);

CREATE POLICY "Deletar listas: criador, admin ou líder"
ON public.disparo_listas FOR DELETE TO authenticated
USING (
  auth.uid() = created_by
  OR is_admin(auth.uid())
  OR is_captacao_leader(auth.uid())
);

CREATE POLICY "Inserir itens: criador, admin, líder ou com permissão disparo"
ON public.disparo_lista_itens FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.disparo_listas l
    WHERE l.id = disparo_lista_itens.lista_id
      AND (
        l.created_by = auth.uid()
        OR is_admin(auth.uid())
        OR is_captacao_leader(auth.uid())
        OR has_disparo_permission(auth.uid())
      )
  )
);

CREATE POLICY "Deletar itens: criador, admin, líder ou com permissão disparo"
ON public.disparo_lista_itens FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.disparo_listas l
    WHERE l.id = disparo_lista_itens.lista_id
      AND (
        l.created_by = auth.uid()
        OR is_admin(auth.uid())
        OR is_captacao_leader(auth.uid())
        OR has_disparo_permission(auth.uid())
      )
  )
);
