-- Adicionar coluna para soft delete em mensagens
ALTER TABLE public.comunicacao_mensagens 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_comunicacao_mensagens_deleted_at 
ON public.comunicacao_mensagens(deleted_at);

-- Atualizar política de SELECT para filtrar mensagens excluídas
DROP POLICY IF EXISTS "Admins ou participantes podem ver mensagens" ON public.comunicacao_mensagens;

CREATE POLICY "Admins ou participantes podem ver mensagens" 
ON public.comunicacao_mensagens FOR SELECT
USING (
  deleted_at IS NULL
  AND (
    public.is_admin(auth.uid()) 
    OR public.is_channel_participant(auth.uid(), canal_id)
  )
);

-- Política de UPDATE para permitir soft delete
DROP POLICY IF EXISTS "Participantes podem editar suas mensagens" ON public.comunicacao_mensagens;

CREATE POLICY "Participantes podem editar ou deletar mensagens" 
ON public.comunicacao_mensagens FOR UPDATE
USING (
  public.is_admin(auth.uid()) 
  OR (
    public.is_channel_participant(auth.uid(), canal_id)
    AND (user_id = auth.uid() OR public.is_admin(auth.uid()))
  )
)
WITH CHECK (
  public.is_admin(auth.uid()) 
  OR public.is_channel_participant(auth.uid(), canal_id)
);

-- Remover política de DELETE (não será mais usada)
DROP POLICY IF EXISTS "Admins ou donos podem excluir mensagens" ON public.comunicacao_mensagens;