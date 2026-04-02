-- Corrigir search_path para função de prontuário
DROP TRIGGER IF EXISTS trigger_update_medico_prontuario_updated_at ON public.medico_prontuario;
DROP FUNCTION IF EXISTS update_medico_prontuario_updated_at();

CREATE OR REPLACE FUNCTION public.update_medico_prontuario_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trigger_update_medico_prontuario_updated_at
BEFORE UPDATE ON public.medico_prontuario
FOR EACH ROW
EXECUTE FUNCTION update_medico_prontuario_updated_at();