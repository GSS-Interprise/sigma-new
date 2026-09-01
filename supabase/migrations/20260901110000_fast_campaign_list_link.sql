-- Evita que a atualização de contadores, executada por linha, torne o vínculo
-- de uma lista grande lento demais para a requisição da aplicação.
-- Durante o lote os contadores são recalculados uma única vez ao final.
CREATE OR REPLACE FUNCTION public.atualizar_contadores_campanha()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campanha_id uuid;
BEGIN
  IF current_setting('app.bulk_campaign_link', true) = 'on' THEN
    RETURN NULL;
  END IF;

  v_campanha_id := coalesce(NEW.campanha_id, OLD.campanha_id);

  UPDATE public.campanhas SET
    total_frio = (SELECT count(*) FROM public.campanha_leads WHERE campanha_id = v_campanha_id AND status = 'frio'),
    total_contatado = (SELECT count(*) FROM public.campanha_leads WHERE campanha_id = v_campanha_id AND status = 'contatado'),
    total_em_conversa = (SELECT count(*) FROM public.campanha_leads WHERE campanha_id = v_campanha_id AND status = 'em_conversa'),
    total_aquecido = (SELECT count(*) FROM public.campanha_leads WHERE campanha_id = v_campanha_id AND status = 'aquecido'),
    total_quente = (SELECT count(*) FROM public.campanha_leads WHERE campanha_id = v_campanha_id AND status = 'quente'),
    total_convertido = (SELECT count(*) FROM public.campanha_leads WHERE campanha_id = v_campanha_id AND status = 'convertido'),
    updated_at = now()
  WHERE id = v_campanha_id;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.adicionar_lista_estrategia(
  p_campanha_id uuid,
  p_strategy_id uuid,
  p_lista_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead_ids uuid[];
  v_total integer := 0;
  v_inserted integer := 0;
  v_chunk_size integer := 100;
  v_offset integer := 1;
  v_end integer;
  v_chunk uuid[];
  v_frio integer := 0;
  v_contatado integer := 0;
  v_em_conversa integer := 0;
  v_aquecido integer := 0;
  v_quente integer := 0;
  v_convertido integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.campaign_strategies
    WHERE id = p_strategy_id
      AND campanha_id = p_campanha_id
  ) THEN
    RAISE EXCEPTION 'strategy_not_in_campaign';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.disparo_listas WHERE id = p_lista_id
  ) THEN
    RAISE EXCEPTION 'list_not_found';
  END IF;

  SELECT
    coalesce(array_agg(item.lead_id ORDER BY item.created_at, item.id), '{}'::uuid[]),
    count(*)::integer
  INTO v_lead_ids, v_total
  FROM public.disparo_lista_itens item
  WHERE item.lista_id = p_lista_id;

  INSERT INTO public.campanha_listas(campanha_id, lista_id, created_by)
  VALUES (p_campanha_id, p_lista_id, auth.uid())
  ON CONFLICT (campanha_id, lista_id) DO NOTHING;

  -- O trigger de contadores continua ativo para operações normais, mas não
  -- refaz seis contagens completas a cada linha deste lote.
  PERFORM set_config('app.bulk_campaign_link', 'on', true);

  WHILE v_offset <= cardinality(v_lead_ids) LOOP
    v_end := least(v_offset + v_chunk_size - 1, cardinality(v_lead_ids));
    v_chunk := v_lead_ids[v_offset:v_end];

    v_inserted := v_inserted + public.adicionar_leads_estrategia(
      p_campanha_id,
      p_strategy_id,
      v_chunk
    );

    v_offset := v_end + 1;
  END LOOP;

  -- Atualiza o painel uma única vez, já com todos os leads do lote.
  SELECT
    count(*) FILTER (WHERE status = 'frio'),
    count(*) FILTER (WHERE status = 'contatado'),
    count(*) FILTER (WHERE status = 'em_conversa'),
    count(*) FILTER (WHERE status = 'aquecido'),
    count(*) FILTER (WHERE status = 'quente'),
    count(*) FILTER (WHERE status = 'convertido')
  INTO v_frio, v_contatado, v_em_conversa, v_aquecido, v_quente, v_convertido
  FROM public.campanha_leads
  WHERE campanha_id = p_campanha_id;

  UPDATE public.campanhas
  SET total_frio = coalesce(v_frio, 0),
      total_contatado = coalesce(v_contatado, 0),
      total_em_conversa = coalesce(v_em_conversa, 0),
      total_aquecido = coalesce(v_aquecido, 0),
      total_quente = coalesce(v_quente, 0),
      total_convertido = coalesce(v_convertido, 0),
      updated_at = now()
  WHERE id = p_campanha_id;

  RETURN jsonb_build_object(
    'total_lista', v_total,
    'adicionados', v_inserted,
    'nao_adicionados', greatest(v_total - v_inserted, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adicionar_lista_estrategia(uuid, uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adicionar_lista_estrategia(uuid, uuid, uuid)
  TO authenticated;
