-- Add new columns to campanhas table for enhanced functionality
ALTER TABLE public.campanhas 
ADD COLUMN IF NOT EXISTS descricao TEXT,
ADD COLUMN IF NOT EXISTS mensagem TEXT,
ADD COLUMN IF NOT EXISTS assunto_email TEXT,
ADD COLUMN IF NOT EXISTS corpo_html TEXT,
ADD COLUMN IF NOT EXISTS variaveis_dinamicas TEXT[],
ADD COLUMN IF NOT EXISTS agendamento_tipo TEXT DEFAULT 'imediato',
ADD COLUMN IF NOT EXISTS data_agendamento TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS horario_inteligente BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tamanho_lote INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS segmento_id UUID,
ADD COLUMN IF NOT EXISTS arquivo_csv_url TEXT,
ADD COLUMN IF NOT EXISTS total_enviados INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_entregues INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_aberturas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_cliques INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_respostas INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_conversoes INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS custo_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES auth.users(id);

-- Create segmentos table for saved audience segments
CREATE TABLE IF NOT EXISTS public.segmentos_publico (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL,
    descricao TEXT,
    filtros JSONB NOT NULL DEFAULT '{}',
    criado_por UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create campaign envios log table
CREATE TABLE IF NOT EXISTS public.campanhas_envios (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
    destinatario_id UUID,
    destinatario_nome TEXT,
    destinatario_email TEXT,
    destinatario_telefone TEXT,
    status TEXT DEFAULT 'pendente',
    motivo_falha TEXT,
    data_envio TIMESTAMP WITH TIME ZONE,
    data_abertura TIMESTAMP WITH TIME ZONE,
    data_clique TIMESTAMP WITH TIME ZONE,
    data_resposta TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE public.segmentos_publico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas_envios ENABLE ROW LEVEL SECURITY;

-- RLS policies for segmentos_publico
CREATE POLICY "Usuários autorizados podem gerenciar segmentos" ON public.segmentos_publico
FOR ALL USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'gestor_captacao'::app_role)
);

-- RLS policies for campanhas_envios
CREATE POLICY "Usuários autorizados podem visualizar envios" ON public.campanhas_envios
FOR SELECT USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR
    has_role(auth.uid(), 'gestor_captacao'::app_role)
);

CREATE POLICY "Usuários autorizados podem gerenciar envios" ON public.campanhas_envios
FOR ALL USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_campanhas_envios_campanha ON public.campanhas_envios(campanha_id);
CREATE INDEX IF NOT EXISTS idx_campanhas_envios_status ON public.campanhas_envios(status);
CREATE INDEX IF NOT EXISTS idx_campanhas_status ON public.campanhas(status);