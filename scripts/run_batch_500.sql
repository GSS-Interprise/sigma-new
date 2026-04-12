-- Processa até 500 clusters pendentes em ordem (maior prioridade: mais filhos a mover)
DO $$
DECLARE
  rec RECORD;
  res JSONB;
  v_count INT := 0;
  v_errors INT := 0;
  v_err_msg TEXT;
BEGIN
  FOR rec IN
    SELECT cluster_id, canonical_id, duplicate_ids
    FROM merge_plan
    WHERE status = 'pending'
    ORDER BY duplicates_filhos DESC, cluster_id ASC
    LIMIT 500
  LOOP
    BEGIN
      res := merge_lead_cluster(
        rec.canonical_id,
        rec.duplicate_ids[1],
        'batch_phone_auto'
      );
      UPDATE merge_plan
      SET status = 'done', processed_at = NOW(), notes = res::text
      WHERE cluster_id = rec.cluster_id;
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      v_err_msg := SQLERRM;
      UPDATE merge_plan
      SET status = 'error', processed_at = NOW(), notes = v_err_msg
      WHERE cluster_id = rec.cluster_id;
    END;
  END LOOP;
  RAISE NOTICE 'Batch done: % processed, % errors', v_count, v_errors;
END $$;
