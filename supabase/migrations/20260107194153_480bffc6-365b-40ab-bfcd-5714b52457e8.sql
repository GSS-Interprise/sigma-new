-- Tabela principal: Campanhas/Lotes de disparo
CREATE TABLE public.disparos_campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  proposta_id TEXT,
  texto_ia TEXT,
  instancia TEXT,
  chip_id UUID REFERENCES public.chips(id),
  responsavel_id UUID,
  responsavel_nome TEXT,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'pausado', 'concluido', 'cancelado')),
  total_contatos INTEGER DEFAULT 0,
  enviados INTEGER DEFAULT 0,
  falhas INTEGER DEFAULT 0,
  nozap INTEGER DEFAULT 0,
  reenviar INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela de contatos do disparo
CREATE TABLE public.disparos_contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID REFERENCES public.disparos_campanhas(id) ON DELETE CASCADE,
  nome TEXT,
  telefone_original TEXT,
  telefone_e164 TEXT,
  status TEXT DEFAULT '0-PENDENTE' CHECK (status IN ('0-PENDENTE', '1-FILA', '2-REENVIAR', '3-PROCESSANDO', '4-ENVIADO', '5-NOZAP', '6-BLOQUEADORA', '7-ERRO')),
  data_envio TIMESTAMPTZ,
  tipo_erro TEXT,
  data_reenvio TIMESTAMPTZ,
  mensagem_enviada TEXT,
  tentativas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_disparos_campanhas_status ON public.disparos_campanhas(status);
CREATE INDEX idx_disparos_contatos_campanha ON public.disparos_contatos(campanha_id);
CREATE INDEX idx_disparos_contatos_status ON public.disparos_contatos(status);
CREATE INDEX idx_disparos_contatos_telefone ON public.disparos_contatos(telefone_e164);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_disparos_campanhas_updated_at
  BEFORE UPDATE ON public.disparos_campanhas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_disparos_contatos_updated_at
  BEFORE UPDATE ON public.disparos_contatos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.disparos_campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparos_contatos ENABLE ROW LEVEL SECURITY;

-- Políticas para campanhas
CREATE POLICY "Usuários autenticados podem ver campanhas"
  ON public.disparos_campanhas FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem criar campanhas"
  ON public.disparos_campanhas FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem atualizar campanhas"
  ON public.disparos_campanhas FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem deletar campanhas"
  ON public.disparos_campanhas FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Políticas para contatos
CREATE POLICY "Usuários autenticados podem ver contatos"
  ON public.disparos_contatos FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem criar contatos"
  ON public.disparos_contatos FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem atualizar contatos"
  ON public.disparos_contatos FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem deletar contatos"
  ON public.disparos_contatos FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Habilitar realtime para acompanhamento em tempo real
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_campanhas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_contatos;