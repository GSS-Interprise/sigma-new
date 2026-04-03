INSERT INTO "ages_contrato_aditivos" ("id", "contrato_id", "data_inicio", "prazo_meses", "data_termino", "observacoes", "created_at", "updated_at") VALUES
('bd7f43a7-9559-4eca-8a8c-959c376a0fe2', 'ae8643ea-c8e9-4282-b74d-22b0931fb6aa', '2025-05-20T00:00:00.000Z', '12', '2026-05-19T00:00:00.000Z', NULL, '2026-03-06T15:15:11.892Z', '2026-03-06T15:15:11.892Z')
ON CONFLICT (id) DO NOTHING;
