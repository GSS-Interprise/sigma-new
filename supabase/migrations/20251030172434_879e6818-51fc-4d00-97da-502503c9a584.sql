-- Adicionar campo nivel_urgencia às tabelas de pendências e exames em atraso
-- e mesclar as tabelas em uma única estrutura

-- Criar tipo enum para nível de urgência
CREATE TYPE nivel_urgencia_radiologia AS ENUM ('pronto_socorro', 'internados', 'oncologicos');

-- Adicionar campo nivel_urgencia à tabela radiologia_pendencias
ALTER TABLE radiologia_pendencias 
ADD COLUMN IF NOT EXISTS nivel_urgencia nivel_urgencia_radiologia DEFAULT 'internados';

-- Adicionar campo tipo_registro para diferenciar pendências de exames em atraso
ALTER TABLE radiologia_pendencias
ADD COLUMN IF NOT EXISTS tipo_registro text DEFAULT 'pendencia';

-- Adicionar campo exame (para quando for exame em atraso)
ALTER TABLE radiologia_pendencias
ADD COLUMN IF NOT EXISTS exame text;

-- Comentários explicativos
COMMENT ON COLUMN radiologia_pendencias.nivel_urgencia IS 'Nível de urgência: pronto_socorro (SLA 2h), internados (SLA 4h), oncologicos (SLA 48h)';
COMMENT ON COLUMN radiologia_pendencias.tipo_registro IS 'Tipo do registro: pendencia ou exame_atraso';
COMMENT ON COLUMN radiologia_pendencias.exame IS 'Nome do exame (quando tipo_registro = exame_atraso)';