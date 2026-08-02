-- Automação e trilha auditável das etapas comerciais do Kanban.
CREATE TABLE IF NOT EXISTS public.campanha_lead_stage_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campanha_lead_id uuid NOT NULL REFERENCES public.campanha_leads(id) ON DELETE CASCADE,
  etapa_anterior text,
  etapa_nova text NOT NULL,
  motivo text NOT NULL,
  alterado_por uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cl_stage_history_lead_created
  ON public.campanha_lead_stage_history(campanha_lead_id, created_at DESC);
ALTER TABLE public.campanha_lead_stage_history ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.campanha_lead_stage_history TO authenticated;
GRANT ALL ON public.campanha_lead_stage_history TO service_role;
DROP POLICY IF EXISTS "Authenticated can view campaign stage history" ON public.campanha_lead_stage_history;
CREATE POLICY "Authenticated can view campaign stage history"
  ON public.campanha_lead_stage_history FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.crm_etapa_canonica(
  p_status text,
  p_etapa text,
  p_resultado text,
  p_assumido_por uuid
) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_etapa = 'perdido' OR p_resultado = 'perdido' OR p_status = 'descartado' THEN 'perdido'
    WHEN p_etapa = 'na_escala' OR p_status = 'convertido' THEN 'convertido'
    WHEN p_etapa = 'aprovado' THEN 'encaminhado'
    WHEN p_etapa IN ('quente', 'em_analise') OR p_status IN ('aquecido', 'quente') THEN 'qualificado'
    WHEN p_status = 'em_conversa' AND p_assumido_por IS NOT NULL THEN 'em_atendimento'
    WHEN p_status = 'em_conversa' THEN 'respondeu'
    WHEN p_status IN ('contatado', 'sem_resposta') THEN 'contatado'
    ELSE 'novo'
  END;
$$;

CREATE OR REPLACE FUNCTION public.tg_campanha_lead_kanban_automation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_anterior text;
  v_nova text;
  v_motivo text;
BEGIN
  -- Qualquer write-path que registre o primeiro contato deve levar o card a Contatado.
  IF NEW.data_primeiro_contato IS NOT NULL AND NEW.status::text = 'frio' THEN
    NEW.status := 'contatado';
    NEW.data_status := coalesce(NEW.data_status, NEW.data_primeiro_contato, now());
  END IF;

  v_anterior := public.crm_etapa_canonica(OLD.status::text, OLD.etapa_acompanhamento, OLD.resultado_final, OLD.assumido_por);
  v_nova := public.crm_etapa_canonica(NEW.status::text, NEW.etapa_acompanhamento, NEW.resultado_final, NEW.assumido_por);

  IF v_nova IS DISTINCT FROM v_anterior THEN
    v_motivo := CASE
      WHEN v_nova = 'contatado' THEN 'Primeiro contato enviado'
      WHEN v_nova = 'respondeu' THEN 'Resposta recebida do médico'
      WHEN v_nova = 'em_atendimento' THEN 'Conversa assumida pela equipe'
      WHEN v_nova = 'qualificado' THEN 'Médico qualificado'
      WHEN v_nova = 'encaminhado' THEN 'Médico encaminhado para a oportunidade'
      WHEN v_nova = 'convertido' THEN 'Médico encaminhado ao setor de Contratos'
      WHEN v_nova = 'perdido' THEN 'Oportunidade encerrada como perdida'
      ELSE 'Etapa atualizada automaticamente'
    END;

    INSERT INTO public.campanha_lead_stage_history(
      campanha_lead_id, etapa_anterior, etapa_nova, motivo, alterado_por
    ) VALUES (NEW.id, v_anterior, v_nova, v_motivo, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campanha_lead_kanban_automation ON public.campanha_leads;
CREATE TRIGGER trg_campanha_lead_kanban_automation
  BEFORE UPDATE OF status, etapa_acompanhamento, resultado_final, assumido_por, data_primeiro_contato
  ON public.campanha_leads FOR EACH ROW
  EXECUTE FUNCTION public.tg_campanha_lead_kanban_automation();

-- Mensagem não lida é evidência mais forte que um status legado que perdeu o webhook.
CREATE OR REPLACE VIEW public.vw_acompanhamento_kanban AS
SELECT full_view.*,
  CASE
    WHEN full_view.etapa_acompanhamento = 'perdido' OR full_view.resultado_final = 'perdido' OR full_view.status = 'descartado' THEN 'perdido'
    WHEN full_view.etapa_acompanhamento = 'na_escala' OR full_view.status = 'convertido' THEN 'convertido'
    WHEN full_view.etapa_acompanhamento = 'aprovado' THEN 'encaminhado'
    WHEN full_view.etapa_acompanhamento IN ('quente', 'em_analise') OR full_view.status IN ('aquecido', 'quente') THEN 'qualificado'
    WHEN full_view.unread_messages > 0 AND full_view.assumido_por IS NOT NULL THEN 'em_atendimento'
    WHEN full_view.unread_messages > 0 THEN 'respondeu'
    WHEN full_view.status = 'em_conversa' AND full_view.assumido_por IS NOT NULL THEN 'em_atendimento'
    WHEN full_view.status = 'em_conversa' THEN 'respondeu'
    WHEN full_view.status IN ('contatado', 'sem_resposta') THEN 'contatado'
    ELSE 'novo'
  END AS etapa_crm
FROM public.vw_acompanhamento_kanban_full full_view
WHERE full_view.etapa_acompanhamento IS NOT NULL
   OR full_view.tipo_envio = 'manual'
   OR full_view.status IN ('em_conversa', 'aquecido', 'quente', 'convertido', 'descartado')
   OR full_view.unread_messages > 0;

GRANT SELECT ON public.vw_acompanhamento_kanban TO authenticated, service_role;

-- Corrige somente campanhas ativas; campanhas encerradas permanecem imutáveis,
-- mas a mensagem não lida continua visível no Kanban pela regra acima.
UPDATE public.campanha_leads cl
SET status = 'em_conversa', data_status = coalesce(v.last_incoming_at, now()),
    data_ultimo_contato = greatest(coalesce(cl.data_ultimo_contato, '-infinity'::timestamptz), coalesce(v.last_incoming_at, now())),
    updated_at = now()
FROM public.vw_acompanhamento_kanban_full v
JOIN public.campanhas c ON c.id = v.campanha_id
WHERE cl.id = v.campanha_lead_id AND c.status::text = 'ativa' AND v.unread_messages > 0
  AND cl.status::text IN ('frio', 'contatado', 'sem_resposta');

COMMENT ON TABLE public.campanha_lead_stage_history IS
  'Trilha canônica das movimentações automáticas e manuais do funil comercial.';
