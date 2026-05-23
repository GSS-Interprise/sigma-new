-- =====================================================================
-- F2.3 — campanha_lead_tasks + trigger geração automática
--
-- Pipeline manual: quando lead entra em campanha cujo tipo_envio é
-- 'manual' ou 'ambos', sistema gera 6 tasks default pra operadora
-- executar (whatsapp×3, email, instagram, telefone). Operadora marca
-- feita / snooze / descarta. Mensuração automática via agregação.
--
-- Sequência default (pesquisa cadências B2B, plan/pesquisa-cadencias):
--   D+0: whatsapp_1 (primeiro contato)
--   D+1: whatsapp_2 (follow se sem resposta)
--   D+2: email      (canal alternativo)
--   D+4: whatsapp_3 (last shot whatsapp)
--   D+6: instagram  (cercamento)
--   D+8: telefone   (ligação direta antes de descartar)
-- =====================================================================

-- 1. Tabela principal
CREATE TABLE IF NOT EXISTS public.campanha_lead_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_lead_id UUID NOT NULL REFERENCES public.campanha_leads(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN (
    'whatsapp_1', 'whatsapp_2', 'whatsapp_3',
    'email', 'instagram', 'telefone'
  )),
  ordem SMALLINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN (
    'pendente', 'feita', 'snooze', 'descartada'
  )),
  prazo_at TIMESTAMPTZ NOT NULL,
  feita_em TIMESTAMPTZ,
  feita_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  observacao TEXT,
  snooze_ate TIMESTAMPTZ,
  descarte_motivo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campanha_lead_id, tipo)
);

CREATE INDEX IF NOT EXISTS idx_clt_campanha_lead
  ON public.campanha_lead_tasks(campanha_lead_id);
CREATE INDEX IF NOT EXISTS idx_clt_status_prazo
  ON public.campanha_lead_tasks(status, prazo_at)
  WHERE status IN ('pendente', 'snooze');
CREATE INDEX IF NOT EXISTS idx_clt_feita_por
  ON public.campanha_lead_tasks(feita_por, feita_em DESC NULLS LAST)
  WHERE status = 'feita';

-- 2. updated_at automático
CREATE OR REPLACE FUNCTION public.tg_campanha_lead_tasks_set_updated()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clt_set_updated ON public.campanha_lead_tasks;
CREATE TRIGGER trg_clt_set_updated
  BEFORE UPDATE ON public.campanha_lead_tasks
  FOR EACH ROW EXECUTE FUNCTION public.tg_campanha_lead_tasks_set_updated();

-- 3. Trigger geração: ao inserir campanha_lead em campanha manual/ambos,
--    cria as 6 tasks default com prazos relativos a now()
CREATE OR REPLACE FUNCTION public.tg_campanha_leads_generate_tasks()
RETURNS TRIGGER AS $$
DECLARE
  v_tipo_envio TEXT;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT tipo_envio INTO v_tipo_envio
  FROM public.campanhas
  WHERE id = NEW.campanha_id;

  -- Só gera tasks se campanha é manual ou ambos
  IF v_tipo_envio IN ('manual', 'ambos') THEN
    INSERT INTO public.campanha_lead_tasks (campanha_lead_id, tipo, ordem, prazo_at)
    VALUES
      (NEW.id, 'whatsapp_1', 1, v_now),
      (NEW.id, 'whatsapp_2', 2, v_now + interval '1 day'),
      (NEW.id, 'email',      3, v_now + interval '2 days'),
      (NEW.id, 'whatsapp_3', 4, v_now + interval '4 days'),
      (NEW.id, 'instagram',  5, v_now + interval '6 days'),
      (NEW.id, 'telefone',   6, v_now + interval '8 days')
    ON CONFLICT (campanha_lead_id, tipo) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_campanha_leads_generate_tasks ON public.campanha_leads;
CREATE TRIGGER trg_campanha_leads_generate_tasks
  AFTER INSERT ON public.campanha_leads
  FOR EACH ROW EXECUTE FUNCTION public.tg_campanha_leads_generate_tasks();

-- 4. RLS — operadora vê tasks de campanhas que tem acesso (mesma regra
--    das outras tabelas de campanha — herda permissoes via campanha_leads)
ALTER TABLE public.campanha_lead_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view tasks" ON public.campanha_lead_tasks;
CREATE POLICY "Authenticated can view tasks"
  ON public.campanha_lead_tasks
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can update tasks" ON public.campanha_lead_tasks;
CREATE POLICY "Authenticated can update tasks"
  ON public.campanha_lead_tasks
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "service_role_all_clt" ON public.campanha_lead_tasks;
CREATE POLICY "service_role_all_clt"
  ON public.campanha_lead_tasks
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT ALL ON public.campanha_lead_tasks TO authenticated, service_role;

-- 5. View agregada pra dashboard (tasks de hoje + atrasadas)
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
  END AS situacao
FROM public.campanha_lead_tasks clt
JOIN public.campanha_leads cl ON cl.id = clt.campanha_lead_id
JOIN public.campanhas c ON c.id = cl.campanha_id
LEFT JOIN public.leads l ON l.id = cl.lead_id;

GRANT SELECT ON public.vw_campanha_tasks_dashboard TO authenticated, service_role;

COMMENT ON TABLE public.campanha_lead_tasks IS
  'Tasks geradas automaticamente pra leads em campanha manual/ambos. 6 tasks default por lead. Status: pendente, feita, snooze, descartada.';
COMMENT ON FUNCTION public.tg_campanha_leads_generate_tasks IS
  'F2.3 — Trigger AFTER INSERT em campanha_leads. Gera 6 tasks default se campanha.tipo_envio in (manual, ambos).';
