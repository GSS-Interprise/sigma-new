
-- Batch 3: Match com prefixo +55 (phone_e164 = '+55' || contact_phone)
UPDATE sigzap_conversations sc
SET lead_id = l.id
FROM sigzap_contacts c, leads l
WHERE c.id = sc.contact_id
  AND sc.lead_id IS NULL
  AND l.phone_e164 = '+55' || c.contact_phone;
