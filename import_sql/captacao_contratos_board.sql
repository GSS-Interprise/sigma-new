INSERT INTO "captacao_contratos_board" ("id", "origem_tipo", "origem_licitacao_id", "contrato_id", "status", "titulo_card", "overlay_json", "created_at", "updated_at", "created_by") VALUES
('2f6cdd7b-da6e-4ccc-94c8-ebcf2d0ad82d', 'licitacao_arrematada', NULL, NULL, 'prospectar', 'asdfasdfasdf - sdfgsdfgsdfgdsfg', '{"uf":"PE","orgao":"sdfg","objeto":"sdfgsdfgsdfgdsfg","numero_edital":"asdfasdfasdf","valor_estimado":521212.12,"data_arrematacao":"2025-12-12T19:39:07.778446+00:00"}', '2025-12-12T19:39:07.778Z', '2025-12-18T13:32:45.254Z', NULL)
ON CONFLICT (id) DO NOTHING;
