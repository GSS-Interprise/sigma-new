-- 1. Flags em chips e instâncias
ALTER TABLE public.chips ADD COLUMN IF NOT EXISTS is_trafego_pago boolean NOT NULL DEFAULT false;
ALTER TABLE public.sigzap_instances ADD COLUMN IF NOT EXISTS is_trafego_pago boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_chips_trafego_pago ON public.chips(is_trafego_pago) WHERE is_trafego_pago = true;
CREATE INDEX IF NOT EXISTS idx_sigzap_instances_trafego_pago ON public.sigzap_instances(is_trafego_pago) WHERE is_trafego_pago = true;

-- 2. Campos no leads
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_trafego_pago boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trafego_pago_origem jsonb,
  ADD COLUMN IF NOT EXISTS trafego_pago_enviado_at timestamptz,
  ADD COLUMN IF NOT EXISTS trafego_pago_campanha_proposta_id uuid,
  ADD COLUMN IF NOT EXISTS trafego_pago_instancia text;

CREATE INDEX IF NOT EXISTS idx_leads_trafego_pago ON public.leads(is_trafego_pago) WHERE is_trafego_pago = true;
CREATE INDEX IF NOT EXISTS idx_leads_trafego_cp ON public.leads(trafego_pago_campanha_proposta_id) WHERE trafego_pago_campanha_proposta_id IS NOT NULL;

-- 3. Histórico de envios
CREATE TABLE IF NOT EXISTS public.trafego_pago_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campanha_proposta_id uuid NOT NULL REFERENCES public.campanha_propostas(id) ON DELETE CASCADE,
  campanha_id uuid,
  proposta_id uuid,
  instancia text,
  telefone_enviado text,
  arquivo_nome text,
  enviado_em timestamptz NOT NULL DEFAULT now(),
  enviado_por uuid,
  metadados jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tp_envios_lead ON public.trafego_pago_envios(lead_id);
CREATE INDEX IF NOT EXISTS idx_tp_envios_cp ON public.trafego_pago_envios(campanha_proposta_id);
CREATE INDEX IF NOT EXISTS idx_tp_envios_instancia ON public.trafego_pago_envios(instancia);
CREATE INDEX IF NOT EXISTS idx_tp_envios_data ON public.trafego_pago_envios(enviado_em DESC);

ALTER TABLE public.trafego_pago_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tp_envios" ON public.trafego_pago_envios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tp_envios" ON public.trafego_pago_envios FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service role full tp_envios" ON public.trafego_pago_envios FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Eventos de conversão
CREATE TABLE IF NOT EXISTS public.trafego_pago_conversoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  campanha_proposta_id uuid REFERENCES public.campanha_propostas(id) ON DELETE SET NULL,
  campanha_id uuid,
  proposta_id uuid,
  instancia text,
  evento text NOT NULL CHECK (evento IN ('enviado','mensagem_recebida','conversa_ativa','proposta_aceita','convertido','perdido')),
  conversation_id uuid,
  detalhes jsonb DEFAULT '{}'::jsonb,
  ocorreu_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tp_conv_lead ON public.trafego_pago_conversoes(lead_id);
CREATE INDEX IF NOT EXISTS idx_tp_conv_cp ON public.trafego_pago_conversoes(campanha_proposta_id);
CREATE INDEX IF NOT EXISTS idx_tp_conv_evento ON public.trafego_pago_conversoes(evento);
CREATE INDEX IF NOT EXISTS idx_tp_conv_data ON public.trafego_pago_conversoes(ocorreu_em DESC);

ALTER TABLE public.trafego_pago_conversoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read tp_conv" ON public.trafego_pago_conversoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert tp_conv" ON public.trafego_pago_conversoes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Service role full tp_conv" ON public.trafego_pago_conversoes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. View de funil
CREATE OR REPLACE VIEW public.vw_trafego_pago_funil AS
SELECT
  cp.id AS campanha_proposta_id,
  cp.campanha_id,
  cp.proposta_id,
  c.nome AS campanha_nome,
  p.id_proposta AS proposta_codigo,
  p.descricao AS proposta_descricao,
  COUNT(DISTINCT e.lead_id) AS total_enviados,
  COUNT(DISTINCT CASE WHEN conv.evento = 'mensagem_recebida' THEN conv.lead_id END) AS total_responderam,
  COUNT(DISTINCT CASE WHEN conv.evento = 'conversa_ativa' THEN conv.lead_id END) AS total_em_conversa,
  COUNT(DISTINCT CASE WHEN conv.evento = 'proposta_aceita' THEN conv.lead_id END) AS total_aceitaram,
  COUNT(DISTINCT CASE WHEN conv.evento = 'convertido' THEN conv.lead_id END) AS total_convertidos,
  MIN(e.enviado_em) AS primeiro_envio,
  MAX(e.enviado_em) AS ultimo_envio
FROM public.campanha_propostas cp
LEFT JOIN public.campanhas c ON c.id = cp.campanha_id
LEFT JOIN public.proposta p ON p.id = cp.proposta_id
LEFT JOIN public.trafego_pago_envios e ON e.campanha_proposta_id = cp.id
LEFT JOIN public.trafego_pago_conversoes conv ON conv.campanha_proposta_id = cp.id
GROUP BY cp.id, cp.campanha_id, cp.proposta_id, c.nome, p.id_proposta, p.descricao;

-- 6. Função: identifica se uma instância (por nome) é tráfego pago
CREATE OR REPLACE FUNCTION public.is_instancia_trafego_pago(p_instance_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chips WHERE instance_name = p_instance_name AND is_trafego_pago = true
  ) OR EXISTS (
    SELECT 1 FROM public.sigzap_instances WHERE name = p_instance_name AND is_trafego_pago = true
  ) OR EXISTS (
    SELECT 1 FROM public.config_lista_items 
    WHERE campo_nome = 'trafego_pago_evolution_instance' AND valor = p_instance_name
  );
$$;

-- 7. Trigger: ao criar/atualizar conversa de instância de tráfego pago
CREATE OR REPLACE FUNCTION public.trg_trafego_pago_marcar_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance_name text;
  v_is_tp boolean;
  v_phone text;
  v_lead_id uuid;
BEGIN
  SELECT name INTO v_instance_name FROM public.sigzap_instances WHERE id = NEW.instance_id;
  IF v_instance_name IS NULL THEN RETURN NEW; END IF;
  
  v_is_tp := public.is_instancia_trafego_pago(v_instance_name);
  IF NOT v_is_tp THEN RETURN NEW; END IF;
  
  SELECT contact_phone INTO v_phone FROM public.sigzap_contacts WHERE id = NEW.contact_id;
  IF v_phone IS NULL THEN RETURN NEW; END IF;
  
  v_lead_id := NEW.lead_id;
  
  IF v_lead_id IS NULL THEN
    SELECT id INTO v_lead_id FROM public.leads 
    WHERE phone_e164 = v_phone OR phone_e164 = '+' || v_phone OR phone_e164 = regexp_replace(v_phone, '^\+', '')
    LIMIT 1;
  END IF;
  
  IF v_lead_id IS NULL THEN RETURN NEW; END IF;
  
  UPDATE public.leads
  SET is_trafego_pago = true,
      trafego_pago_instancia = COALESCE(trafego_pago_instancia, v_instance_name),
      trafego_pago_origem = COALESCE(trafego_pago_origem, jsonb_build_object(
        'detectado_em', now(),
        'fonte', 'conversa_inbound',
        'instancia', v_instance_name,
        'conversation_id', NEW.id
      ))
  WHERE id = v_lead_id;
  
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.trafego_pago_conversoes (lead_id, campanha_proposta_id, instancia, evento, conversation_id, detalhes)
    SELECT v_lead_id, 
           (SELECT trafego_pago_campanha_proposta_id FROM public.leads WHERE id = v_lead_id),
           v_instance_name,
           'mensagem_recebida',
           NEW.id,
           jsonb_build_object('phone', v_phone);
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_trafego_pago_inbound ON public.sigzap_conversations;
CREATE TRIGGER trg_trafego_pago_inbound
AFTER INSERT OR UPDATE OF lead_id ON public.sigzap_conversations
FOR EACH ROW EXECUTE FUNCTION public.trg_trafego_pago_marcar_lead();