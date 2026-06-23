DROP POLICY IF EXISTS "Admin ou autor pode editar/apagar mensagens" ON public.comunicacao_mensagens;
DROP POLICY IF EXISTS "Admins ou autores podem deletar mensagens" ON public.comunicacao_mensagens;

CREATE POLICY "Editar/apagar: admin global, autor ou criador do canal"
ON public.comunicacao_mensagens
FOR UPDATE
TO authenticated
USING (
  is_admin(auth.uid())
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.comunicacao_canais c
    WHERE c.id = comunicacao_mensagens.canal_id
      AND c.criado_por = auth.uid()
  )
)
WITH CHECK (
  is_admin(auth.uid())
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.comunicacao_canais c
    WHERE c.id = comunicacao_mensagens.canal_id
      AND c.criado_por = auth.uid()
  )
);

CREATE POLICY "Delete: admin global, autor ou criador do canal"
ON public.comunicacao_mensagens
FOR DELETE
TO authenticated
USING (
  is_admin(auth.uid())
  OR user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.comunicacao_canais c
    WHERE c.id = comunicacao_mensagens.canal_id
      AND c.criado_por = auth.uid()
  )
);