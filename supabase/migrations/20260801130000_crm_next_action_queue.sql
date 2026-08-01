-- Fila operacional: uma próxima ação por lead, sem apagar histórico.
CREATE TABLE IF NOT EXISTS public.campanha_task_cleanup_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id uuid NOT NULL,
  status_anterior text NOT NULL,
  motivo text NOT NULL,
  executado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campanha_task_cleanup_audit ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.campanha_task_cleanup_audit TO authenticated;
GRANT ALL ON public.campanha_task_cleanup_audit TO service_role;
DROP POLICY IF EXISTS "Authenticated can view task cleanup audit" ON public.campanha_task_cleanup_audit;
CREATE POLICY "Authenticated can view task cleanup audit" ON public.campanha_task_cleanup_audit
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

INSERT INTO public.campanha_task_cleanup_audit (task_id, status_anterior, motivo)
SELECT task.id, task.status::text,
  CASE WHEN cl.status::text IN ('convertido','descartado') OR cl.etapa_acompanhamento IN ('na_escala','perdido') OR cl.resultado_final = 'perdido'
    THEN 'Lead já encerrado' ELSE 'Campanha já encerrada' END
FROM public.campanha_lead_tasks task
JOIN public.campanha_leads cl ON cl.id = task.campanha_lead_id
JOIN public.campanhas c ON c.id = cl.campanha_id
WHERE task.status::text IN ('pendente','snooze')
  AND (cl.status::text IN ('convertido','descartado') OR cl.etapa_acompanhamento IN ('na_escala','perdido')
    OR cl.resultado_final = 'perdido' OR c.status::text IN ('finalizada','arquivada'));

UPDATE public.campanha_lead_tasks task
SET status = 'descartada',
    descarte_motivo = CASE WHEN cl.status::text IN ('convertido','descartado') OR cl.etapa_acompanhamento IN ('na_escala','perdido') OR cl.resultado_final = 'perdido'
      THEN 'Encerrada automaticamente: lead convertido ou perdido' ELSE 'Encerrada automaticamente: campanha finalizada' END,
    feita_em = coalesce(task.feita_em, now())
FROM public.campanha_leads cl JOIN public.campanhas c ON c.id = cl.campanha_id
WHERE cl.id = task.campanha_lead_id AND task.status::text IN ('pendente','snooze')
  AND (cl.status::text IN ('convertido','descartado') OR cl.etapa_acompanhamento IN ('na_escala','perdido')
    OR cl.resultado_final = 'perdido' OR c.status::text IN ('finalizada','arquivada'));

UPDATE public.campanha_lead_tasks task SET responsavel_id = cl.assumido_por
FROM public.campanha_leads cl
WHERE cl.id = task.campanha_lead_id AND cl.assumido_por IS NOT NULL
  AND task.status::text IN ('pendente','snooze') AND task.responsavel_id IS DISTINCT FROM cl.assumido_por;

CREATE OR REPLACE FUNCTION public.tg_task_inherit_campaign_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.responsavel_id IS NULL AND NEW.origem IN ('cadencia','sistema','ia') THEN
    SELECT coalesce(cl.assumido_por, c.responsavel_id) INTO NEW.responsavel_id
    FROM public.campanha_leads cl JOIN public.campanhas c ON c.id = cl.campanha_id
    WHERE cl.id = NEW.campanha_lead_id;
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_campanha_lead_sync_tasks() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.assumido_por IS NOT NULL AND NEW.assumido_por IS DISTINCT FROM OLD.assumido_por THEN
    UPDATE public.campanha_lead_tasks SET responsavel_id = NEW.assumido_por
    WHERE campanha_lead_id = NEW.id AND status::text IN ('pendente','snooze');
  END IF;
  IF (NEW.status::text IN ('convertido','descartado') OR NEW.etapa_acompanhamento IN ('na_escala','perdido') OR NEW.resultado_final = 'perdido')
     AND NOT (OLD.status::text IN ('convertido','descartado') OR OLD.etapa_acompanhamento IN ('na_escala','perdido') OR OLD.resultado_final = 'perdido') THEN
    UPDATE public.campanha_lead_tasks SET status = 'descartada',
      descarte_motivo = 'Encerrada automaticamente: lead convertido ou perdido', feita_em = coalesce(feita_em, now())
    WHERE campanha_lead_id = NEW.id AND status::text IN ('pendente','snooze');
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_campanha_lead_sync_tasks ON public.campanha_leads;
CREATE TRIGGER trg_campanha_lead_sync_tasks AFTER UPDATE OF assumido_por, status, etapa_acompanhamento, resultado_final
ON public.campanha_leads FOR EACH ROW EXECUTE FUNCTION public.tg_campanha_lead_sync_tasks();

CREATE OR REPLACE VIEW public.vw_campanha_tasks_dashboard AS
WITH base AS (
 SELECT cl.campanha_id, c.nome campanha_nome, clt.campanha_lead_id, cl.lead_id, l.nome lead_nome, l.phone_e164 lead_phone,
   clt.id task_id, clt.tipo, clt.ordem, clt.status, clt.prazo_at, clt.feita_em, clt.feita_por, clt.rotulo,
   clt.responsavel_id, p.nome_completo responsavel_nome, clt.lembrete_em, clt.origem, c.status::text campanha_status,
   cl.status::text lead_status,
   count(*) FILTER (WHERE clt.status::text IN ('pendente','snooze')) OVER (PARTITION BY clt.campanha_lead_id) passos_restantes,
   CASE WHEN clt.status::text IN ('pendente','snooze') THEN row_number() OVER (
     PARTITION BY clt.campanha_lead_id, (clt.status::text IN ('pendente','snooze')) ORDER BY clt.ordem, clt.prazo_at NULLS FIRST, clt.id) END ordem_aberta
 FROM public.campanha_lead_tasks clt JOIN public.campanha_leads cl ON cl.id=clt.campanha_lead_id
 JOIN public.campanhas c ON c.id=cl.campanha_id LEFT JOIN public.leads l ON l.id=cl.lead_id
 LEFT JOIN public.profiles p ON p.id=clt.responsavel_id
), ranked AS (
 SELECT base.*,
  CASE WHEN campanha_status='pausada' AND status::text IN ('pendente','snooze') THEN 'campanha_pausada'
   WHEN status::text='feita' THEN 'feita' WHEN status::text='descartada' THEN 'descartada'
   WHEN status::text='snooze' AND prazo_at>now() THEN 'snoozed' WHEN prazo_at<now()-interval '1 day' THEN 'atrasada'
   WHEN prazo_at::date=current_date THEN 'hoje' WHEN prazo_at>now() THEN 'futura' ELSE 'pendente' END situacao_calculada,
  CASE WHEN lead_status IN ('em_conversa','aquecido','quente') THEN 'urgente'
   WHEN prazo_at<now()-interval '3 days' THEN 'alta' ELSE 'normal' END prioridade_calculada
 FROM base
), queued AS (
 SELECT ranked.*, CASE WHEN ordem_aberta=1 AND campanha_status<>'pausada' THEN row_number() OVER (
  PARTITION BY responsavel_id, (ordem_aberta=1 AND campanha_status<>'pausada')
  ORDER BY CASE prioridade_calculada WHEN 'urgente' THEN 1 WHEN 'alta' THEN 2 ELSE 3 END, prazo_at NULLS FIRST, task_id) END fila_posicao
 FROM ranked
)
SELECT campanha_id,campanha_nome,campanha_lead_id,lead_id,lead_nome,lead_phone,task_id,tipo,ordem,status,prazo_at,feita_em,feita_por,
 situacao_calculada situacao,rotulo,responsavel_id,responsavel_nome,lembrete_em,origem,
 (ordem_aberta=1 AND campanha_status<>'pausada') is_next_action,campanha_status,passos_restantes,
 prioridade_calculada prioridade_operacional,fila_posicao,(fila_posicao<=60) dentro_capacidade_diaria
FROM queued;
GRANT SELECT ON public.vw_campanha_tasks_dashboard TO authenticated, service_role;
COMMENT ON VIEW public.vw_campanha_tasks_dashboard IS 'Fila CRM: uma próxima ação por lead, prioridade, capacidade diária e campanhas pausadas fora da operação.';
