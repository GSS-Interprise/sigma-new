INSERT INTO "ages_contrato_itens" ("id", "contrato_id", "item", "valor_item", "quantidade", "created_at", "updated_at") VALUES
('3b071fe0-be19-4feb-834e-5047cad5cd4e', 'ae8643ea-c8e9-4282-b74d-22b0931fb6aa', 'HORAS', '74', '1', '2026-03-06T15:15:10.736Z', '2026-03-06T15:15:10.736Z'),
('8d4ae6e3-b098-4810-8752-6c5cd04357c0', 'ae8643ea-c8e9-4282-b74d-22b0931fb6aa', 'Quantidade/Serviço/ Hora', '77.93', '1', '2026-03-06T15:15:10.736Z', '2026-03-06T15:15:10.736Z'),
('27e4600e-7f73-4f4f-8634-c07f98f85be9', '605ea6d7-0c5f-49b3-863a-aced29a91cee', 'CONSULTAS', '158.56', '1', '2026-03-16T14:08:28.027Z', '2026-03-16T14:08:28.027Z'),
('866b070a-8778-4df3-a367-92949f1b9451', 'ede65b7a-20af-41b3-b0ed-15b84eeeb143', 'Consulta', '203.51', '120', '2026-03-23T17:56:22.613Z', '2026-03-23T17:56:22.613Z')
ON CONFLICT (id) DO NOTHING;
