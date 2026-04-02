-- Remover o DEFAULT da sequência para que o trigger MAX+1 funcione
ALTER TABLE contratos ALTER COLUMN codigo_interno DROP DEFAULT;

-- Resetar a sequência para o valor correto (para backup caso precise no futuro)
SELECT setval('contratos_codigo_interno_seq', (SELECT COALESCE(MAX(codigo_interno), 0) FROM contratos), true);