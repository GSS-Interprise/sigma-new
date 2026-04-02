-- Adicionar campo estado na tabela medicos
ALTER TABLE public.medicos 
ADD COLUMN IF NOT EXISTS estado text;

-- Criar tabela para log de disparos
CREATE TABLE IF NOT EXISTS public.disparos_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamp with time zone DEFAULT now(),
  usuario_id uuid REFERENCES auth.users(id) NOT NULL,
  usuario_nome text NOT NULL,
  especialidade text NOT NULL,
  estado text,
  mensagem text NOT NULL,
  total_destinatarios integer NOT NULL DEFAULT 0,
  enviados integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  detalhes_falhas jsonb,
  revisado_ia boolean DEFAULT false
);

-- Enable RLS
ALTER TABLE public.disparos_log ENABLE ROW LEVEL SECURITY;

-- Policy: usuários autenticados podem ver seus próprios logs
CREATE POLICY "Users can view their own disparos_log"
ON public.disparos_log
FOR SELECT
TO authenticated
USING (auth.uid() = usuario_id);

-- Policy: usuários autenticados podem inserir seus próprios logs
CREATE POLICY "Users can insert their own disparos_log"
ON public.disparos_log
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = usuario_id);

-- Policy: admins podem ver todos os logs
CREATE POLICY "Admins can view all disparos_log"
ON public.disparos_log
FOR SELECT
TO authenticated
USING (is_admin(auth.uid()));

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_disparos_log_usuario ON public.disparos_log(usuario_id);
CREATE INDEX IF NOT EXISTS idx_disparos_log_created ON public.disparos_log(created_at DESC);