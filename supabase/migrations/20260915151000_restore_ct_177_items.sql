-- Recupera os itens do CT 177/2025 a partir do último snapshot íntegro da
-- auditoria (30/03/2026). O bloco é idempotente e não sobrescreve dados novos.
DO $$
DECLARE
  v_contrato_id uuid := '767e5abf-4909-402a-b830-62ef8366bbd9';
  v_existing_count integer;
  v_restored_count integer;
BEGIN
  SELECT count(*)::integer
    INTO v_existing_count
    FROM public.contrato_itens
   WHERE contrato_id = v_contrato_id;

  IF v_existing_count = 0 THEN
    INSERT INTO public.contrato_itens (id, contrato_id, item, valor_item, quantidade)
    VALUES
      ('3560b3cd-09e7-4b6c-988e-57645ef952da', v_contrato_id, '1 MÉDICO PLANTONISTA – ANESTESIOLOGISTA - 12HRS/DIA  07H-19H (SEGUNDA À SEXTA, CONSIDERANDO 23 DIAS)', 237, 276),
      ('393f004f-d574-478e-962c-512eee32b278', v_contrato_id, '1 MÉDICO PLANTONISTA – ANESTESIOLOGISTA - 12HRS/NOTURNO 19H -07H (SOBREAVISO - TODOS OS DIAS DA SEMANA)', 85, 372),
      ('6aa147a1-6bcd-448e-9f4d-eeb4d5aef150', v_contrato_id, '1 MÉDICO PLANTONISTA DIURNO – ANESTESIOLOGISTA - 12HRS/DIA  07H-19H - (TODOS OS DIAS DA SEMANA)', 237.5, 372),
      ('9b43c87c-6d78-4191-9d8d-00ab5542b4d3', v_contrato_id, 'Consulta Ambulatorial', 99, 100),
      ('59bc36cb-9a78-4021-b075-bb7174c8e1dd', v_contrato_id, 'Consultas na especialidade de CARDIOLOGIA', 85, 1),
      ('a7832ee1-8e93-43df-9112-df8501b13654', v_contrato_id, 'Consultas na especialidade de CARDIOLOGIA - 1º retorno', 85, 1),
      ('e64ba5bc-e7d2-40aa-9a86-e64657a87a7b', v_contrato_id, 'Consultas na especialidade de CARDIOLOGIA - 2º retorno', 40, 1),
      ('ce99a9dc-a521-4d65-b105-4155a41f4141', v_contrato_id, 'Medico RT/Coordenador', 10000, 1),
      ('39ba185a-1cd6-40a7-adde-d8bd046b93ca', v_contrato_id, 'sobreaviso de Cardiologia, em caráter de telemedicina', 18000, 1);

    GET DIAGNOSTICS v_restored_count = ROW_COUNT;

    PERFORM public.log_auditoria(
      'Contratos',
      'contrato_itens',
      'restaurar_itens',
      v_contrato_id::text,
      'Contrato CT 177/2025',
      jsonb_build_object('quantidade_itens', 0, 'itens', '(nenhum)'),
      jsonb_build_object('quantidade_itens', v_restored_count, 'valor_total', 223492, 'itens', 'Snapshot de 30/03/2026 restaurado'),
      ARRAY['quantidade_itens', 'valor_total', 'itens'],
      'Restaurou itens do contrato a partir do snapshot de auditoria',
      NULL,
      'Sistema'
    );
  END IF;
END;
$$;
