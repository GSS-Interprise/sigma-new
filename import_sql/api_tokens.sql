INSERT INTO "api_tokens" ("id", "nome", "token", "ativo", "created_by", "created_at", "last_used_at", "expires_at") VALUES
('29c22ed9-e98a-4c3a-9984-995abaf6022a', 'n8n-enriquecimento-lifeshub-headless', 'sigma_e01cb9ca0a774732807ef123df205d0f', true, NULL, '2026-03-19T12:49:25.310Z', '2026-03-19T18:51:34.909Z', NULL),
('b34e5b2e-707a-45c6-95df-5ae21b266004', 'Enriquecedor-leads', 'sigma_462e5661c367464b8568a67ebc35872a', true, NULL, '2026-03-25T12:11:04.982Z', '2026-04-02T14:18:28.846Z', NULL),
('c8f9373a-7afe-48c7-bfac-5507ffa5e9cb', 'import-leads-crm-lemit', 'sigma_47ed4cac64d342e5834483eed3cff19f', true, NULL, '2026-03-04T12:29:53.158Z', '2026-04-02T19:02:57.958Z', NULL),
('298d45a3-19f0-4511-9cb4-51d9e21bd795', 'Residentes-post', 'sigma_b36271a572044f5cb2fb2005ae3e7f79', true, NULL, '2026-04-02T19:19:25.229Z', NULL, NULL),
('61aeeecb-5da0-403c-a8cb-cce58d5214f4', 'N0N0', 'sigma_cf6f2145b2554eabb597391a5dd80404', true, NULL, '2025-10-31T12:42:36.033Z', '2026-04-02T20:00:30.613Z', NULL)
ON CONFLICT (id) DO NOTHING;
