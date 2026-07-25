-- Campanha = oportunidade; estratégia = recorte testável dentro dela.
CREATE TABLE IF NOT EXISTS public.campaign_strategies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho', 'ativa', 'pausada', 'finalizada')),
  prioridade integer NOT NULL DEFAULT 100 CHECK (prioridade >= 0),
  publico_alvo jsonb NOT NULL DEFAULT '{}'::jsonb,
  ordem_regioes jsonb NOT NULL DEFAULT '[]'::jsonb,
  abordagem text,
  briefing_ia jsonb NOT NULL DEFAULT '{}'::jsonb,
  inicio_em timestamptz,
  fim_em timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fim_em IS NULL OR inicio_em IS NULL OR fim_em >= inicio_em),
  UNIQUE(campanha_id, nome)
);

CREATE INDEX IF NOT EXISTS idx_campaign_strategies_campaign_status
  ON public.campaign_strategies(campanha_id, status, prioridade);

ALTER TABLE public.campaign_strategies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view campaign strategies"
  ON public.campaign_strategies;
CREATE POLICY "Authenticated can view campaign strategies"
  ON public.campaign_strategies
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can manage campaign strategies"
  ON public.campaign_strategies;
CREATE POLICY "Authenticated can manage campaign strategies"
  ON public.campaign_strategies
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_strategies TO authenticated;
GRANT ALL ON public.campaign_strategies TO service_role;

ALTER TABLE public.campanha_leads
  ADD COLUMN IF NOT EXISTS strategy_id uuid
    REFERENCES public.campaign_strategies(id) ON DELETE SET NULL;
ALTER TABLE public.campanha_lead_tasks
  ADD COLUMN IF NOT EXISTS strategy_id uuid
    REFERENCES public.campaign_strategies(id) ON DELETE SET NULL;
ALTER TABLE public.campanha_lead_touches
  ADD COLUMN IF NOT EXISTS strategy_id uuid
    REFERENCES public.campaign_strategies(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_campanha_leads_strategy
  ON public.campanha_leads(strategy_id);
CREATE INDEX IF NOT EXISTS idx_campanha_lead_tasks_strategy
  ON public.campanha_lead_tasks(strategy_id);
CREATE INDEX IF NOT EXISTS idx_campanha_lead_touches_strategy
  ON public.campanha_lead_touches(strategy_id);

CREATE OR REPLACE FUNCTION public.touch_campaign_strategy_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_strategy_updated_at
  ON public.campaign_strategies;
CREATE TRIGGER trg_campaign_strategy_updated_at
BEFORE UPDATE ON public.campaign_strategies
FOR EACH ROW EXECUTE FUNCTION public.touch_campaign_strategy_updated_at();

CREATE OR REPLACE FUNCTION public.create_default_campaign_strategy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.campaign_strategies(
    campanha_id, nome, status, prioridade, publico_alvo, abordagem,
    briefing_ia, inicio_em, created_by
  )
  VALUES (
    NEW.id,
    'Estratégia principal',
    CASE WHEN NEW.status::text = 'ativa' THEN 'ativa' ELSE 'rascunho' END,
    100,
    coalesce(NEW.publico_alvo, '{}'::jsonb),
    NEW.mensagem_inicial,
    coalesce(NEW.briefing_ia, '{}'::jsonb),
    NEW.data_inicio,
    NEW.criado_por
  )
  ON CONFLICT (campanha_id, nome) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_campaign_strategy ON public.campanhas;
CREATE TRIGGER trg_create_default_campaign_strategy
AFTER INSERT ON public.campanhas
FOR EACH ROW EXECUTE FUNCTION public.create_default_campaign_strategy();

INSERT INTO public.campaign_strategies(
  campanha_id, nome, status, prioridade, publico_alvo, abordagem,
  briefing_ia, inicio_em, created_by
)
SELECT
  c.id,
  'Estratégia principal',
  CASE
    WHEN c.status::text = 'ativa' THEN 'ativa'
    WHEN c.status::text = 'pausada' THEN 'pausada'
    WHEN c.status::text = 'finalizada' THEN 'finalizada'
    ELSE 'rascunho'
  END,
  100,
  coalesce(c.publico_alvo, '{}'::jsonb),
  c.mensagem_inicial,
  coalesce(c.briefing_ia, '{}'::jsonb),
  c.data_inicio,
  c.criado_por
FROM public.campanhas c
ON CONFLICT (campanha_id, nome) DO NOTHING;

CREATE OR REPLACE FUNCTION public.assign_default_campaign_strategy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.strategy_id IS NULL THEN
    SELECT s.id
    INTO NEW.strategy_id
    FROM public.campaign_strategies s
    WHERE s.campanha_id = NEW.campanha_id
    ORDER BY
      CASE s.status WHEN 'ativa' THEN 0 WHEN 'rascunho' THEN 1 ELSE 2 END,
      s.prioridade,
      s.created_at
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_default_campaign_strategy
  ON public.campanha_leads;
CREATE TRIGGER trg_assign_default_campaign_strategy
BEFORE INSERT OR UPDATE OF campanha_id, strategy_id ON public.campanha_leads
FOR EACH ROW EXECUTE FUNCTION public.assign_default_campaign_strategy();

UPDATE public.campanha_leads cl
SET strategy_id = s.id
FROM public.campaign_strategies s
WHERE s.campanha_id = cl.campanha_id
  AND s.nome = 'Estratégia principal'
  AND cl.strategy_id IS NULL;

UPDATE public.campanha_lead_tasks task
SET strategy_id = cl.strategy_id
FROM public.campanha_leads cl
WHERE cl.id = task.campanha_lead_id
  AND task.strategy_id IS NULL;

UPDATE public.campanha_lead_touches touch
SET strategy_id = cl.strategy_id
FROM public.campanha_leads cl
WHERE cl.id = touch.campanha_lead_id
  AND touch.strategy_id IS NULL;

CREATE OR REPLACE VIEW public.vw_campaign_strategy_funnel AS
SELECT
  s.id AS strategy_id,
  s.campanha_id,
  s.nome AS strategy_name,
  s.status AS strategy_status,
  count(DISTINCT cl.id)::integer AS total_leads,
  count(DISTINCT cl.id) FILTER (
    WHERE cl.data_primeiro_contato IS NOT NULL
  )::integer AS contatados,
  count(DISTINCT cl.id) FILTER (
    WHERE cl.status::text IN ('em_conversa', 'quente', 'convertido')
  )::integer AS em_conversa,
  count(DISTINCT cl.id) FILTER (
    WHERE cl.status::text = 'quente'
  )::integer AS quentes,
  count(DISTINCT cl.id) FILTER (
    WHERE cl.status::text = 'convertido'
  )::integer AS convertidos,
  count(DISTINCT task.id) FILTER (
    WHERE task.status = 'feita'
  )::integer AS tarefas_executadas,
  count(DISTINCT touch.id) FILTER (
    WHERE touch.resultado = 'enviado'
  )::integer AS touches_enviados
FROM public.campaign_strategies s
LEFT JOIN public.campanha_leads cl ON cl.strategy_id = s.id
LEFT JOIN public.campanha_lead_tasks task ON task.strategy_id = s.id
LEFT JOIN public.campanha_lead_touches touch ON touch.strategy_id = s.id
GROUP BY s.id, s.campanha_id, s.nome, s.status;

GRANT SELECT ON public.vw_campaign_strategy_funnel
  TO authenticated, service_role;

COMMENT ON TABLE public.campaign_strategies IS
  'Recortes testáveis de público, ordem regional, abordagem e período dentro de uma campanha.';
