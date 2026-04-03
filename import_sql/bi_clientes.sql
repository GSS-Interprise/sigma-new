INSERT INTO "bi_clientes" ("id", "nome", "slug", "ativo", "created_at", "updated_at") VALUES
('f33f5f00-b9e0-470b-8fab-72c4f277d4ff', 'Hospital de Gaspar', 'hospital-de-gaspar', true, '2026-03-30T15:01:11.341Z', '2026-03-30T15:01:11.341Z')
ON CONFLICT (id) DO NOTHING;
