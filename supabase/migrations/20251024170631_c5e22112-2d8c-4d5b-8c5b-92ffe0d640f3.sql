-- Corrigir search_path da função criada na migration anterior
DROP FUNCTION IF EXISTS update_radiologia_pendencias_comentarios_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION update_radiologia_pendencias_comentarios_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Recriar o trigger
CREATE TRIGGER update_pendencias_comentarios_updated_at
BEFORE UPDATE ON radiologia_pendencias_comentarios
FOR EACH ROW
EXECUTE FUNCTION update_radiologia_pendencias_comentarios_updated_at();