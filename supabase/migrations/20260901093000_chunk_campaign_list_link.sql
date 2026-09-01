-- Evita que a associação de listas grandes exceda o statement_timeout do Postgres.
-- A lista continua sendo registrada uma única vez, mas os leads são vinculados
-- à estratégia em blocos menores e idempotentes.
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
