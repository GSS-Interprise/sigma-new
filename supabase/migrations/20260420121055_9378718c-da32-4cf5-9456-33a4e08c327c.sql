-- 1. Tabela de passagens do lead por canal
CREATE TABLE IF NOT EXISTS public.campanha_proposta_lead_canais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_proposta_id UUID NOT NULL REFERENCES public.campanha_propostas(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp','trafego_pago','email','instagram','ligacao','linkedin','tiktok')),
  entrou_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  saiu_em TIMESTAMPTZ,
  motivo_saida TEXT,
  proximo_canal TEXT CHECK (proximo_canal IN ('whatsapp','trafego_pago','email','instagram','ligacao','linkedin','tiktok')),
  status_final TEXT NOT NULL DEFAULT 'aberto' CHECK (status_final IN ('aberto','transferido','respondeu','convertido','descartado','fechado')),
  duracao_segundos INTEGER GENERATED ALWAYS AS (
    CASE WHEN saiu_em IS NOT NULL THEN EXTRACT(EPOCH FROM (saiu_em - entrou_em))::int ELSE NULL END
  ) STORED,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cplc_proposta ON public.campanha_proposta_lead_canais(campanha_proposta_id);
CREATE INDEX IF NOT EXISTS idx_cplc_lead ON public.campanha_proposta_lead_canais(lead_id);
CREATE INDEX IF NOT EXISTS idx_cplc_aberto ON public.campanha_proposta_lead_canais(campanha_proposta_id, canal) WHERE status_final = 'aberto';

ALTER TABLE public.campanha_proposta_lead_canais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view lead canais"
  ON public.campanha_proposta_lead_canais FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated can insert lead canais"
  ON public.campanha_proposta_lead_canais FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update lead canais"
  ON public.campanha_proposta_lead_canais FOR UPDATE
  TO authenticated USING (true);

CREATE POLICY "Admin can delete lead canais"
  ON public.campanha_proposta_lead_canais FOR DELETE
  TO authenticated USING (public.is_admin(auth.uid()));

CREATE TRIGGER trg_cplc_updated_at
  BEFORE UPDATE ON public.campanha_proposta_lead_canais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. View agregada de tempo por canal
CREATE OR REPLACE VIEW public.vw_lead_tempo_por_canal AS
SELECT
  campanha_proposta_id,
  lead_id,
  canal,
  COUNT(*) AS passagens,
  SUM(COALESCE(duracao_segundos, EXTRACT(EPOCH FROM (now() - entrou_em))::int)) AS tempo_total_segundos,
  MAX(entrou_em) AS ultima_entrada,
  MAX(saiu_em) AS ultima_saida,
  bool_or(status_final = 'aberto') AS tem_aberto
FROM public.campanha_proposta_lead_canais
GROUP BY campanha_proposta_id, lead_id, canal;

-- 3. Função para transferir lead entre canais
CREATE OR REPLACE FUNCTION public.transferir_lead_canal(
  p_campanha_proposta_id UUID,
  p_lead_id UUID,
  p_canal_atual TEXT,
  p_proximo_canal TEXT,
  p_motivo TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_id UUID;
BEGIN
  IF p_motivo IS NULL OR trim(p_motivo) = '' THEN
    RAISE EXCEPTION 'Motivo da transferência é obrigatório';
  END IF;

  -- Fecha a raia atual aberta
  UPDATE public.campanha_proposta_lead_canais
  SET saiu_em = now(),
      motivo_saida = p_motivo,
      proximo_canal = p_proximo_canal,
      status_final = 'transferido'
  WHERE campanha_proposta_id = p_campanha_proposta_id
    AND lead_id = p_lead_id
    AND canal = p_canal_atual
    AND status_final = 'aberto';

  -- Abre a próxima raia
  INSERT INTO public.campanha_proposta_lead_canais (
    campanha_proposta_id, lead_id, canal, criado_por, status_final
  ) VALUES (
    p_campanha_proposta_id, p_lead_id, p_proximo_canal, auth.uid(), 'aberto'
  ) RETURNING id INTO v_new_id;

  -- Histórico no lead
  INSERT INTO public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
  VALUES (
    p_lead_id,
    'canal_transferido',
    'Transferido de ' || p_canal_atual || ' para ' || p_proximo_canal,
    jsonb_build_object(
      'campanha_proposta_id', p_campanha_proposta_id,
      'canal_origem', p_canal_atual,
      'canal_destino', p_proximo_canal,
      'motivo', p_motivo
    )
  );

  RETURN v_new_id;
END;
$$;

-- 4. Função para fechar lead em um canal sem transferir
CREATE OR REPLACE FUNCTION public.fechar_lead_canal(
  p_campanha_proposta_id UUID,
  p_lead_id UUID,
  p_canal TEXT,
  p_status_final TEXT,
  p_motivo TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status_final NOT IN ('respondeu','convertido','descartado','fechado') THEN
    RAISE EXCEPTION 'Status final inválido: %', p_status_final;
  END IF;

  UPDATE public.campanha_proposta_lead_canais
  SET saiu_em = now(),
      motivo_saida = p_motivo,
      status_final = p_status_final
  WHERE campanha_proposta_id = p_campanha_proposta_id
    AND lead_id = p_lead_id
    AND canal = p_canal
    AND status_final = 'aberto';

  INSERT INTO public.lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
  VALUES (
    p_lead_id,
    'canal_encerrado',
    'Canal ' || p_canal || ' encerrado como ' || p_status_final,
    jsonb_build_object(
      'campanha_proposta_id', p_campanha_proposta_id,
      'canal', p_canal,
      'status_final', p_status_final,
      'motivo', p_motivo
    )
  );
END;
$$;

-- 5. Função para abrir Fase 1 (WA + Tráfego) para todos leads da lista
CREATE OR REPLACE FUNCTION public.seed_fase1_lead_canais(p_campanha_proposta_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lista_id UUID;
  v_count INTEGER := 0;
BEGIN
  SELECT lista_id INTO v_lista_id FROM public.campanha_propostas WHERE id = p_campanha_proposta_id;
  IF v_lista_id IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.campanha_proposta_lead_canais (campanha_proposta_id, lead_id, canal, criado_por)
  SELECT p_campanha_proposta_id, dli.lead_id, c.canal, auth.uid()
  FROM public.disparo_lista_itens dli
  CROSS JOIN (VALUES ('whatsapp'), ('trafego_pago')) AS c(canal)
  WHERE dli.lista_id = v_lista_id
    AND NOT EXISTS (
      SELECT 1 FROM public.campanha_proposta_lead_canais x
      WHERE x.campanha_proposta_id = p_campanha_proposta_id
        AND x.lead_id = dli.lead_id
        AND x.canal = c.canal
    );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 6. Trigger para auto-seedar quando uma proposta é vinculada
CREATE OR REPLACE FUNCTION public.trg_seed_fase1_on_link()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lista_id IS NOT NULL THEN
    PERFORM public.seed_fase1_lead_canais(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_fase1_after_insert ON public.campanha_propostas;
CREATE TRIGGER trg_seed_fase1_after_insert
  AFTER INSERT ON public.campanha_propostas
  FOR EACH ROW EXECUTE FUNCTION public.trg_seed_fase1_on_link();