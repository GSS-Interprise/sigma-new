INSERT INTO "licitacoes_edit_locks" ("id", "licitacao_id", "user_id", "user_name", "started_at", "expires_at") VALUES
('653f58e4-48f5-4d9c-b3eb-68a09cd62a90', '169a2604-fe32-4e4d-b988-c27e7ca35d1f', 'dfe5defb-39c7-457d-ad26-2e463d4cdb58', 'Felipe da Silva Pereira Medeiros Graeff', '2026-04-02T20:50:17.699Z', '2026-04-02T20:55:17.699Z'),
('58617c6c-05d5-4158-8b58-034c1666fb48', 'be5a4ed8-93bb-469f-86a7-7a675ff5df08', 'dfe5defb-39c7-457d-ad26-2e463d4cdb58', 'Felipe da Silva Pereira Medeiros Graeff', '2026-04-02T20:50:38.999Z', '2026-04-02T20:55:38.999Z'),
('645b6b56-80a8-4652-bd6f-cca68574ff8a', '094aaa3d-ca57-4081-b654-359c05a379f1', 'dfe5defb-39c7-457d-ad26-2e463d4cdb58', 'Felipe da Silva Pereira Medeiros Graeff', '2026-04-02T20:50:45.780Z', '2026-04-02T20:55:45.780Z'),
('ac29c66e-657c-42eb-aae9-64592d941e0f', '6032dd45-5dc6-4a1c-991f-c910e5f79b2d', 'dfe5defb-39c7-457d-ad26-2e463d4cdb58', 'Felipe da Silva Pereira Medeiros Graeff', '2026-04-02T20:52:53.708Z', '2026-04-02T20:57:53.708Z'),
('489a924a-c551-46a4-be6c-12c3fe9926cc', '3a9be0e7-025b-4ab4-8619-36a20c32d393', 'dfe5defb-39c7-457d-ad26-2e463d4cdb58', 'Felipe da Silva Pereira Medeiros Graeff', '2026-04-02T20:52:53.726Z', '2026-04-02T20:57:57.939Z')
ON CONFLICT (id) DO NOTHING;
