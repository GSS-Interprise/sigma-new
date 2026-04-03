CREATE TABLE IF NOT EXISTS public.blacklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text UNIQUE NOT NULL,
  nome text,
  origem text,
  reason text,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view blacklist" ON public.blacklist;
CREATE POLICY "Authenticated users can view blacklist"
ON public.blacklist FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authorized users can manage blacklist" ON public.blacklist;
CREATE POLICY "Authorized users can manage blacklist"
ON public.blacklist FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'recrutador') OR has_role(auth.uid(), 'gestor_demanda'));

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS email_financeiro TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS telefone_financeiro TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS nome_unidade TEXT;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS estado TEXT;

CREATE TABLE IF NOT EXISTS public.contrato_renovacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL,
  data_vigencia DATE NOT NULL,
  percentual_reajuste NUMERIC(5, 2),
  valor NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contrato_anexos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id UUID NOT NULL,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT NOT NULL,
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.contrato_renovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_anexos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authorized users can manage contrato_renovacoes" ON public.contrato_renovacoes;
CREATE POLICY "Authorized users can manage contrato_renovacoes"
ON public.contrato_renovacoes FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'));

DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can view contrato_anexos"
ON public.contrato_anexos FOR SELECT
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'));

DROP POLICY IF EXISTS "Authorized users can insert contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can insert contrato_anexos"
ON public.contrato_anexos FOR INSERT
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_demanda'));