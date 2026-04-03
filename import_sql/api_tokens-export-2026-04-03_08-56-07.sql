INSERT INTO "api_tokens-export-2026-04-03_08-56-07" ("id;nome;token;ativo;created_by;created_at;last_used_at;expires_at") VALUES
('29c22ed9-e98a-4c3a-9984-995abaf6022a;n8n-enriquecimento-lifeshub-headless;sigma_e01cb9ca0a774732807ef123df205d0f;true;;2026-03-19 12:49:25.310988+00;2026-03-19 18:51:34.909244+00;'),
('b34e5b2e-707a-45c6-95df-5ae21b266004;Enriquecedor-leads;sigma_462e5661c367464b8568a67ebc35872a;true;;2026-03-25 12:11:04.982523+00;2026-04-02 14:18:28.846401+00;'),
('c8f9373a-7afe-48c7-bfac-5507ffa5e9cb;import-leads-crm-lemit;sigma_47ed4cac64d342e5834483eed3cff19f;true;;2026-03-04 12:29:53.158266+00;2026-04-02 19:02:57.958524+00;'),
('298d45a3-19f0-4511-9cb4-51d9e21bd795;Residentes-post;sigma_b36271a572044f5cb2fb2005ae3e7f79;true;;2026-04-02 19:19:25.229113+00;;'),
('61aeeecb-5da0-403c-a8cb-cce58d5214f4;N0N0;sigma_cf6f2145b2554eabb597391a5dd80404;true;;2025-10-31 12:42:36.033672+00;2026-04-02 20:00:30.613865+00;')
ON CONFLICT (id) DO NOTHING;
