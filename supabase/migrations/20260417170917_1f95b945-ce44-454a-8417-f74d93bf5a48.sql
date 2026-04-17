-- ============================================
-- 1. TABLE: campanha_propostas
-- ============================================
CREATE TABLE public.campanha_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  proposta_id uuid NOT NULL REFERENCES public.proposta(id) ON DELETE CASCADE,
  lista_id uuid REFERENCES public.disparo_listas(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'encerrada')),
  webhook_trafego_enviado_at timestamptz,
  encerrada_em timestamptz,
  encerrada_por uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, proposta_id)
);

CREATE INDEX idx_campanha_propostas_campanha ON public.campanha_propostas(campanha_id);
CREATE INDEX idx_campanha_propostas_proposta ON public.campanha_propostas(proposta_id);
CREATE INDEX idx_campanha_propostas_status ON public.campanha_propostas(status);

ALTER TABLE public.campanha_propostas ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. TABLE: campanha_proposta_canais
-- ============================================
CREATE TABLE public.campanha_proposta_canais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_proposta_id uuid NOT NULL REFERENCES public.campanha_propostas(id) ON DELETE CASCADE,
  canal text NOT NULL CHECK (canal IN ('whatsapp','trafego_pago','email','instagram','ligacao','linkedin','tiktok')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','em_andamento','concluido','falha')),
  metadados jsonb NOT NULL DEFAULT '{}'::jsonb,
  iniciado_em timestamptz,
  concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campanha_proposta_id, canal)
);

CREATE INDEX idx_campanha_proposta_canais_cp ON public.campanha_proposta_canais(campanha_proposta_id);

ALTER TABLE public.campanha_proposta_canais ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. TABLE: tarefas_captacao
-- ============================================
CREATE TABLE public.tarefas_captacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  campanha_proposta_id uuid REFERENCES public.campanha_propostas(id) ON DELETE CASCADE,
  canal text CHECK (canal IS NULL OR canal IN ('whatsapp','trafego_pago','email','instagram','ligacao','linkedin','tiktok')),
  tipo text NOT NULL DEFAULT 'lead_aberto' CHECK (tipo IN ('lead_aberto','follow_up','tentativa_canal','solicitacao')),
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','em_andamento','concluida','cancelada')),
  prioridade text NOT NULL DEFAULT 'media' CHECK (prioridade IN ('baixa','media','alta','urgente')),
  titulo text NOT NULL,
  descricao text,
  responsavel_id uuid,
  responsavel_nome text,
  prazo timestamptz,
  concluida_em timestamptz,
  concluida_por uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tarefas_captacao_lead ON public.tarefas_captacao(lead_id);
CREATE INDEX idx_tarefas_captacao_cp ON public.tarefas_captacao(campanha_proposta_id);
CREATE INDEX idx_tarefas_captacao_status ON public.tarefas_captacao(status);
CREATE INDEX idx_tarefas_captacao_responsavel ON public.tarefas_captacao(responsavel_id);

ALTER TABLE public.tarefas_captacao ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. FUNCTION: pode_encerrar_campanha
-- ============================================
CREATE OR REPLACE FUNCTION public.pode_encerrar_campanha(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin(_user_id) OR public.is_captacao_leader(_user_id)
$$;

-- ============================================
-- 5. RLS POLICIES: campanha_propostas
-- ============================================
CREATE POLICY "captacao_leads_can_view_campanha_propostas"
ON public.campanha_propostas FOR SELECT
USING (public.has_captacao_permission(auth.uid(), 'leads'));

CREATE POLICY "captacao_leads_can_insert_campanha_propostas"
ON public.campanha_propostas FOR INSERT
WITH CHECK (public.has_captacao_permission(auth.uid(), 'leads'));

CREATE POLICY "captacao_leads_can_update_campanha_propostas"
ON public.campanha_propostas FOR UPDATE
USING (public.has_captacao_permission(auth.uid(), 'leads'))
WITH CHECK (
  -- Para encerrar (status='encerrada'), exige líder/admin
  CASE
    WHEN status = 'encerrada' THEN public.pode_encerrar_campanha(auth.uid())
    ELSE public.has_captacao_permission(auth.uid(), 'leads')
  END
);

CREATE POLICY "admin_or_leader_can_delete_campanha_propostas"
ON public.campanha_propostas FOR DELETE
USING (public.pode_encerrar_campanha(auth.uid()));

-- ============================================
-- 6. RLS POLICIES: campanha_proposta_canais
-- ============================================
CREATE POLICY "captacao_leads_can_view_canais"
ON public.campanha_proposta_canais FOR SELECT
USING (public.has_captacao_permission(auth.uid(), 'leads'));

CREATE POLICY "captacao_leads_can_insert_canais"
ON public.campanha_proposta_canais FOR INSERT
WITH CHECK (public.has_captacao_permission(auth.uid(), 'leads'));

CREATE POLICY "captacao_leads_can_update_canais"
ON public.campanha_proposta_canais FOR UPDATE
USING (public.has_captacao_permission(auth.uid(), 'leads'));

CREATE POLICY "admin_or_leader_can_delete_canais"
ON public.campanha_proposta_canais FOR DELETE
USING (public.pode_encerrar_campanha(auth.uid()));

-- ============================================
-- 7. RLS POLICIES: tarefas_captacao
-- ============================================
CREATE POLICY "captacao_leads_can_view_tarefas"
ON public.tarefas_captacao FOR SELECT
USING (public.has_captacao_permission(auth.uid(), 'leads'));

CREATE POLICY "captacao_leads_can_insert_tarefas"
ON public.tarefas_captacao FOR INSERT
WITH CHECK (public.has_captacao_permission(auth.uid(), 'leads'));

CREATE POLICY "captacao_leads_can_update_tarefas"
ON public.tarefas_captacao FOR UPDATE
USING (public.has_captacao_permission(auth.uid(), 'leads'));

CREATE POLICY "admin_or_leader_can_delete_tarefas"
ON public.tarefas_captacao FOR DELETE
USING (public.pode_encerrar_campanha(auth.uid()));

-- ============================================
-- 8. TRIGGERS: updated_at
-- ============================================
CREATE TRIGGER trg_campanha_propostas_updated_at
BEFORE UPDATE ON public.campanha_propostas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_campanha_proposta_canais_updated_at
BEFORE UPDATE ON public.campanha_proposta_canais
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_tarefas_captacao_updated_at
BEFORE UPDATE ON public.tarefas_captacao
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- 9. TRIGGER: auto-dispatch tráfego pago
-- ============================================
CREATE OR REPLACE FUNCTION public.auto_send_trafego_pago_on_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_url text;
  service_key text;
BEGIN
  -- Cria registros padrão dos 7 canais
  INSERT INTO public.campanha_proposta_canais (campanha_proposta_id, canal, status)
  VALUES
    (NEW.id, 'whatsapp', 'pendente'),
    (NEW.id, 'trafego_pago', 'pendente'),
    (NEW.id, 'email', 'pendente'),
    (NEW.id, 'instagram', 'pendente'),
    (NEW.id, 'ligacao', 'pendente'),
    (NEW.id, 'linkedin', 'pendente'),
    (NEW.id, 'tiktok', 'pendente')
  ON CONFLICT DO NOTHING;

  -- Tenta disparar a edge function (best-effort; ignora se pg_net não disponível)
  BEGIN
    base_url := current_setting('app.settings.supabase_url', true);
    service_key := current_setting('app.settings.service_role_key', true);

    IF base_url IS NOT NULL AND service_key IS NOT NULL THEN
      PERFORM net.http_post(
        url := base_url || '/functions/v1/trafego-pago-auto-dispatch',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || service_key,
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object('campanha_proposta_id', NEW.id)
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE LOG '[auto_send_trafego_pago_on_link] erro ao disparar edge function: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_send_trafego_pago_on_link
AFTER INSERT ON public.campanha_propostas
FOR EACH ROW EXECUTE FUNCTION public.auto_send_trafego_pago_on_link();