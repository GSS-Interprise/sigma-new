
-- Add campaign/proposal links to disparos tables
ALTER TABLE public.disparos_campanhas
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.campanhas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS campanha_proposta_id uuid REFERENCES public.campanha_propostas(id) ON DELETE SET NULL;

ALTER TABLE public.disparos_contatos
  ADD COLUMN IF NOT EXISTS campanha_proposta_id uuid REFERENCES public.campanha_propostas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_disparos_contatos_cp ON public.disparos_contatos(campanha_proposta_id);
CREATE INDEX IF NOT EXISTS idx_disparos_contatos_status_cp ON public.disparos_contatos(status, campanha_proposta_id);
CREATE INDEX IF NOT EXISTS idx_disparos_campanhas_cp ON public.disparos_campanhas(campanha_proposta_id);

-- RPC: gerar lote de disparo Zap a partir de uma campanha_proposta
-- Cria/atualiza um disparos_campanhas vinculado e insere disparos_contatos para os leads elegíveis.
-- Idempotente: ignora leads que já tenham disparo não-finalizado para a mesma campanha_proposta.
CREATE OR REPLACE FUNCTION public.gerar_disparo_zap(
  p_campanha_proposta_id uuid,
  p_chip_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cp RECORD;
  v_proposta RECORD;
  v_campanha RECORD;
  v_chip RECORD;
  v_disparo_campanha_id uuid;
  v_user uuid := auth.uid();
  v_user_nome text;
  v_inseridos int := 0;
  v_ignorados int := 0;
  v_lead RECORD;
  v_phone_raw text;
  v_phone_e164 text;
  v_texto text;
  v_instancia text;
BEGIN
  SELECT * INTO v_cp FROM public.campanha_propostas WHERE id = p_campanha_proposta_id;
  IF v_cp IS NULL THEN
    RAISE EXCEPTION 'campanha_proposta não encontrada';
  END IF;

  SELECT * INTO v_proposta FROM public.proposta WHERE id = v_cp.proposta_id;
  SELECT * INTO v_campanha FROM public.campanhas WHERE id = v_cp.campanha_id;

  IF p_chip_id IS NOT NULL THEN
    SELECT * INTO v_chip FROM public.chips WHERE id = p_chip_id;
    v_instancia := v_chip.instance_name;

    -- Validação: instância em uso por outro disparo não-finalizado
    IF v_instancia IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.disparos_campanhas
      WHERE instancia = v_instancia
        AND ativo = true
        AND status NOT IN ('concluido','cancelado')
    ) THEN
      RAISE EXCEPTION 'Instância % já está em uso por outro disparo ativo', v_instancia;
    END IF;
  END IF;

  v_texto := COALESCE(v_proposta.mensagem_whatsapp, v_proposta.observacoes);

  SELECT nome_completo INTO v_user_nome FROM public.profiles WHERE id = v_user;

  -- Reaproveita disparos_campanhas existente da mesma campanha_proposta (ativo) ou cria novo
  SELECT id INTO v_disparo_campanha_id
  FROM public.disparos_campanhas
  WHERE campanha_proposta_id = p_campanha_proposta_id
    AND ativo = true
    AND status NOT IN ('concluido','cancelado')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_disparo_campanha_id IS NULL THEN
    INSERT INTO public.disparos_campanhas (
      nome, proposta_id, texto_ia, instancia, chip_id,
      responsavel_id, responsavel_nome, status, ativo,
      campanha_id, campanha_proposta_id
    ) VALUES (
      COALESCE(v_proposta.id_proposta, v_proposta.descricao, 'Disparo Zap'),
      v_proposta.id::text,
      v_texto,
      v_instancia,
      p_chip_id,
      v_user,
      v_user_nome,
      'pendente',
      true,
      v_cp.campanha_id,
      p_campanha_proposta_id
    ) RETURNING id INTO v_disparo_campanha_id;
  ELSE
    -- Se chip novo informado, atualiza
    IF p_chip_id IS NOT NULL THEN
      UPDATE public.disparos_campanhas
      SET chip_id = p_chip_id,
          instancia = v_instancia,
          texto_ia = COALESCE(texto_ia, v_texto),
          updated_at = now()
      WHERE id = v_disparo_campanha_id;
    END IF;
  END IF;

  -- Itera leads elegíveis (sem raia aberta, sem blacklist, com telefone) da proposta
  FOR v_lead IN
    SELECT l.id AS lead_id, l.nome, l.phone_e164, l.telefone
    FROM public.vw_lead_status_por_proposta v
    JOIN public.leads l ON l.id = v.lead_id
    WHERE v.campanha_proposta_id = p_campanha_proposta_id
      AND v.status_proposta = 'a_contactar'
      AND v.bloqueado_blacklist = false
      AND v.bloqueado_temp = false
      AND COALESCE(l.phone_e164, l.telefone) IS NOT NULL
      AND COALESCE(l.opt_out, false) = false
      AND l.merged_into_id IS NULL
  LOOP
    v_phone_raw := COALESCE(v_lead.phone_e164, v_lead.telefone);
    v_phone_e164 := regexp_replace(v_phone_raw, '[^0-9]', '', 'g');
    IF v_phone_e164 NOT LIKE '55%' THEN
      v_phone_e164 := '55' || v_phone_e164;
    END IF;

    -- Já existe disparo para esse lead nesta campanha_proposta em status não-final?
    IF EXISTS (
      SELECT 1 FROM public.disparos_contatos dc
      WHERE dc.campanha_proposta_id = p_campanha_proposta_id
        AND dc.lead_id = v_lead.lead_id
        AND dc.status NOT IN ('4-ENVIADO','7-BLACKLIST')
    ) THEN
      v_ignorados := v_ignorados + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.disparos_contatos (
      campanha_id, campanha_proposta_id, lead_id, nome,
      telefone_original, telefone_e164, status
    ) VALUES (
      v_disparo_campanha_id, p_campanha_proposta_id, v_lead.lead_id, v_lead.nome,
      v_phone_raw, v_phone_e164, '1-ENVIAR'
    );
    v_inseridos := v_inseridos + 1;
  END LOOP;

  -- Atualiza contagem total da disparos_campanhas
  UPDATE public.disparos_campanhas
  SET total_contatos = (
    SELECT COUNT(*) FROM public.disparos_contatos WHERE campanha_id = v_disparo_campanha_id
  ),
  updated_at = now()
  WHERE id = v_disparo_campanha_id;

  RETURN jsonb_build_object(
    'disparo_campanha_id', v_disparo_campanha_id,
    'inseridos', v_inseridos,
    'ignorados', v_ignorados
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.gerar_disparo_zap(uuid, uuid) TO authenticated;
