-- Follow-up operacional: responsabilidade, lembrete e origem auditáveis.
ALTER TABLE public.campanha_lead_tasks
  ADD COLUMN IF NOT EXISTS responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lembrete_em timestamptz,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'cadencia',
  ADD COLUMN IF NOT EXISTS criada_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.campanha_lead_tasks
  DROP CONSTRAINT IF EXISTS campanha_lead_tasks_origem_check;

ALTER TABLE public.campanha_lead_tasks
  ADD CONSTRAINT campanha_lead_tasks_origem_check
  CHECK (origem IN ('cadencia', 'manual', 'conversa', 'ia', 'parecer', 'sistema'));

CREATE INDEX IF NOT EXISTS idx_clt_responsavel_prazo
  ON public.campanha_lead_tasks(responsavel_id, prazo_at)
  WHERE status IN ('pendente', 'snooze');

CREATE INDEX IF NOT EXISTS idx_clt_lembrete
  ON public.campanha_lead_tasks(lembrete_em)
  WHERE status IN ('pendente', 'snooze') AND lembrete_em IS NOT NULL;

-- A tela já permitia criar tarefa avulsa, mas faltava a policy INSERT.
-- A política explícita corrige a causa raiz sem ampliar acesso anônimo.
DROP POLICY IF EXISTS "Authenticated can insert tasks" ON public.campanha_lead_tasks;
CREATE POLICY "Authenticated can insert tasks"
  ON public.campanha_lead_tasks
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (criada_por IS NULL OR criada_por = auth.uid())
  );

UPDATE public.campanha_lead_tasks
SET
  responsavel_id = COALESCE(responsavel_id, feita_por),
  origem = CASE
    WHEN origem <> 'cadencia' THEN origem
    WHEN rotulo ILIKE '%parecer%' THEN 'parecer'
    ELSE 'cadencia'
  END
WHERE responsavel_id IS NULL OR origem = 'cadencia';

COMMENT ON COLUMN public.campanha_lead_tasks.responsavel_id IS
  'Pessoa responsável pelo próximo passo. Independente de quem concluiu a tarefa.';
COMMENT ON COLUMN public.campanha_lead_tasks.lembrete_em IS
  'Momento em que a tarefa deve entrar na fila de lembretes.';
COMMENT ON COLUMN public.campanha_lead_tasks.origem IS
  'Origem auditável: cadencia, manual, conversa, ia, parecer ou sistema.';
COMMENT ON COLUMN public.campanha_lead_tasks.criada_por IS
  'Usuário que criou manualmente o follow-up.';
