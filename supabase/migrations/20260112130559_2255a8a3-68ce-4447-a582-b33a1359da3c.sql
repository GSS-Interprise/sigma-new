-- Add columns for chunk-based processing
ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS arquivo_storage_path TEXT;
ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS chunk_atual INTEGER DEFAULT 0;
ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS total_chunks INTEGER DEFAULT 1;
ALTER TABLE lead_import_jobs ADD COLUMN IF NOT EXISTS linhas_processadas INTEGER DEFAULT 0;

-- Add unique constraint on leads.phone_e164 for efficient upsert
ALTER TABLE leads ADD CONSTRAINT leads_phone_e164_unique UNIQUE (phone_e164);