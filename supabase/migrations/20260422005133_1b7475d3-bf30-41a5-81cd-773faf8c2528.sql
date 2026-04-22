-- Função: valida que um lead não tenha raias abertas em duas propostas da MESMA campanha
CREATE OR REPLACE FUNCTION public.valida_lead_unico_por_campanha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_campanha_id uuid;
  v_conflito_proposta uuid;
BEGIN
  -- Só valida quando a raia está sendo aberta (status_final aberto / null)
  IF NEW.status_final IS NOT NULL AND NEW.status_final <> 'aberto' THEN
    RETURN NEW;
  END IF;

  -- Descobre a campanha desta proposta
  SELECT campanha_id INTO v_campanha_id
  FROM public.campanha_propostas
  WHERE id = NEW.campanha_proposta_id;

  IF v_campanha_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Procura outra raia aberta para o mesmo lead em OUTRA proposta da MESMA campanha
  SELECT cp.id INTO v_conflito_proposta
  FROM public.campanha_proposta_lead_canais c
  JOIN public.campanha_propostas cp ON cp.id = c.campanha_proposta_id
  WHERE c.lead_id = NEW.lead_id
    AND cp.campanha_id = v_campanha_id
    AND cp.id <> NEW.campanha_proposta_id
    AND cp.status NOT IN ('encerrada','cancelada')
    AND (c.status_final IS NULL OR c.status_final = 'aberto')
    AND c.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF v_conflito_proposta IS NOT NULL THEN
    RAISE EXCEPTION 'Lead já está ativo em outra proposta desta campanha (proposta %). Encerre o vínculo atual antes de adicioná-lo aqui.', v_conflito_proposta
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_lead_unico_por_campanha ON public.campanha_proposta_lead_canais;
CREATE TRIGGER trg_valida_lead_unico_por_campanha
BEFORE INSERT OR UPDATE ON public.campanha_proposta_lead_canais
FOR EACH ROW
EXECUTE FUNCTION public.valida_lead_unico_por_campanha();

-- RPC: mover lead entre propostas da mesma campanha (encerra origem + abre destino)
CREATE OR REPLACE FUNCTION public.mover_lead_entre_propostas(
  p_lead_id uuid,
  p_proposta_origem uuid,
  p_proposta_destino uuid,
  p_canal text DEFAULT 'whatsapp'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_origem_campanha uuid;
  v_destino_campanha uuid;
  v_nova_raia_id uuid;
BEGIN
  SELECT campanha_id INTO v_origem_campanha FROM public.campanha_propostas WHERE id = p_proposta_origem;
  SELECT campanha_id INTO v_destino_campanha FROM public.campanha_propostas WHERE id = p_proposta_destino;

  IF v_origem_campanha IS NULL OR v_destino_campanha IS NULL THEN
    RAISE EXCEPTION 'Proposta de origem ou destino não encontrada';
  END IF;

  IF v_origem_campanha <> v_destino_campanha THEN
    RAISE EXCEPTION 'As propostas devem pertencer à mesma campanha';
  END IF;

  -- Encerra raias abertas do lead na proposta de origem
  UPDATE public.campanha_proposta_lead_canais
  SET saiu_em = now(),
      motivo_saida = 'Movido para outra proposta',
      status_final = 'movido',
      updated_at = now()
  WHERE lead_id = p_lead_id
    AND campanha_proposta_id = p_proposta_origem
    AND (status_final IS NULL OR status_final = 'aberto');

  -- Abre nova raia na proposta de destino
  INSERT INTO public.campanha_proposta_lead_canais (
    campanha_proposta_id, lead_id, canal, entrou_em, status_final, criado_por
  ) VALUES (
    p_proposta_destino, p_lead_id, p_canal, now(), 'aberto', auth.uid()
  )
  RETURNING id INTO v_nova_raia_id;

  RETURN v_nova_raia_id;
END;
$$;