
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM public.test_automacao_kanban() LOOP
    RAISE NOTICE '[TEST] % → %', r.cenario, r.resultado;
  END LOOP;
END $$;
