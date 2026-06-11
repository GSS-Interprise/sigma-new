-- Conversão da campanha "Anestesiologia - Guaramirim/SC" de IA -> Manual (11/06).
-- A equipe tratava como manual mas estava como tipo_envio='ia' (criada no default
-- do wizard). Sem tasks, sem fluxo manual. Aqui converte com segurança:
--   1. tipo_envio -> manual (guards de IA já cobrem: batch-watcher, cadencia-processor,
--      disparo-processor, receive-whatsapp-messages todos pulam manual).
--   2. limpa proximo_touch_em (corta qualquer cadência IA pendente).
--   3. backfill das tasks (cadência padrão de 6 passos, igual ao trigger de INSERT).
--   4. 50 leads já contatados pela IA: marca o 1º contato (ordem 1) como 'feita'
--      pra equipe não reenviar. Os 90 frios ficam com tudo pendente (Pendentes).
-- Campanha: c8fac22e-e6a0-44ec-984d-486bc28d1c1b (140 leads: 90 frio + 50 contatado).

-- 1. converte
UPDATE campanhas
SET tipo_envio = 'manual', updated_at = now()
WHERE id = 'c8fac22e-e6a0-44ec-984d-486bc28d1c1b' AND tipo_envio = 'ia';

-- 2. corta cadência IA pendente
UPDATE campanha_leads
SET proximo_touch_em = NULL, proximo_passo_id = NULL
WHERE campanha_id = 'c8fac22e-e6a0-44ec-984d-486bc28d1c1b' AND proximo_touch_em IS NOT NULL;

-- 3. backfill tasks (cadência padrão — mesma do trigger tg_campanha_leads_generate_tasks)
INSERT INTO campanha_lead_tasks (campanha_lead_id, tipo, rotulo, ordem, prazo_at)
SELECT cl.id,
       elem->>'canal',
       COALESCE(NULLIF(elem->>'rotulo', ''), initcap(elem->>'canal')),
       (elem->>'ordem')::int,
       now() + ((elem->>'dia_offset')::int || ' days')::interval
FROM campanha_leads cl,
     jsonb_array_elements('[
       {"ordem":1,"canal":"whatsapp","rotulo":"WhatsApp #1","dia_offset":0},
       {"ordem":2,"canal":"whatsapp","rotulo":"WhatsApp #2","dia_offset":1},
       {"ordem":3,"canal":"email","rotulo":"Email","dia_offset":2},
       {"ordem":4,"canal":"whatsapp","rotulo":"WhatsApp #3","dia_offset":4},
       {"ordem":5,"canal":"instagram","rotulo":"Instagram","dia_offset":6},
       {"ordem":6,"canal":"ligacao","rotulo":"Ligar","dia_offset":8}
     ]'::jsonb) elem
WHERE cl.campanha_id = 'c8fac22e-e6a0-44ec-984d-486bc28d1c1b'
ON CONFLICT (campanha_lead_id, ordem) DO NOTHING;

-- 4. 1º contato já feito pela IA nos 50 contatados
UPDATE campanha_lead_tasks t
SET status = 'feita', feita_em = now(),
    observacao = '1º contato enviado pela IA antes da conversão pra manual (11/06)'
FROM campanha_leads cl
WHERE t.campanha_lead_id = cl.id
  AND cl.campanha_id = 'c8fac22e-e6a0-44ec-984d-486bc28d1c1b'
  AND cl.status = 'contatado'
  AND t.ordem = 1
  AND t.status = 'pendente';
