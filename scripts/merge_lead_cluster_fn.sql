CREATE OR REPLACE FUNCTION merge_lead_cluster(
  p_canonical_id UUID,
  p_duplicate_id UUID,
  p_batch_tag TEXT DEFAULT 'manual'
) RETURNS JSONB AS $$
DECLARE
  v_canonical leads%ROWTYPE;
  v_duplicate leads%ROWTYPE;
  v_result JSONB := '{}'::jsonb;
  v_moved INT;
BEGIN
  SELECT * INTO v_canonical FROM leads WHERE id = p_canonical_id FOR UPDATE;
  SELECT * INTO v_duplicate FROM leads WHERE id = p_duplicate_id FOR UPDATE;

  IF v_canonical.id IS NULL THEN
    RAISE EXCEPTION 'Canonical lead % not found', p_canonical_id;
  END IF;
  IF v_duplicate.id IS NULL THEN
    RAISE EXCEPTION 'Duplicate lead % not found', p_duplicate_id;
  END IF;
  IF v_duplicate.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate lead % already merged', p_duplicate_id;
  END IF;
  IF v_canonical.merged_into_id IS NOT NULL THEN
    RAISE EXCEPTION 'Canonical lead % is already merged into another', p_canonical_id;
  END IF;
  IF p_canonical_id = p_duplicate_id THEN
    RAISE EXCEPTION 'Canonical and duplicate cannot be the same';
  END IF;

  -- 0. Free the duplicate's chave_unica (trigger skips recalc because cpf/nome/data_nascimento unchanged)
  UPDATE leads SET chave_unica = NULL WHERE id = p_duplicate_id;

  -- 1. Merge scalar fields (only fill NULLs in canonical)
  UPDATE leads SET
    cpf              = COALESCE(cpf, v_duplicate.cpf),
    email            = COALESCE(email, v_duplicate.email),
    crm              = COALESCE(crm, v_duplicate.crm),
    rqe              = COALESCE(rqe, v_duplicate.rqe),
    especialidade    = COALESCE(especialidade, v_duplicate.especialidade),
    especialidade_id = COALESCE(especialidade_id, v_duplicate.especialidade_id),
    cnpj             = COALESCE(cnpj, v_duplicate.cnpj),
    endereco         = COALESCE(endereco, v_duplicate.endereco),
    cep              = COALESCE(cep, v_duplicate.cep),
    cidade           = COALESCE(cidade, v_duplicate.cidade),
    uf               = COALESCE(uf, v_duplicate.uf),
    data_nascimento  = COALESCE(data_nascimento, v_duplicate.data_nascimento),
    data_formatura   = COALESCE(data_formatura, v_duplicate.data_formatura),
    updated_at       = NOW()
  WHERE id = p_canonical_id;

  -- 2. Merge array fields (union, de-duplicated)
  -- phone_e164 dos dois: se forem números diferentes (ignorando +), adicionar ao telefones_adicionais
  -- email dos dois: se forem diferentes (case-insensitive), adicionar ao emails_adicionais
  UPDATE leads SET
    telefones_adicionais = (
      SELECT ARRAY(
        SELECT DISTINCT t FROM unnest(
          COALESCE(telefones_adicionais, '{}'::text[])
          || COALESCE(v_duplicate.telefones_adicionais, '{}'::text[])
          || CASE
               WHEN v_duplicate.phone_e164 IS NOT NULL
                AND regexp_replace(v_duplicate.phone_e164, '[^0-9]', '', 'g')
                 != regexp_replace(COALESCE(phone_e164, ''), '[^0-9]', '', 'g')
               THEN ARRAY[v_duplicate.phone_e164]
               ELSE '{}'::text[]
             END
        ) AS t
        WHERE t IS NOT NULL AND t <> ''
      )
    ),
    emails_adicionais = (
      SELECT ARRAY(
        SELECT DISTINCT e FROM unnest(
          COALESCE(emails_adicionais, '{}'::text[])
          || COALESCE(v_duplicate.emails_adicionais, '{}'::text[])
          || CASE
               WHEN v_duplicate.email IS NOT NULL
                AND LOWER(v_duplicate.email) <> LOWER(COALESCE(email, ''))
               THEN ARRAY[v_duplicate.email]
               ELSE '{}'::text[]
             END
        ) AS e
        WHERE e IS NOT NULL AND e <> ''
      )
    ),
    tags = (
      SELECT ARRAY(
        SELECT DISTINCT t FROM unnest(
          COALESCE(tags, '{}'::text[]) || COALESCE(v_duplicate.tags, '{}'::text[])
        ) AS t
        WHERE t IS NOT NULL AND t <> ''
      )
    )
  WHERE id = p_canonical_id;

  -- 3. Re-point FKs in all 12 child tables (log before moving)

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'disparos_contatos', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM disparos_contatos WHERE lead_id = p_duplicate_id;
  UPDATE disparos_contatos SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('disparos_contatos', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'lead_historico', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM lead_historico WHERE lead_id = p_duplicate_id;
  UPDATE lead_historico SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('lead_historico', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'lead_anotacoes', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM lead_anotacoes WHERE lead_id = p_duplicate_id;
  UPDATE lead_anotacoes SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('lead_anotacoes', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'lead_anexos', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM lead_anexos WHERE lead_id = p_duplicate_id;
  UPDATE lead_anexos SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('lead_anexos', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'medicos', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM medicos WHERE lead_id = p_duplicate_id;
  UPDATE medicos SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('medicos', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'email_contatos', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM email_contatos WHERE lead_id = p_duplicate_id;
  UPDATE email_contatos SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('email_contatos', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'email_interacoes', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM email_interacoes WHERE lead_id = p_duplicate_id;
  UPDATE email_interacoes SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('email_interacoes', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'proposta', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM proposta WHERE lead_id = p_duplicate_id;
  UPDATE proposta SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('proposta', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'banco_interesse_leads', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM banco_interesse_leads WHERE lead_id = p_duplicate_id;
  UPDATE banco_interesse_leads SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('banco_interesse_leads', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'sigzap_conversations', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM sigzap_conversations WHERE lead_id = p_duplicate_id;
  UPDATE sigzap_conversations SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('sigzap_conversations', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'leads_bloqueio_temporario', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM leads_bloqueio_temporario WHERE lead_id = p_duplicate_id;
  UPDATE leads_bloqueio_temporario SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('leads_bloqueio_temporario', v_moved);

  INSERT INTO lead_merge_log (tabela, registro_id, lead_id_anterior, lead_id_novo, merge_batch)
  SELECT 'import_leads_failed_queue', id::text, lead_id, p_canonical_id, p_batch_tag
  FROM import_leads_failed_queue WHERE lead_id = p_duplicate_id;
  UPDATE import_leads_failed_queue SET lead_id = p_canonical_id WHERE lead_id = p_duplicate_id;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('import_leads_failed_queue', v_moved);

  -- 4. Soft-delete: mark duplicate as merged
  UPDATE leads SET
    merged_into_id = p_canonical_id,
    merged_at      = NOW(),
    merge_reason   = p_batch_tag
  WHERE id = p_duplicate_id;

  v_result := v_result || jsonb_build_object(
    'canonical_id', p_canonical_id,
    'duplicate_id', p_duplicate_id,
    'success', true
  );
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;
