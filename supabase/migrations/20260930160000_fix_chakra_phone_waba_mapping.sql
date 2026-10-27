-- O Embedded Signup pode retornar números de vários WABAs no mesmo plugin.
-- O número 1179260535268840 veio com phone.waba=987580980748042;
-- o cadastro anterior usou o primeiro WABA da lista (1701305377585648).
-- A atualização condicional limita a correção ao registro afetado.
BEGIN;

UPDATE public.whatsapp_chakra_connections
SET waba_id = '987580980748042',
    provider_payload = jsonb_set(provider_payload, '{wabaId}', '"987580980748042"'::jsonb, true),
    updated_at = now()
WHERE phone_number_id = '1179260535268840'
  AND waba_id = '1701305377585648'
  AND provider_payload->'phone'->>'waba' = '987580980748042';

UPDATE public.whatsapp_official_senders
SET chakra_waba_id = '987580980748042',
    provider_payload = jsonb_set(provider_payload, '{wabaId}', '"987580980748042"'::jsonb, true),
    updated_at = now()
WHERE id = '00acf2e4-4aff-41d9-91f5-a45034dfb9f0'
  AND chakra_phone_number_id = '1179260535268840'
  AND chakra_waba_id = '1701305377585648'
  AND provider_payload->'phone'->>'waba' = '987580980748042';

-- O outro número de prospecção do segundo portfólio sofreu o mesmo erro:
-- o WABA do próprio telefone é 1108596901697420, não o da Amni.
UPDATE public.whatsapp_chakra_connections
SET waba_id = '1108596901697420',
    provider_payload = jsonb_set(provider_payload, '{wabaId}', '"1108596901697420"'::jsonb, true),
    updated_at = now()
WHERE phone_number_id = '1316919421507205'
  AND waba_id = '286031407919518'
  AND provider_payload->'phone'->>'waba' = '1108596901697420';

UPDATE public.whatsapp_official_senders
SET chakra_waba_id = '1108596901697420',
    provider_payload = jsonb_set(provider_payload, '{wabaId}', '"1108596901697420"'::jsonb, true),
    updated_at = now()
WHERE chakra_phone_number_id = '1316919421507205'
  AND chakra_waba_id = '286031407919518'
  AND provider_payload->'phone'->>'waba' = '1108596901697420';

COMMIT;
