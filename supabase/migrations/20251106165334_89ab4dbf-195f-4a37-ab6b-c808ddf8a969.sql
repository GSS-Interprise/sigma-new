-- Criar tabela de conversas
CREATE TABLE IF NOT EXISTS public.conversas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  id_conversa text UNIQUE NOT NULL,
  nome_contato text NOT NULL,
  numero_contato text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Criar tabela de mensagens
CREATE TABLE IF NOT EXISTS public.mensagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_pai uuid NOT NULL REFERENCES public.conversas(id) ON DELETE CASCADE,
  texto_mensagem text NOT NULL,
  direcao text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  timestamp timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT now()
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_conversas_id_conversa ON public.conversas(id_conversa);
CREATE INDEX IF NOT EXISTS idx_mensagens_conversa_pai ON public.mensagens(conversa_pai);
CREATE INDEX IF NOT EXISTS idx_mensagens_timestamp ON public.mensagens(timestamp DESC);

-- Habilitar RLS
ALTER TABLE public.conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para conversas
CREATE POLICY "Authenticated users can view conversas"
  ON public.conversas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert conversas"
  ON public.conversas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update conversas"
  ON public.conversas FOR UPDATE
  TO authenticated
  USING (true);

-- Políticas RLS para mensagens
CREATE POLICY "Authenticated users can view mensagens"
  ON public.mensagens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert mensagens"
  ON public.mensagens FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_conversas_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_conversas_updated_at
  BEFORE UPDATE ON public.conversas
  FOR EACH ROW
  EXECUTE FUNCTION update_conversas_updated_at();