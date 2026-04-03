INSERT INTO "contrato_itens_dr_oportunidade" ("id", "contrato_id", "item", "valor_item", "quantidade", "created_at", "updated_at") VALUES
('9935119b-277d-46f9-8d1b-691410a73f4d', '30e356a7-6f90-4ffb-b5c0-70271357121a', 'SISTEMA DR ESCALA', '3.60', '400', '2026-01-08T19:09:11.678Z', '2026-01-08T19:09:11.678Z'),
('084fbe1a-1b16-41f4-bc40-18ac1b5b4ed6', 'f0e813db-a1f9-40cb-b2d6-da26aff993c7', 'SISTEMA DR ESCALA', '283.33', '12', '2026-04-02T14:07:24.619Z', '2026-04-02T14:07:24.619Z')
ON CONFLICT (id) DO NOTHING;
