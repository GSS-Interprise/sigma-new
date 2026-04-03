INSERT INTO "captacao_permissoes_usuario" ("id", "user_id", "pode_disparos_email", "pode_disparos_zap", "pode_acompanhamento", "pode_leads", "pode_blacklist", "pode_seigzaps_config", "pode_contratos_servicos", "created_at", "updated_at", "cor", "realtime_licitacoes") VALUES
('62fced6e-1692-4fa2-9642-ccaba719be02', '45195808-18e5-4e53-8bba-d1149da93ebd', true, true, true, true, true, true, true, '2026-02-18T18:22:01.784Z', '2026-02-18T18:22:18.289Z', NULL, false),
('01b6d188-8ee9-4f5d-9ee9-87460eb67656', '5842d696-5e72-4798-9e5a-eb5d8268998a', true, true, true, true, true, true, true, '2025-12-09T17:58:49.877Z', '2025-12-09T18:28:43.152Z', 'hsl(210, 100%, 45%)', false),
('beda8777-0be4-4282-9235-afc3b2f064ce', '97ed2a13-9005-469f-9202-7bc1cfbf8b9e', true, true, true, true, true, true, false, '2026-02-24T16:54:50.750Z', '2026-03-10T14:17:55.677Z', 'hsl(262, 83%, 58%)', false),
('5551fc22-26b5-48e4-babb-92bc52a6683c', '5fc86254-ee42-4afb-b9da-c143d68c5995', false, true, true, true, true, true, true, '2026-02-10T11:51:43.643Z', '2026-03-12T19:48:29.523Z', 'hsl(340, 82%, 52%)', true),
('3df74037-42e3-4f05-95d0-705b258583fb', '77468374-6efb-429e-ac8f-1141a22457e0', false, true, true, true, true, true, true, '2026-01-29T17:54:21.242Z', '2026-03-12T19:48:29.523Z', 'hsl(330, 80%, 50%)', true),
('0058f90d-80f9-42fa-a7ae-8595288daf94', 'dfe5defb-39c7-457d-ad26-2e463d4cdb58', false, false, false, false, false, false, false, '2026-03-12T19:49:38.306Z', '2026-03-12T19:49:38.306Z', NULL, true),
('5a803191-b640-4d8b-aa65-f75f13322a93', '18700581-4a05-4b28-81e3-88921c3f9f1d', true, true, true, true, true, true, true, '2026-01-27T14:36:19.984Z', '2026-01-29T18:09:08.647Z', 'hsl(220, 70%, 50%)', false),
('d2f7826d-aad6-4767-9e19-a18a369413d2', '11d70a5b-11c2-4651-8521-de3c8a00a2b4', false, false, false, false, false, false, false, '2026-03-12T19:49:38.306Z', '2026-03-12T19:49:38.306Z', NULL, true),
('53b00751-f43a-4303-b472-00d0dd7d36d3', '3adafddc-3d23-40c6-8ce0-5ddf0d3aef0b', false, false, false, false, false, false, false, '2026-03-12T19:49:38.306Z', '2026-03-12T19:49:38.306Z', NULL, true),
('936d2530-4a13-4854-8fbe-2fe1e5e30c90', 'af473dba-514d-4c75-9269-27f1b500c2cd', true, true, true, true, true, true, false, '2026-01-27T14:36:34.005Z', '2026-02-02T14:24:42.059Z', 'hsl(25, 95%, 53%)', false),
('a5a6595e-fee3-48dd-bc22-02c6fc4fb5cd', '17101e3b-8795-490c-8b91-8aa29be3677e', true, true, true, true, true, true, true, '2025-12-08T16:55:08.059Z', '2026-02-02T14:25:10.362Z', 'hsl(160, 84%, 39%)', false),
('fef5375d-66d6-4cd1-a959-68052bfdd4b1', '9bcc555a-486c-49ba-8e82-2496d668d2fc', true, true, true, true, true, true, true, '2026-02-02T14:24:11.635Z', '2026-02-02T14:25:18.416Z', 'hsl(280, 68%, 45%)', false),
('499dde36-6244-478d-82d1-f11cb645c3da', 'cdadef34-3904-4aad-adf9-b3f422de8518', true, true, true, true, true, true, true, '2026-01-07T12:02:29.979Z', '2026-02-03T19:16:28.239Z', 'hsl(45, 93%, 47%)', false),
('342f70fa-f532-4f98-8d3a-ec719de6a3aa', '1791105a-2b6e-4538-b193-84b97911803a', true, true, true, true, true, true, false, '2026-01-12T14:06:02.374Z', '2026-01-20T11:30:49.333Z', 'hsl(180, 70%, 35%)', false)
ON CONFLICT (id) DO NOTHING;
