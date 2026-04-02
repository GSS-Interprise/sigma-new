-- Criar tabela para aditivos de tempo de contratos
CREATE TABLE public.contrato_aditivos_tempo (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_id UUID NOT NULL REFERENCES public.contratos(id) ON DELETE CASCADE,
  data_inicio DATE NOT NULL,
  prazo_meses INTEGER NOT NULL,
  data_termino DATE NOT NULL,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.contrato_aditivos_tempo ENABLE ROW LEVEL SECURITY;

-- Políticas RLS (mesmas do contrato pai)
CREATE POLICY "Usuários autenticados podem ver aditivos" 
ON public.contrato_aditivos_tempo 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem criar aditivos" 
ON public.contrato_aditivos_tempo 
FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem atualizar aditivos" 
ON public.contrato_aditivos_tempo 
FOR UPDATE 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem deletar aditivos" 
ON public.contrato_aditivos_tempo 
FOR DELETE 
USING (auth.uid() IS NOT NULL);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_contrato_aditivos_tempo_updated_at
  BEFORE UPDATE ON public.contrato_aditivos_tempo
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Comentários
COMMENT ON TABLE public.contrato_aditivos_tempo IS 'Aditivos de tempo para extensão de prazos contratuais';
COMMENT ON COLUMN public.contrato_aditivos_tempo.contrato_id IS 'Referência ao contrato principal';
COMMENT ON COLUMN public.contrato_aditivos_tempo.data_inicio IS 'Data de início do período do aditivo';
COMMENT ON COLUMN public.contrato_aditivos_tempo.prazo_meses IS 'Prazo em meses do aditivo';
COMMENT ON COLUMN public.contrato_aditivos_tempo.data_termino IS 'Data de término calculada do aditivo';