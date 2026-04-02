-- Criar tabela de leads
CREATE TABLE IF NOT EXISTS public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  phone_e164 text UNIQUE NOT NULL,
  especialidade text,
  uf text,
  origem text, -- 'excel', 'manual', 'campanha'
  status text NOT NULL DEFAULT 'Novo' CHECK (status IN ('Novo', 'Qualificado', 'Convertido', 'Descartado')),
  tags text[],
  observacoes text,
  arquivo_id text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Adicionar campos à tabela medicos
ALTER TABLE public.medicos
ADD COLUMN IF NOT EXISTS phone_e164 text UNIQUE,
ADD COLUMN IF NOT EXISTS lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS alocado_cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS status_contrato text;

-- Atualizar tabela blacklist (recriar com estrutura correta)
DROP TABLE IF EXISTS public.black_list CASCADE;

CREATE TABLE public.blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text UNIQUE NOT NULL,
  nome text,
  origem text, -- 'lead' ou 'clinico'
  reason text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

-- Policies para leads
CREATE POLICY "Admins and recrutadores can manage leads"
ON public.leads
FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'recrutador'));

CREATE POLICY "Coordenadores can view leads"
ON public.leads
FOR SELECT
USING (has_role(auth.uid(), 'coordenador_escalas'));

-- Policies para blacklist
CREATE POLICY "Authenticated users can view blacklist"
ON public.blacklist
FOR SELECT
USING (true);

CREATE POLICY "Authorized users can manage blacklist"
ON public.blacklist
FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'recrutador') OR has_role(auth.uid(), 'gestor_demanda'));

-- Trigger para updated_at em leads
CREATE TRIGGER update_leads_updated_at
BEFORE UPDATE ON public.leads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();