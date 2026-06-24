
-- 1. Tabela de múltiplos solicitantes por ticket
CREATE TABLE IF NOT EXISTS public.suporte_ticket_solicitantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.suporte_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nome text,
  email text,
  is_principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suporte_ticket_solicitantes TO authenticated;
GRANT ALL ON public.suporte_ticket_solicitantes TO service_role;

ALTER TABLE public.suporte_ticket_solicitantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solicitante vê seu vínculo"
  ON public.suporte_ticket_solicitantes FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_leader(auth.uid())
    OR public.has_role(auth.uid(), 'externos'::app_role)
  );

CREATE POLICY "TI/admin gerencia vínculos"
  ON public.suporte_ticket_solicitantes FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.is_leader(auth.uid())
    OR public.has_role(auth.uid(), 'externos'::app_role)
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.is_leader(auth.uid())
    OR public.has_role(auth.uid(), 'externos'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_suporte_ticket_solic_ticket ON public.suporte_ticket_solicitantes(ticket_id);
CREATE INDEX IF NOT EXISTS idx_suporte_ticket_solic_user ON public.suporte_ticket_solicitantes(user_id);

-- 2. Backfill: cria vínculo principal para cada ticket existente
INSERT INTO public.suporte_ticket_solicitantes (ticket_id, user_id, nome, is_principal)
SELECT t.id, t.solicitante_id, t.solicitante_nome, true
FROM public.suporte_tickets t
WHERE t.solicitante_id IS NOT NULL
ON CONFLICT (ticket_id, user_id) DO NOTHING;

-- 3. Ampliar policies de SELECT em suporte_tickets e suporte_comentarios
DROP POLICY IF EXISTS "Users can view own tickets" ON public.suporte_tickets;
CREATE POLICY "Users can view own tickets"
  ON public.suporte_tickets FOR SELECT TO authenticated
  USING (
    auth.uid() = solicitante_id
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.suporte_ticket_solicitantes s
      WHERE s.ticket_id = suporte_tickets.id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Usuários podem visualizar seus próprios tickets" ON public.suporte_tickets;
CREATE POLICY "Usuários podem visualizar seus próprios tickets"
  ON public.suporte_tickets FOR SELECT TO authenticated
  USING (
    auth.uid() = solicitante_id
    OR EXISTS (
      SELECT 1 FROM public.suporte_ticket_solicitantes s
      WHERE s.ticket_id = suporte_tickets.id AND s.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view comments on their tickets" ON public.suporte_comentarios;
CREATE POLICY "Users can view comments on their tickets"
  ON public.suporte_comentarios FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.suporte_tickets t
      WHERE t.id = suporte_comentarios.ticket_id
        AND (
          t.solicitante_id = auth.uid()
          OR public.is_admin(auth.uid())
          OR public.is_leader(auth.uid())
          OR (
            public.has_role(auth.uid(), 'externos'::app_role)
            AND (t.responsavel_ti_id IS NULL OR t.responsavel_ti_id = auth.uid())
          )
          OR EXISTS (
            SELECT 1 FROM public.suporte_ticket_solicitantes s
            WHERE s.ticket_id = t.id AND s.user_id = auth.uid()
          )
        )
    )
  );

-- 4. Demanda -> ticket: registra vínculo
ALTER TABLE public.worklist_tarefas
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.suporte_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_worklist_tarefas_ticket ON public.worklist_tarefas(ticket_id);
