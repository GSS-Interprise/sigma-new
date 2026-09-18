-- Evita que um salvamento sem alteração seja registrado como exclusão e criação
-- dos itens do contrato. Também mantém a auditoria em um único evento agregado
-- quando a lista realmente muda.
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
  v_old_items jsonb;
  v_new_items jsonb;
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
    coalesce(string_agg(item, ', ' ORDER BY item), '(nenhum)'),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item', btrim(item),
          'valor_item', valor_item,
          'quantidade', coalesce(quantidade, 1)
        )
        ORDER BY btrim(item), valor_item, coalesce(quantidade, 1)
      ),
      '[]'::jsonb
    )
  INTO v_old_count, v_old_total, v_old_names, v_old_items
  FROM public.contrato_itens
  WHERE contrato_id = p_contrato_id;

  IF v_old_count > 0 AND jsonb_array_length(p_itens) = 0 AND NOT p_confirmar_vazio THEN
    RAISE EXCEPTION 'A operação removeria todos os itens existentes; confirme explicitamente para continuar'
      USING ERRCODE = '23514';
  END IF;

  -- Validação sem casts inseguros: valores inválidos são rejeitados antes do INSERT.
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(p_itens) AS raw(value)
     WHERE jsonb_typeof(raw.value) IS DISTINCT FROM 'object'
        OR nullif(btrim(raw.value->>'item'), '') IS NULL
        OR (raw.value->>'valor_item') !~ '^([0-9]+)(\.[0-9]+)?$'
        OR (raw.value->>'quantidade') IS NOT NULL
           AND (raw.value->>'quantidade') !~ '^[0-9]{1,9}$'
        OR CASE
             WHEN (raw.value->>'quantidade') ~ '^[0-9]{1,9}$'
               THEN (raw.value->>'quantidade')::integer <= 0
             ELSE false
           END
        OR CASE
             WHEN (raw.value->>'valor_item') ~ '^([0-9]+)(\.[0-9]+)?$'
               THEN (raw.value->>'valor_item')::numeric <= 0
             ELSE false
           END
  ) THEN
    RAISE EXCEPTION 'Item inválido: informe descrição, valor positivo e quantidade inteira positiva';
  END IF;

  -- Normaliza e deduplica a entrada exatamente como a gravação fará.
  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item', normalized.item,
        'valor_item', normalized.valor_item,
        'quantidade', normalized.quantidade
      )
      ORDER BY normalized.item, normalized.valor_item, normalized.quantidade
    ),
    '[]'::jsonb
  )
  INTO v_new_items
  FROM (
    SELECT DISTINCT ON (
      btrim(raw.value->>'item'),
      (raw.value->>'valor_item')::numeric,
      coalesce((raw.value->>'quantidade')::integer, 1)
    )
      btrim(raw.value->>'item') AS item,
      (raw.value->>'valor_item')::numeric AS valor_item,
      coalesce((raw.value->>'quantidade')::integer, 1) AS quantidade
    FROM jsonb_array_elements(p_itens) AS raw(value)
    ORDER BY
      btrim(raw.value->>'item'),
      (raw.value->>'valor_item')::numeric,
      coalesce((raw.value->>'quantidade')::integer, 1)
  ) AS normalized;

  SELECT
    jsonb_array_length(v_new_items)::integer,
    coalesce(
      (
        SELECT sum((entry->>'valor_item')::numeric * (entry->>'quantidade')::integer)
        FROM jsonb_array_elements(v_new_items) AS entry
      ),
      0
    ),
    coalesce(
      (
        SELECT string_agg(entry->>'item', ', ' ORDER BY entry->>'item')
        FROM jsonb_array_elements(v_new_items) AS entry
      ),
      '(nenhum)'
    )
  INTO v_new_count, v_new_total, v_new_names;

  -- Salvar/abrir sem mudança não toca nas linhas e não cria atividade falsa.
  IF v_old_items = v_new_items THEN
    RETURN jsonb_build_object(
      'contrato_id', p_contrato_id,
      'quantidade_itens', v_old_count,
      'valor_total', v_old_total,
      'alterado', false
    );
  END IF;

  -- A troca continua atômica, mas os gatilhos de linha não devem aparecer como
  -- ações manuais. O evento agregado abaixo é a fonte de auditoria da operação.
  PERFORM set_config('app.skip_contrato_itens_audit', 'on', true);

  DELETE FROM public.contrato_itens
   WHERE contrato_id = p_contrato_id;

  INSERT INTO public.contrato_itens (contrato_id, item, valor_item, quantidade)
  SELECT
    p_contrato_id,
    entry->>'item',
    (entry->>'valor_item')::numeric,
    (entry->>'quantidade')::integer
  FROM jsonb_array_elements(v_new_items) AS entry;

  PERFORM set_config('app.skip_contrato_itens_audit', 'off', true);

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
    'valor_total', v_new_total,
    'alterado', true
  );
END;
$$;

COMMENT ON FUNCTION public.replace_contrato_itens_atomic(uuid, jsonb, boolean)
  IS 'Substitui itens com proteção contra limpeza acidental, sem auditar salvamentos sem mudança.';

GRANT EXECUTE ON FUNCTION public.replace_contrato_itens_atomic(uuid, jsonb, boolean) TO authenticated;

-- O trigger genérico continua registrando alterações diretas. Apenas a troca
-- controlada acima usa a flag transacional para evitar eventos por linha.
CREATE OR REPLACE FUNCTION public.trigger_auditoria()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_modulo TEXT;
  v_campos_alterados TEXT[];
  v_key TEXT;
BEGIN
  IF TG_TABLE_NAME = 'contrato_itens'
     AND current_setting('app.skip_contrato_itens_audit', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  v_modulo := CASE TG_TABLE_NAME
    WHEN 'contratos' THEN 'Contratos'
    WHEN 'contrato_itens' THEN 'Contratos'
    WHEN 'contrato_renovacoes' THEN 'Contratos'
    WHEN 'contratos_medico' THEN 'Contratos'
    WHEN 'medicos' THEN 'Médicos'
    WHEN 'medico_vinculo_unidade' THEN 'Médicos'
    WHEN 'clientes' THEN 'Clientes'
    WHEN 'unidades' THEN 'Clientes'
    WHEN 'licitacoes' THEN 'Licitações'
    WHEN 'disparos_log' THEN 'Disparos'
    WHEN 'disparos_programados' THEN 'Disparos'
    WHEN 'campanhas' THEN 'Marketing'
    WHEN 'marketing_leads' THEN 'Marketing'
    WHEN 'suporte_tickets' THEN 'Suporte'
    WHEN 'patrimonio' THEN 'Patrimônio'
    WHEN 'escalas' THEN 'Escalas'
    WHEN 'profiles' THEN 'Configurações'
    WHEN 'user_roles' THEN 'Configurações'
    WHEN 'permissoes' THEN 'Configurações'
    ELSE 'Sistema'
  END;

  IF TG_OP = 'INSERT' THEN
    PERFORM log_auditoria(
      v_modulo, TG_TABLE_NAME, 'INSERT', NEW.id::text, NULL, NULL,
      to_jsonb(NEW), NULL, 'Registro criado'
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    FOR v_key IN SELECT jsonb_object_keys(to_jsonb(NEW))
    LOOP
      IF to_jsonb(OLD) ->> v_key IS DISTINCT FROM to_jsonb(NEW) ->> v_key THEN
        v_campos_alterados := array_append(v_campos_alterados, v_key);
      END IF;
    END LOOP;

    IF array_length(v_campos_alterados, 1) > 0 THEN
      PERFORM log_auditoria(
        v_modulo, TG_TABLE_NAME, 'UPDATE', NEW.id::text, NULL,
        to_jsonb(OLD), to_jsonb(NEW), v_campos_alterados,
        'Registro atualizado'
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_auditoria(
      v_modulo, TG_TABLE_NAME, 'DELETE', OLD.id::text, NULL,
      to_jsonb(OLD), NULL, NULL, 'Registro excluído'
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

-- Oculta da atividade os pares históricos de substituição técnica que já foram
-- gravados como DELETE + INSERT do mesmo item em até dois segundos, preservando
-- os logs individuais de exclusões e inclusões reais.
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
      AND NOT (
        log.acao IN ('DELETE', 'INSERT')
        AND log.detalhes IN ('Registro excluído', 'Registro criado')
        AND EXISTS (
          SELECT 1
          FROM public.auditoria_logs AS par
          WHERE par.tabela = 'contrato_itens'
            AND par.id <> log.id
            AND par.acao = CASE WHEN log.acao = 'DELETE' THEN 'INSERT' ELSE 'DELETE' END
            AND par.created_at BETWEEN log.created_at - interval '2 seconds'
                                   AND log.created_at + interval '2 seconds'
            AND par.usuario_id IS NOT DISTINCT FROM log.usuario_id
            AND coalesce(par.dados_antigos->>'contrato_id', par.dados_novos->>'contrato_id')
                IS NOT DISTINCT FROM coalesce(log.dados_antigos->>'contrato_id', log.dados_novos->>'contrato_id')
            AND (
              CASE WHEN par.acao = 'DELETE' THEN par.dados_antigos->>'item' ELSE par.dados_novos->>'item' END
            ) IS NOT DISTINCT FROM (
              CASE WHEN log.acao = 'DELETE' THEN log.dados_antigos->>'item' ELSE log.dados_novos->>'item' END
            )
            AND (
              CASE WHEN par.acao = 'DELETE' THEN par.dados_antigos->>'valor_item' ELSE par.dados_novos->>'valor_item' END
            ) IS NOT DISTINCT FROM (
              CASE WHEN log.acao = 'DELETE' THEN log.dados_antigos->>'valor_item' ELSE log.dados_novos->>'valor_item' END
            )
            AND coalesce(
              CASE WHEN par.acao = 'DELETE' THEN par.dados_antigos->>'quantidade' ELSE par.dados_novos->>'quantidade' END,
              '1'
            ) = coalesce(
              CASE WHEN log.acao = 'DELETE' THEN log.dados_antigos->>'quantidade' ELSE log.dados_novos->>'quantidade' END,
              '1'
            )
        )
      )
  );
END;
$$;

COMMENT ON FUNCTION public.get_contrato_item_auditoria(uuid)
  IS 'Retorna atividades reais dos itens e oculta pares históricos de substituição técnica sem alteração.';

GRANT EXECUTE ON FUNCTION public.get_contrato_item_auditoria(uuid) TO authenticated;
