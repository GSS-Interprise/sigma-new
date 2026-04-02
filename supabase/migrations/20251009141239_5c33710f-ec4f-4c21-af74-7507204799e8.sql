-- Criar tabela de chips disponíveis
CREATE TABLE IF NOT EXISTS public.chips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  nome text NOT NULL,
  numero text NOT NULL UNIQUE,
  provedor text,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'manutencao')),
  limite_diario integer DEFAULT 1000
);

-- Criar tabela de black list
CREATE TABLE IF NOT EXISTS public.black_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  medico_id uuid REFERENCES public.medicos(id) ON DELETE CASCADE,
  motivo text,
  adicionado_por uuid REFERENCES auth.users(id)
);

-- Criar tabela de disparos programados
CREATE TABLE IF NOT EXISTS public.disparos_programados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  usuario_id uuid NOT NULL REFERENCES auth.users(id),
  chip_id uuid REFERENCES public.chips(id),
  especialidade text NOT NULL,
  estado text,
  mensagem text NOT NULL,
  data_agendamento timestamptz NOT NULL,
  tamanho_lote integer DEFAULT 500,
  status text NOT NULL DEFAULT 'agendado' CHECK (status IN ('agendado', 'em_envio', 'enviado', 'erro', 'respondido', 'cancelado')),
  total_destinatarios integer DEFAULT 0,
  enviados integer DEFAULT 0,
  falhas integer DEFAULT 0,
  destinatarios_enviados jsonb DEFAULT '[]'::jsonb,
  detalhes_erro text
);

-- Atualizar disparos_log para incluir chip
ALTER TABLE public.disparos_log 
ADD COLUMN IF NOT EXISTS chip_id uuid REFERENCES public.chips(id),
ADD COLUMN IF NOT EXISTS disparo_programado_id uuid REFERENCES public.disparos_programados(id);

-- Habilitar RLS
ALTER TABLE public.chips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.black_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparos_programados ENABLE ROW LEVEL SECURITY;

-- Políticas para chips
CREATE POLICY "Authenticated users can view chips"
ON public.chips FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage chips"
ON public.chips FOR ALL
TO authenticated
USING (is_admin(auth.uid()));

-- Políticas para black_list
CREATE POLICY "Authenticated users can view black_list"
ON public.black_list FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authorized users can manage black_list"
ON public.black_list FOR ALL
TO authenticated
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'recrutador'::app_role) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role)
);

-- Políticas para disparos_programados
CREATE POLICY "Users can view their own disparos_programados"
ON public.disparos_programados FOR SELECT
TO authenticated
USING (auth.uid() = usuario_id OR is_admin(auth.uid()));

CREATE POLICY "Users can insert their own disparos_programados"
ON public.disparos_programados FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Users can update their own disparos_programados"
ON public.disparos_programados FOR UPDATE
TO authenticated
USING (auth.uid() = usuario_id OR is_admin(auth.uid()));

CREATE POLICY "Admins can delete disparos_programados"
ON public.disparos_programados FOR DELETE
TO authenticated
USING (is_admin(auth.uid()));

-- Trigger para updated_at
CREATE OR REPLACE TRIGGER update_disparos_programados_updated_at
BEFORE UPDATE ON public.disparos_programados
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Inserir alguns chips de exemplo
INSERT INTO public.chips (nome, numero, provedor, status, limite_diario)
VALUES 
  ('Chip 1 - Principal', '+5511999999001', 'Vivo', 'ativo', 1000),
  ('Chip 2 - Backup', '+5511999999002', 'TIM', 'ativo', 1000),
  ('Chip 3 - Marketing', '+5511999999003', 'Claro', 'ativo', 500)
ON CONFLICT (numero) DO NOTHING;