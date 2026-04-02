-- Primeiro, limpar duplicatas mantendo apenas a instância mais antiga de cada nome
-- Criar tabela temporária com IDs a manter
WITH ranked_instances AS (
  SELECT id, name, instance_uuid, status, created_at,
         ROW_NUMBER() OVER (PARTITION BY name ORDER BY created_at ASC) as rn
  FROM sigzap_instances
  WHERE status != 'deleted'
),
instances_to_keep AS (
  SELECT id FROM ranked_instances WHERE rn = 1
),
instances_to_delete AS (
  SELECT id FROM sigzap_instances 
  WHERE id NOT IN (SELECT id FROM instances_to_keep)
  AND status != 'deleted'
)
-- Marcar duplicatas como deleted (não deletar para preservar histórico)
UPDATE sigzap_instances 
SET status = 'deleted', 
    name = name || '_dup_' || LEFT(id::text, 8)
WHERE id IN (SELECT id FROM instances_to_delete);

-- Agora adicionar índice único para evitar futuras duplicatas
CREATE UNIQUE INDEX IF NOT EXISTS sigzap_instances_name_unique 
ON sigzap_instances(name) 
WHERE status != 'deleted';