CREATE OR REPLACE FUNCTION public.gerar_disparo_zap(p_campanha_proposta_id uuid, p_chip_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  v_phone_norm text;
  v_candidato text;
  v_inativos_norm text[];
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

  -- Busca disparo ativo da MESMA proposta E MESMA instância (para reuso seguro).
  -- Se chip/instância forem diferentes (ou nenhum chip novo informado e nenhum match), cria um novo disparos_campanhas.
  IF v_instancia IS NOT NULL THEN
    SELECT id INTO v_disparo_campanha_id
    FROM public.disparos_campanhas
    WHERE campanha_proposta_id = p_campanha_proposta_id
      AND ativo = true
      AND status NOT IN ('concluido','cancelado')
      AND instancia = v_instancia
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    -- Sem chip informado: só reusa um disparo ativo que também não tenha instância definida
    SELECT id INTO v_disparo_campanha_id
    FROM public.disparos_campanhas
    WHERE campanha_proposta_id = p_campanha_proposta_id
      AND ativo = true
      AND status NOT IN ('concluido','cancelado')
      AND instancia IS NULL
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

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
    -- Mesma instância: apenas atualiza texto se necessário (NÃO sobrescreve chip/instância)
    UPDATE public.disparos_campanhas
    SET texto_ia = COALESCE(texto_ia, v_texto),
        updated_at = now()
    WHERE id = v_disparo_campanha_id;
  END IF;

  FOR v_lead IN
    SELECT l.id AS lead_id, l.nome, l.phone_e164, l.telefones_adicionais, l.telefones_inativos
    FROM public.vw_lead_status_por_proposta v
    JOIN public.leads l ON l.id = v.lead_id
    WHERE v.campanha_proposta_id = p_campanha_proposta_id
      AND v.status_proposta = 'a_contactar'
      AND v.bloqueado_blacklist = false
      AND v.bloqueado_temp = false
      AND l.phone_e164 IS NOT NULL
      AND COALESCE(l.opt_out, false) = false
      AND l.merged_into_id IS NULL
  LOOP
    v_inativos_norm := ARRAY[]::text[];
    IF v_lead.telefones_inativos IS NOT NULL THEN
      FOREACH v_candidato IN ARRAY v_lead.telefones_inativos LOOP
        v_phone_norm := regexp_replace(COALESCE(v_candidato,''), '[^0-9]', '', 'g');
        IF v_phone_norm <> '' AND v_phone_norm NOT LIKE '55%' THEN
          v_phone_norm := '55' || v_phone_norm;
        END IF;
        IF v_phone_norm <> '' THEN
          v_inativos_norm := array_append(v_inativos_norm, v_phone_norm);
        END IF;
      END LOOP;
    END IF;

    v_phone_raw := NULL;
    v_phone_e164 := NULL;

    IF v_lead.phone_e164 IS NOT NULL THEN
      v_candidato := v_lead.phone_e164;
      v_phone_norm := regexp_replace(v_candidato, '[^0-9]', '', 'g');
      IF v_phone_norm <> '' AND v_phone_norm NOT LIKE '55%' THEN
        v_phone_norm := '55' || v_phone_norm;
      END IF;
      IF v_phone_norm <> '' AND NOT (v_phone_norm = ANY(v_inativos_norm)) THEN
        v_phone_raw := v_candidato;
        v_phone_e164 := v_phone_norm;
      END IF;
    END IF;

    IF v_phone_e164 IS NULL AND v_lead.telefones_adicionais IS NOT NULL THEN
      FOREACH v_candidato IN ARRAY v_lead.telefones_adicionais LOOP
        IF v_candidato IS NULL OR v_candidato = '' THEN CONTINUE; END IF;
        v_phone_norm := regexp_replace(v_candidato, '[^0-9]', '', 'g');
        IF v_phone_norm = '' THEN CONTINUE; END IF;
        IF v_phone_norm NOT LIKE '55%' THEN
          v_phone_norm := '55' || v_phone_norm;
        END IF;
        IF NOT (v_phone_norm = ANY(v_inativos_norm)) THEN
          v_phone_raw := v_candidato;
          v_phone_e164 := v_phone_norm;
          EXIT;
        END IF;
      END LOOP;
    END IF;

    IF v_phone_e164 IS NULL THEN
      v_ignorados := v_ignorados + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.disparos_contatos dc
      WHERE dc.campanha_proposta_id = p_campanha_proposta_id
        AND dc.lead_id = v_lead.lead_id
        AND dc.status NOT IN ('4-ENVIADO','5-NOZAP','7-BLACKLIST')
    ) THEN
      v_ignorados := v_ignorados + 1;
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.disparos_contatos dc
      WHERE dc.campanha_proposta_id = p_campanha_proposta_id
        AND dc.lead_id = v_lead.lead_id
        AND dc.telefone_e164 = v_phone_e164
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
$function$;