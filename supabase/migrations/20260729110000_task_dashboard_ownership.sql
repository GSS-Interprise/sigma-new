-- A Central de Tarefas precisa distinguir trabalho próprio, da equipe e órfão.
-- Mantemos a view como contrato único para evitar joins diferentes no frontend.
CREATE OR REPLACE VIEW public.vw_campanha_tasks_dashboard AS
SELECT
  cl.campanha_id,
  c.nome AS campanha_nome,
  clt.campanha_lead_id,
  cl.lead_id,
  l.nome AS lead_nome,
  l.phone_e164 AS lead_phone,
  clt.id AS task_id,
  clt.tipo,
  clt.ordem,
  clt.status,
  clt.prazo_at,
  clt.feita_em,
  clt.feita_por,
  CASE
    WHEN clt.status = 'feita' THEN 'feita'
    WHEN clt.status = 'descartada' THEN 'descartada'
    WHEN clt.status = 'snooze' AND clt.snooze_ate > now() THEN 'snoozed'
    WHEN clt.prazo_at < now() - interval '1 day' THEN 'atrasada'
    WHEN clt.prazo_at::date = current_date THEN 'hoje'
    WHEN clt.prazo_at > now() THEN 'futura'
    ELSE 'pendente'
  END AS situacao,
  -- Novas colunas ficam ao final para preservar o contrato posicional da view.
  clt.rotulo,
  clt.responsavel_id,
  responsavel.nome_completo AS responsavel_nome,
  clt.lembrete_em,
  clt.origem
FROM public.campanha_lead_tasks clt
JOIN public.campanha_leads cl ON cl.id = clt.campanha_lead_id
JOIN public.campanhas c ON c.id = cl.campanha_id
LEFT JOIN public.leads l ON l.id = cl.lead_id
LEFT JOIN public.profiles responsavel ON responsavel.id = clt.responsavel_id;

GRANT SELECT ON public.vw_campanha_tasks_dashboard TO authenticated, service_role;

COMMENT ON VIEW public.vw_campanha_tasks_dashboard IS
  'Fila operacional de tarefas com lead, campanha, prazo e responsabilidade explícita.';

-- Cadências novas herdam o dono da campanha. Tarefas manuais continuam podendo
-- ficar sem dono por decisão explícita da operadora.
CREATE OR REPLACE FUNCTION public.tg_task_inherit_campaign_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responsavel_id IS NULL AND NEW.origem IN ('cadencia', 'sistema', 'ia') THEN
    SELECT c.responsavel_id
      INTO NEW.responsavel_id
    FROM public.campanha_leads cl
    JOIN public.campanhas c ON c.id = cl.campanha_id
    WHERE cl.id = NEW.campanha_lead_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_inherit_campaign_owner ON public.campanha_lead_tasks;
CREATE TRIGGER trg_task_inherit_campaign_owner
  BEFORE INSERT ON public.campanha_lead_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_task_inherit_campaign_owner();

-- Ao regularizar o responsável de uma campanha antiga, a própria mudança
-- organiza todas as tarefas abertas órfãs, sem sobrescrever atribuições manuais.
CREATE OR REPLACE FUNCTION public.tg_campaign_backfill_task_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.responsavel_id IS NOT NULL
     AND NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    UPDATE public.campanha_lead_tasks task
       SET responsavel_id = NEW.responsavel_id
      FROM public.campanha_leads cl
     WHERE cl.id = task.campanha_lead_id
       AND cl.campanha_id = NEW.id
       AND task.responsavel_id IS NULL
       AND task.status IN ('pendente', 'snooze');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_backfill_task_owner ON public.campanhas;
CREATE TRIGGER trg_campaign_backfill_task_owner
  AFTER UPDATE OF responsavel_id ON public.campanhas
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_campaign_backfill_task_owner();
