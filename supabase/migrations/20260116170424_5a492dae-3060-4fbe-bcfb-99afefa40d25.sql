-- Tabela de pastas/temas do usuário
CREATE TABLE public.user_pastas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  cor TEXT DEFAULT '#6366f1',
  icone TEXT DEFAULT 'folder',
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de notas/cards
CREATE TABLE public.user_notas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  pasta_id UUID REFERENCES public.user_pastas(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  conteudo TEXT,
  tags TEXT[] DEFAULT '{}',
  fixada BOOLEAN DEFAULT false,
  arquivada BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de checklist items
CREATE TABLE public.user_notas_checklist (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nota_id UUID NOT NULL REFERENCES public.user_notas(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  concluido BOOLEAN DEFAULT false,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de anexos/links
CREATE TABLE public.user_notas_anexos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nota_id UUID NOT NULL REFERENCES public.user_notas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'link', -- 'link' ou 'arquivo'
  nome TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.user_pastas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notas_checklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_notas_anexos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para user_pastas (privado por usuário)
CREATE POLICY "Usuários podem ver suas próprias pastas"
  ON public.user_pastas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar suas próprias pastas"
  ON public.user_pastas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias pastas"
  ON public.user_pastas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias pastas"
  ON public.user_pastas FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas RLS para user_notas (privado por usuário)
CREATE POLICY "Usuários podem ver suas próprias notas"
  ON public.user_notas FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem criar suas próprias notas"
  ON public.user_notas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar suas próprias notas"
  ON public.user_notas FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar suas próprias notas"
  ON public.user_notas FOR DELETE
  USING (auth.uid() = user_id);

-- Políticas RLS para checklist (via nota do usuário)
CREATE POLICY "Usuários podem ver checklist de suas notas"
  ON public.user_notas_checklist FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_notas 
    WHERE id = nota_id AND user_id = auth.uid()
  ));

CREATE POLICY "Usuários podem criar checklist em suas notas"
  ON public.user_notas_checklist FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_notas 
    WHERE id = nota_id AND user_id = auth.uid()
  ));

CREATE POLICY "Usuários podem atualizar checklist de suas notas"
  ON public.user_notas_checklist FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_notas 
    WHERE id = nota_id AND user_id = auth.uid()
  ));

CREATE POLICY "Usuários podem deletar checklist de suas notas"
  ON public.user_notas_checklist FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.user_notas 
    WHERE id = nota_id AND user_id = auth.uid()
  ));

-- Políticas RLS para anexos (via nota do usuário)
CREATE POLICY "Usuários podem ver anexos de suas notas"
  ON public.user_notas_anexos FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.user_notas 
    WHERE id = nota_id AND user_id = auth.uid()
  ));

CREATE POLICY "Usuários podem criar anexos em suas notas"
  ON public.user_notas_anexos FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_notas 
    WHERE id = nota_id AND user_id = auth.uid()
  ));

CREATE POLICY "Usuários podem atualizar anexos de suas notas"
  ON public.user_notas_anexos FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.user_notas 
    WHERE id = nota_id AND user_id = auth.uid()
  ));

CREATE POLICY "Usuários podem deletar anexos de suas notas"
  ON public.user_notas_anexos FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.user_notas 
    WHERE id = nota_id AND user_id = auth.uid()
  ));

-- Índices para performance
CREATE INDEX idx_user_pastas_user_id ON public.user_pastas(user_id);
CREATE INDEX idx_user_notas_user_id ON public.user_notas(user_id);
CREATE INDEX idx_user_notas_pasta_id ON public.user_notas(pasta_id);
CREATE INDEX idx_user_notas_checklist_nota_id ON public.user_notas_checklist(nota_id);
CREATE INDEX idx_user_notas_anexos_nota_id ON public.user_notas_anexos(nota_id);

-- Trigger para atualizar updated_at
CREATE TRIGGER update_user_pastas_updated_at
  BEFORE UPDATE ON public.user_pastas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_notas_updated_at
  BEFORE UPDATE ON public.user_notas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket para anexos de notas
INSERT INTO storage.buckets (id, name, public) 
VALUES ('user-notas-anexos', 'user-notas-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage para anexos
CREATE POLICY "Usuários podem ver seus próprios anexos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'user-notas-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuários podem fazer upload de seus próprios anexos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'user-notas-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuários podem deletar seus próprios anexos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'user-notas-anexos' AND auth.uid()::text = (storage.foldername(name))[1]);