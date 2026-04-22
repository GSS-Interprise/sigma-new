-- Backfill de canal "whatsapp" aberto na cascata para leads que já foram contactados
-- antes da implementação do sistema de raias. Usa a data real do envio quando
-- disponível; caso contrário, usa hoje às 09:00 como fallback.

CREATE OR REPLACE FUNCTION public.backfill_cascata_contactados(_campanha_proposta_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inseridos integer := 0;
  fallback_ts timestamptz := date_trunc('day', now()) + interval '9 hours';
  lista uuid;
BEGIN
  SELECT lista_id INTO lista FROM campanha_propostas WHERE id = _campanha_proposta_id;

  WITH leads_lista AS (
    SELECT DISTINCT lead_id
    FROM disparo_lista_itens
    WHERE lista_id = lista AND lead_id IS NOT NULL
  ),
  ja_tem_canal AS (
    SELECT DISTINCT lead_id
    FROM campanha_proposta_lead_canais
    WHERE campanha_proposta_id = _campanha_proposta_id
  ),
  ts_envio_manual AS (
    SELECT lead_id, MAX(created_at) AS ts
    FROM disparo_manual_envios
    WHERE campanha_proposta_id = _campanha_proposta_id
      AND (status IS NULL OR status = 'enviado')
    GROUP BY lead_id
  ),
  ts_disparos_contatos AS (
    SELECT lead_id, MAX(updated_at) AS ts
    FROM disparos_contatos
    WHERE campanha_proposta_id = _campanha_proposta_id
      AND status IN ('3-TRATANDO', '4-ENVIADO')
    GROUP BY lead_id
  ),
  ts_sigzap AS (
    SELECT c.lead_id, MAX(COALESCE(m.sent_at, m.created_at)) AS ts
    FROM sigzap_conversations c
    JOIN sigzap_messages m ON m.conversation_id = c.id
    WHERE m.from_me = true AND c.lead_id IS NOT NULL
    GROUP BY c.lead_id
  ),
  candidatos AS (
    SELECT
      ll.lead_id,
      GREATEST(
        COALESCE(em.ts, 'epoch'::timestamptz),
        COALESCE(dc.ts, 'epoch'::timestamptz),
        COALESCE(sz.ts, 'epoch'::timestamptz)
      ) AS ts_max,
      (em.ts IS NOT NULL OR dc.ts IS NOT NULL OR sz.ts IS NOT NULL) AS tem_contato
    FROM leads_lista ll
    LEFT JOIN ja_tem_canal jc ON jc.lead_id = ll.lead_id
    LEFT JOIN ts_envio_manual em ON em.lead_id = ll.lead_id
    LEFT JOIN ts_disparos_contatos dc ON dc.lead_id = ll.lead_id
    LEFT JOIN ts_sigzap sz ON sz.lead_id = ll.lead_id
    WHERE jc.lead_id IS NULL
      AND (em.ts IS NOT NULL OR dc.ts IS NOT NULL OR sz.ts IS NOT NULL)
  )
  INSERT INTO campanha_proposta_lead_canais (
    campanha_proposta_id, lead_id, canal, entrou_em, status_final
  )
  SELECT
    _campanha_proposta_id,
    lead_id,
    'whatsapp',
    CASE WHEN ts_max > 'epoch'::timestamptz THEN ts_max ELSE fallback_ts END,
    'aberto'
  FROM candidatos;

  GET DIAGNOSTICS inseridos = ROW_COUNT;
  RETURN inseridos;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_cascata_contactados(uuid) TO authenticated, anon, service_role;

-- Executa para TODAS as propostas existentes
DO $$
DECLARE
  prop record;
  total integer := 0;
  qtd integer;
BEGIN
  FOR prop IN SELECT id FROM campanha_propostas LOOP
    SELECT public.backfill_cascata_contactados(prop.id) INTO qtd;
    total := total + qtd;
  END LOOP;
  RAISE NOTICE 'Backfill total: % linhas inseridas', total;
END $$;