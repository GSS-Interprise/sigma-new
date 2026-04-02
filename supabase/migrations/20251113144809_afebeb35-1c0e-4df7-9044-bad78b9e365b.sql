
-- Criar tabela para armazenar respostas de email
CREATE TABLE public.email_respostas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  disparo_log_id UUID REFERENCES public.disparos_log(id) ON DELETE SET NULL,
  disparo_programado_id UUID REFERENCES public.disparos_programados(id) ON DELETE SET NULL,
  remetente_email TEXT NOT NULL,
  remetente_nome TEXT,
  data_resposta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  conteudo_resposta TEXT NOT NULL,
  status_lead TEXT NOT NULL DEFAULT 'novo',
  medico_id UUID REFERENCES public.medicos(id) ON DELETE SET NULL,
  especialidade TEXT,
  localidade TEXT,
  observacoes TEXT,
  concluido BOOLEAN NOT NULL DEFAULT false,
  concluido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  concluido_em TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT email_respostas_status_check CHECK (status_lead IN ('novo', 'em_analise', 'concluido', 'descartado'))
);

-- Habilitar RLS
ALTER TABLE public.email_respostas ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Usuários autorizados podem gerenciar respostas"
  ON public.email_respostas
  FOR ALL
  USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_captacao'::app_role) OR
    has_role(auth.uid(), 'gestor_contratos'::app_role)
  );

CREATE POLICY "Sistema pode inserir respostas"
  ON public.email_respostas
  FOR INSERT
  WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_email_respostas_updated_at
  BEFORE UPDATE ON public.email_respostas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Índices para melhor performance
CREATE INDEX idx_email_respostas_disparo_log ON public.email_respostas(disparo_log_id);
CREATE INDEX idx_email_respostas_disparo_programado ON public.email_respostas(disparo_programado_id);
CREATE INDEX idx_email_respostas_status ON public.email_respostas(status_lead);
CREATE INDEX idx_email_respostas_remetente ON public.email_respostas(remetente_email);
CREATE INDEX idx_email_respostas_data ON public.email_respostas(data_resposta DESC);

-- Adicionar comentários
COMMENT ON TABLE public.email_respostas IS 'Armazena respostas de emails recebidas dos disparos';
COMMENT ON COLUMN public.email_respostas.status_lead IS 'Status do lead: novo, em_analise, concluido, descartado';
