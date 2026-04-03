INSERT INTO "ages_unidades" ("id", "cliente_id", "nome", "codigo", "endereco", "cidade", "uf", "created_at", "updated_at") VALUES
('4f53a6c3-a020-4294-9cab-98d9f722ea79', 'ff679940-ff1d-472c-b39f-8f7a88490d1d', 'Policlínica Municipal', NULL, 'Av. Eugênio Krause, 2265 - Centro', 'Penha', 'SC', '2026-01-13T12:47:01.860Z', '2026-01-13T12:47:01.860Z'),
('94a2ef2f-dd4b-43b3-a7b2-467c91446738', '96383503-872d-41b0-aac8-e7ecd6a73807', 'UNIDADE DE SAÚDE UBS Dr Alex Paulo Picanco Cerq Cesar', NULL, 'Rua Professor Solano de Abreu n71', 'Centro', 'SP', '2026-01-13T13:08:00.007Z', '2026-01-13T13:08:00.007Z'),
('3b7ca9f6-bc03-4ea8-bb4a-a76dd9720df6', '01a09382-001c-4c12-a6ac-d0f7cd7929b9', 'Centro de Saúde Paulo Roberto Martins', NULL, 'R. Dr. Gervásio Morales, 420', 'Sertanópolis', 'PR', '2026-01-13T20:31:06.055Z', '2026-01-13T20:31:06.055Z'),
('9be8e6b9-ff09-4b2e-b94c-c2ca9ff1b5b6', '01a09382-001c-4c12-a6ac-d0f7cd7929b9', 'Unidade Básica de Saúde - Maria Casagrande Favoreto', NULL, 'R. Amazonas, 200 - Res. Sanches', 'Sertanópolis', 'PR', '2026-01-13T20:32:21.010Z', '2026-01-13T20:32:21.010Z'),
('e970888c-0e2e-4cdb-9815-8b2dba7da438', '01a09382-001c-4c12-a6ac-d0f7cd7929b9', 'UBS - Romildo Rossato', NULL, 'R. Luiz Babugia, 583', 'Sertanópolis', 'PR', '2026-01-13T20:36:18.374Z', '2026-01-13T20:36:18.374Z')
ON CONFLICT (id) DO NOTHING;
