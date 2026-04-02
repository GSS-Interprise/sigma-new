-- Adicionar campo para múltiplos turnos nas escalas
ALTER TABLE radiologia_agendas_escalas 
ADD COLUMN turnos JSONB DEFAULT '[]'::jsonb;

-- Comentário explicativo
COMMENT ON COLUMN radiologia_agendas_escalas.turnos IS 'Array de turnos diários no formato: [{"inicio": "07:00", "fim": "12:00"}, ...]';