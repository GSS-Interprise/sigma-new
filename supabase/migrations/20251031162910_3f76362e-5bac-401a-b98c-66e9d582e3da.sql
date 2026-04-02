-- Criar tabela para anotações de prontuário dos médicos
CREATE TABLE IF NOT EXISTS public.medico_prontuario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  anotacao TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.medico_prontuario ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários podem ver prontuários"
ON public.medico_prontuario
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários podem criar prontuários"
ON public.medico_prontuario
FOR INSERT
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Usuários podem atualizar próprios prontuários"
ON public.medico_prontuario
FOR UPDATE
USING (auth.uid() = created_by);

-- Criar índice para melhor performance
CREATE INDEX idx_medico_prontuario_medico_id ON public.medico_prontuario(medico_id);
CREATE INDEX idx_medico_prontuario_created_at ON public.medico_prontuario(created_at DESC);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_medico_prontuario_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_medico_prontuario_updated_at
BEFORE UPDATE ON public.medico_prontuario
FOR EACH ROW
EXECUTE FUNCTION update_medico_prontuario_updated_at();