DO $$
DECLARE
  v_user_id uuid := '1791105a-2b6e-4538-b193-84b97911803a';
  v_lista_id uuid;
  v_lead_id uuid;
  v_item_id uuid;
BEGIN
  IF NOT public.can_manage_disparo_listas(v_user_id) THEN
    RAISE EXCEPTION 'Usuário de teste não tem permissão de disparo';
  END IF;

  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  INSERT INTO public.disparo_listas (
    nome,
    descricao,
    excluir_blacklist,
    created_by,
    created_by_nome,
    modo
  ) VALUES (
    '__TESTE_IMPORTACAO_DISPARO__',
    'Teste temporário de permissão para importação por planilha',
    true,
    v_user_id,
    'Ester Perão',
    'manual'
  )
  RETURNING id INTO v_lista_id;

  INSERT INTO public.leads (
    nome,
    phone_e164,
    especialidade,
    uf,
    origem,
    status
  ) VALUES (
    '__TESTE_IMPORTACAO_DISPARO_LEAD__',
    '5511999990000',
    'Teste',
    'SP',
    'Teste interno importação planilha',
    'Novo'
  )
  RETURNING id INTO v_lead_id;

  INSERT INTO public.disparo_lista_itens (
    lista_id,
    lead_id,
    added_by
  ) VALUES (
    v_lista_id,
    v_lead_id,
    v_user_id
  )
  RETURNING id INTO v_item_id;

  EXECUTE 'RESET ROLE';

  DELETE FROM public.disparo_lista_itens WHERE id = v_item_id;
  DELETE FROM public.disparo_listas WHERE id = v_lista_id;
  DELETE FROM public.leads WHERE id = v_lead_id;

  RAISE NOTICE 'TESTE_OK importação disparo: lista %, lead %, item % criados e removidos', v_lista_id, v_lead_id, v_item_id;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    EXECUTE 'RESET ROLE';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF v_item_id IS NOT NULL THEN
    DELETE FROM public.disparo_lista_itens WHERE id = v_item_id;
  END IF;
  IF v_lista_id IS NOT NULL THEN
    DELETE FROM public.disparo_listas WHERE id = v_lista_id;
  END IF;
  IF v_lead_id IS NOT NULL THEN
    DELETE FROM public.leads WHERE id = v_lead_id;
  END IF;

  RAISE;
END $$;