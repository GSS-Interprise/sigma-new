
-- Adicionar coluna ia_ativa em disparos_campanhas
ALTER TABLE public.disparos_campanhas 
ADD COLUMN IF NOT EXISTS ia_ativa boolean NOT NULL DEFAULT false;

-- Criar tabela de logs da IA
CREATE TABLE public.disparos_ia_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campanha_id uuid NOT NULL REFERENCES public.disparos_campanhas(id) ON DELETE CASCADE,
  contato_id uuid REFERENCES public.disparos_contatos(id) ON DELETE SET NULL,
  telefone_medico text NOT NULL,
  nome_medico text,
  mensagem_medico text NOT NULL,
  resposta_ia text NOT NULL,
  contexto_usado jsonb,
  transferido_humano boolean NOT NULL DEFAULT false,
  gatilho_transferencia text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.disparos_ia_logs ENABLE ROW LEVEL SECURITY;

-- Política de leitura para usuários autenticados
CREATE POLICY "Authenticated users can view IA logs" 
ON public.disparos_ia_logs 
FOR SELECT 
TO authenticated
USING (true);

-- Política de inserção para service role (edge functions)
CREATE POLICY "Service role can insert IA logs" 
ON public.disparos_ia_logs 
FOR INSERT 
WITH CHECK (true);

-- Índices
CREATE INDEX idx_disparos_ia_logs_campanha ON public.disparos_ia_logs(campanha_id);
CREATE INDEX idx_disparos_ia_logs_telefone ON public.disparos_ia_logs(telefone_medico);
CREATE INDEX idx_disparos_ia_logs_created ON public.disparos_ia_logs(created_at DESC);

-- Habilitar realtime para acompanhar logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.disparos_ia_logs;
