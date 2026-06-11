-- uazapi como provider alternativo de WhatsApp, ao lado da Evolution (piloto 11/06).
-- Aditivo e reversível: chip.provedor decide o transporte. Evolution = default,
-- chips existentes inalterados. Token da instância uazapi (controla o número) fica
-- numa tabela isolada com RLS sem policy → só service_role (edges) acessa.

-- provedor por chip: 'evolution' (default) | 'uazapi'
ALTER TABLE chips ALTER COLUMN provedor SET DEFAULT 'evolution';
UPDATE chips SET provedor = 'evolution' WHERE provedor IS NULL OR provedor = '';

-- segredo do número (token da instância uazapi) — NUNCA exposto ao client
CREATE TABLE IF NOT EXISTS chip_provider_secrets (
  chip_id           uuid PRIMARY KEY REFERENCES chips(id) ON DELETE CASCADE,
  provedor          text NOT NULL DEFAULT 'uazapi',
  uazapi_token      text,
  uazapi_instance_id text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE chip_provider_secrets ENABLE ROW LEVEL SECURITY;
-- RLS habilitado sem nenhuma policy = bloqueia anon/authenticated; só service_role (edges) lê/escreve.
GRANT ALL ON chip_provider_secrets TO service_role;
