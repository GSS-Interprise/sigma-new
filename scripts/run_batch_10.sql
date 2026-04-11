DO $$
DECLARE
  rec RECORD;
  res JSONB;
BEGIN
  FOR rec IN
    SELECT cluster_id, canonical_id, duplicate_ids
    FROM merge_plan
    WHERE cluster_id IN (3107, 2, 72, 3518, 3710, 3075, 2737, 3023, 160, 1645)
      AND status = 'pending'
  LOOP
    res := merge_lead_cluster(
      rec.canonical_id,
      rec.duplicate_ids[1],
      'batch_10_test_' || rec.cluster_id
    );
    UPDATE merge_plan
    SET status = 'done', processed_at = NOW(), notes = res::text
    WHERE cluster_id = rec.cluster_id;
  END LOOP;
END $$;
