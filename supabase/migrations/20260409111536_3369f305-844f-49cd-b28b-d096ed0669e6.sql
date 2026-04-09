BEGIN;

DELETE FROM public.blacklist
WHERE regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g') = '5547999758708';

UPDATE public.leads_bloqueio_temporario
SET removed_at = now()
WHERE lead_id = 'a01942e2-7b3e-4cd7-8c09-43fb6d66a308'
  AND removed_at IS NULL;

DELETE FROM public.disparos_historico_contatos
WHERE regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = '5547999758708'
   OR lower(coalesce(email, '')) = 'oi@gmail.com';

DELETE FROM public.disparos_contatos
WHERE lead_id = 'a01942e2-7b3e-4cd7-8c09-43fb6d66a308'
   OR regexp_replace(coalesce(telefone_e164, ''), '\D', '', 'g') = '5547999758708'
   OR regexp_replace(coalesce(telefone_original, ''), '\D', '', 'g') = '5547999758708';

DELETE FROM public.email_contatos
WHERE lower(coalesce(email, '')) = 'oi@gmail.com';

UPDATE public.medicos
SET phone_e164 = NULL,
    updated_at = now()
WHERE id = '7ed461d9-1ba0-4be1-a45a-902d71135404'
  AND lead_id = 'a18f749d-c326-4257-b61c-c4cf4d902d62'
  AND regexp_replace(coalesce(phone_e164, ''), '\D', '', 'g') = '5547999758708';

COMMIT;