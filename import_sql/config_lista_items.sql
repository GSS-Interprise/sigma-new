INSERT INTO "config_lista_items" ("id", "campo_nome", "valor", "created_at") VALUES
('bff1a849-1a39-4eeb-904c-4c379c90ef6c', 'especialidade_captacao', 'Neonatologista', '2025-12-08T12:07:08.747Z'),
('e37b10f6-a8ed-4f1c-82a4-48c98f59d003', 'especialidade_captacao', 'Pediatra', '2025-12-08T14:39:16.919Z'),
('0e11dd28-a327-49ba-acdf-4cb09e685c0e', 'especialidade_captacao', 'Intensivista Pediatrico', '2025-12-08T14:49:44.088Z'),
('d93c34a7-51fd-4185-bb7b-1fe4970c35c1', 'evolution_api_url', 'https://disparador-evolution-api.r0pfyf.easypanel.host/', '2025-12-03T18:08:34.166Z'),
('a9c3ab76-08be-4c42-a87c-febe5898f525', 'evolution_api_key', 'Gss-Wpp-Evolution-@2025-S3guR0', '2025-12-09T13:56:52.129Z'),
('7d248ad2-ea76-4442-a072-7aaac2669c03', 'evolution_webhook_global', '{"url":"https://disparador-n8n.r0pfyf.easypanel.host/webhook/3a9459e1-c402-4d5a-a5c1-0a0c08f3af29","byEvents":false,"base64":true,"events":["MESSAGES_UPSERT","MESSAGES_UPDATE","MESSAGES_DELETE","CONNECTION_UPDATE","QRCODE_UPDATED","SEND_MESSAGE","CONTACTS_UPDATE","CONTACTS_UPSERT","PRESENCE_UPDATE","CHATS_UPDATE","CHATS_UPSERT","GROUPS_UPSERT","CALL","TYPEBOT_START","TYPEBOT_CHANGE_STATUS","CONTACTS_SET","LABELS_ASSOCIATION","LABELS_EDIT","MESSAGES_SET"]}', '2025-12-03T18:08:34.453Z'),
('049217fd-e717-4f73-b59a-9339c8d9cbcf', 'evolution_behavior_config', '{"rejectCall":true,"msgCall":"","groupsIgnore":true,"alwaysOnline":false,"readMessages":false,"readStatus":false,"syncFullHistory":true}', '2026-01-06T14:46:46.214Z'),
('59506d9f-4d9a-46ed-9506-f92f47c4d799', 'n8n_disparos_webhook_url', 'https://disparador-n8n.r0pfyf.easypanel.host/webhook/5d2be706-e0e1-4ab0-80e7-b569a636e70a', '2026-01-07T23:30:25.367Z'),
('5a9256de-fefd-47b5-80b1-449772f843bc', 'tipo_contratacao_dr_oportunidade', 'CESSÃO DE SOFTWARE', '2026-01-08T19:04:47.328Z'),
('81d1c236-0c52-4a76-a91f-460c442c93e8', 'residentes_webhook_url', 'https://disparador-n8n.r0pfyf.easypanel.host/webhook-test/582971a5-9bd2-4cbd-8919-3869e62c0550', '2026-04-02T19:32:19.932Z')
ON CONFLICT (id) DO NOTHING;
