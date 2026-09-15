-- Impede que a edição de um contrato deixe os itens vazios por uma falha
-- entre o DELETE e o INSERT. A troca inteira acontece na mesma transação.
CREATE OR REPLACE FUNCTION public.replace_contrato_itens_atomic(
  p_contrato_id uuid,
  p_itens jsonb,
  p_confirmar_vazio boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_old_count integer;
  v_new_count integer;
  v_old_total numeric;
  v_new_total numeric;
  v_old_names text;
  v_new_names text;
BEGIN
  IF v_user_id IS NULL OR NOT (
    is_admin(v_user_id)
    OR has_role(v_user_id, 'gestor_contratos')
    OR has_role(v_user_id, 'gestor_captacao')
  ) THEN
    RAISE EXCEPTION 'Usuário não autorizado a editar itens de contrato'
      USING ERRCODE = '42501';
  END IF;

  IF p_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Contrato obrigatório';
  END IF;

  IF jsonb_typeof(p_itens) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Os itens do contrato devem ser enviados como uma lista';
  END IF;

  -- Bloqueia o contrato durante a troca e impede uma limpeza acidental.
  PERFORM 1
    FROM public.contratos
   WHERE id = p_contrato_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato não encontrado';
  END IF;

  SELECT
    count(*)::integer,
    coalesce(sum(valor_item * coalesce(quantidade, 1)), 0),
    coalesce(string_agg(item, ', ' ORDER BY item), '(nenhum)')
  INTO v_old_count, v_old_total, v_old_names
  FROM public.contrato_itens
  WHERE contrato_id = p_contrato_id;

  IF v_old_count > 0 AND jsonb_array_length(p_itens) = 0 AND NOT p_confirmar_vazio THEN
    RAISE EXCEPTION 'A operação removeria todos os itens existentes; confirme explicitamente para continuar'
      USING ERRCODE = '23514';
  END IF;

  -- Validação sem casts inseguros: valores inválidos são rejeitados antes do INSERT.
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_itens) AS item
     WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
        OR nullif(btrim(item->>'item'), '') IS NULL
        OR (item->>'valor_item') !~ '^([0-9]+)(\.[0-9]+)?$'
        OR (item->>'quantidade') IS NOT NULL
           AND (item->>'quantidade') !~ '^[0-9]{1,9}$'
        -- Só fazemos casts depois de confirmar o formato; assim uma carga
        -- inválida não consegue abortar a transação com erro de conversão.
        OR CASE
             WHEN (item->>'quantidade') ~ '^[0-9]{1,9}$'
               THEN (item->>'quantidade')::integer <= 0
             ELSE false
           END
        OR CASE
             WHEN (item->>'valor_item') ~ '^([0-9]+)(\.[0-9]+)?$'
               THEN (item->>'valor_item')::numeric <= 0
             ELSE false
           END
  ) THEN
    RAISE EXCEPTION 'Item inválido: informe descrição, valor positivo e quantidade inteira positiva';
  END IF;

  DELETE FROM public.contrato_itens
   WHERE contrato_id = p_contrato_id;

  INSERT INTO public.contrato_itens (contrato_id, item, valor_item, quantidade)
  SELECT
    p_contrato_id,
    btrim(item->>'item'),
    (item->>'valor_item')::numeric,
    coalesce((item->>'quantidade')::integer, 1)
  FROM (
    SELECT DISTINCT ON (
      btrim(value->>'item'),
      (value->>'valor_item')::numeric,
      coalesce((value->>'quantidade')::integer, 1)
    ) value AS item
    FROM jsonb_array_elements(p_itens)
    ORDER BY
      btrim(value->>'item'),
      (value->>'valor_item')::numeric,
      coalesce((value->>'quantidade')::integer, 1)
  ) AS deduplicated;

  SELECT
    count(*)::integer,
    coalesce(sum(valor_item * coalesce(quantidade, 1)), 0),
    coalesce(string_agg(item, ', ' ORDER BY item), '(nenhum)')
  INTO v_new_count, v_new_total, v_new_names
  FROM public.contrato_itens
  WHERE contrato_id = p_contrato_id;

  PERFORM public.log_auditoria(
    'Contratos',
    'contrato_itens',
    'editar',
    p_contrato_id::text,
    'Contrato ' || coalesce((SELECT codigo_contrato FROM public.contratos WHERE id = p_contrato_id), p_contrato_id::text),
    jsonb_build_object('quantidade_itens', v_old_count, 'valor_total', v_old_total, 'itens', v_old_names),
    jsonb_build_object('quantidade_itens', v_new_count, 'valor_total', v_new_total, 'itens', v_new_names),
    ARRAY['quantidade_itens', 'valor_total', 'itens'],
    'Alterou itens do contrato em operação atômica'
  );

  RETURN jsonb_build_object(
    'contrato_id', p_contrato_id,
    'quantidade_itens', v_new_count,
    'valor_total', v_new_total
  );
END;
$$;

COMMENT ON FUNCTION public.replace_contrato_itens_atomic(uuid, jsonb, boolean)
  IS 'Substitui os itens de um contrato em uma única transação e exige confirmação para limpeza total.';

GRANT EXECUTE ON FUNCTION public.replace_contrato_itens_atomic(uuid, jsonb, boolean) TO authenticated;

-- A atividade do contrato precisa localizar os logs automáticos pelos dados do
-- item (o trigger grava o ID do item, não o ID do contrato).
CREATE OR REPLACE FUNCTION public.get_contrato_item_auditoria(p_contrato_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT (
    is_admin(v_user_id)
    OR has_role(v_user_id, 'gestor_contratos')
    OR has_role(v_user_id, 'gestor_captacao')
    OR has_role(v_user_id, 'gestor_financeiro')
    OR has_role(v_user_id, 'diretoria')
    OR has_role(v_user_id, 'coordenador_escalas')
  ) THEN
    RAISE EXCEPTION 'Usuário não autorizado a consultar atividades do contrato'
      USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(
      jsonb_agg(to_jsonb(log) ORDER BY log.created_at DESC),
      '[]'::jsonb
    )
    FROM public.auditoria_logs AS log
    WHERE log.tabela = 'contrato_itens'
      AND (
        log.registro_id = p_contrato_id::text
        OR log.dados_antigos->>'contrato_id' = p_contrato_id::text
        OR log.dados_novos->>'contrato_id' = p_contrato_id::text
        OR log.detalhes ILIKE '%' || p_contrato_id::text || '%'
      )
  );
END;
$$;

COMMENT ON FUNCTION public.get_contrato_item_auditoria(uuid)
  IS 'Retorna auditoria do contrato e dos itens, incluindo logs automáticos gravados com o ID do item.';

GRANT EXECUTE ON FUNCTION public.get_contrato_item_auditoria(uuid) TO authenticated;
