-- A Evolution pode reenviar o mesmo evento e o catch-up também pode reencontrar
-- uma mensagem já materializada. A identidade técnica é conversa + wa_message_id.
-- Preservamos o registro mais completo e movemos referências antes de remover cópias.
CREATE TEMP TABLE _sigzap_duplicate_map ON COMMIT DROP AS
WITH ranked AS (
  SELECT
    id,
    conversation_id,
    wa_message_id,
    first_value(id) OVER (
      PARTITION BY conversation_id, wa_message_id
      ORDER BY
        (
          (raw_payload IS NOT NULL)::int +
          (client_message_id IS NOT NULL)::int +
          (media_storage_path IS NOT NULL)::int +
          (media_url IS NOT NULL)::int +
          (sent_by_user_id IS NOT NULL)::int +
          (sent_via_instance_name IS NOT NULL)::int
        ) DESC,
        created_at ASC NULLS LAST,
        id
    ) AS keep_id,
    row_number() OVER (
      PARTITION BY conversation_id, wa_message_id
      ORDER BY
        (
          (raw_payload IS NOT NULL)::int +
          (client_message_id IS NOT NULL)::int +
          (media_storage_path IS NOT NULL)::int +
          (media_url IS NOT NULL)::int +
          (sent_by_user_id IS NOT NULL)::int +
          (sent_via_instance_name IS NOT NULL)::int
        ) DESC,
        created_at ASC NULLS LAST,
        id
    ) AS duplicate_rank
  FROM public.sigzap_messages
  WHERE wa_message_id IS NOT NULL
)
SELECT id AS duplicate_id, keep_id
FROM ranked
WHERE duplicate_rank > 1;

UPDATE public.sigzap_outbox o
SET sigzap_message_id = d.keep_id,
    updated_at = now()
FROM _sigzap_duplicate_map d
WHERE o.sigzap_message_id = d.duplicate_id;

DELETE FROM public.sigzap_messages m
USING _sigzap_duplicate_map d
WHERE m.id = d.duplicate_id;

-- O índice parcial permite mensagens locais ainda sem recibo, mas impede que
-- webhook, outbox e catch-up materializem novamente o mesmo evento confirmado.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sigzap_messages_conversation_wa_id
  ON public.sigzap_messages (conversation_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;
