-- Tabela para motivos de descarte de licitação
CREATE TABLE public.licitacao_motivos_descarte (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Inserir motivos padrão
INSERT INTO public.licitacao_motivos_descarte (nome) VALUES
  ('EXIGE CLT'),
  ('VALOR BAIXO'),
  ('VOLUMETRIA BAIXA'),
  ('EXCLUSIVIDADE ME/EPP'),
  ('NECESSIDADE DE LOCAL'),
  ('EXIGE EQUIPAMENTO'),
  ('FORA DO ESCOPO'),
  ('EDITAL REPETIDO');

-- Tabela para registrar descartes de licitação
CREATE TABLE public.licitacao_descartes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  motivo_id UUID NOT NULL REFERENCES public.licitacao_motivos_descarte(id),
  justificativa TEXT NOT NULL CHECK (char_length(justificativa) >= 30),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  created_by_nome TEXT
);

-- RLS para motivos
ALTER TABLE public.licitacao_motivos_descarte ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos podem visualizar motivos ativos"
ON public.licitacao_motivos_descarte FOR SELECT
USING (ativo = true);

CREATE POLICY "Admins podem inserir motivos"
ON public.licitacao_motivos_descarte FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- RLS para descartes
ALTER TABLE public.licitacao_descartes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver descartes"
ON public.licitacao_descartes FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autenticados podem inserir descartes"
ON public.licitacao_descartes FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Índices
CREATE INDEX idx_licitacao_descartes_licitacao ON public.licitacao_descartes(licitacao_id);
CREATE INDEX idx_licitacao_motivos_descarte_ativo ON public.licitacao_motivos_descarte(ativo);