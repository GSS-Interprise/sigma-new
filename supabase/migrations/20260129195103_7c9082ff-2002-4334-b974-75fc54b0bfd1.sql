-- ============================================
-- MÓDULO DE ESCALAS - REESTRUTURAÇÃO COMPLETA
-- Dr. Escala como fonte única da verdade (read-only)
-- ============================================

-- 1. TABELA DE LOCAIS (Hospitais) do Dr. Escala
CREATE TABLE IF NOT EXISTS public.escalas_locais (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_externo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  endereco TEXT,
  cidade TEXT,
  uf TEXT,
  ativo BOOLEAN DEFAULT true,
  sincronizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 2. TABELA DE SETORES do Dr. Escala (vinculados a locais)
CREATE TABLE IF NOT EXISTS public.escalas_setores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_externo TEXT NOT NULL,
  local_id UUID NOT NULL REFERENCES public.escalas_locais(id) ON DELETE CASCADE,
  local_id_externo TEXT NOT NULL,
  nome TEXT NOT NULL,
  ativo BOOLEAN DEFAULT true,
  sincronizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(id_externo, local_id_externo)
);

-- 3. ATUALIZAR TABELA DE ESCALAS INTEGRADAS
-- Adicionar campos obrigatórios para local_id e setor_id
ALTER TABLE public.escalas_integradas 
  ADD COLUMN IF NOT EXISTS local_id_externo TEXT,
  ADD COLUMN IF NOT EXISTS setor_id_externo TEXT,
  ADD COLUMN IF NOT EXISTS local_nome TEXT,
  ADD COLUMN IF NOT EXISTS setor_nome TEXT,
  ADD COLUMN IF NOT EXISTS escala_local_id UUID REFERENCES public.escalas_locais(id),
  ADD COLUMN IF NOT EXISTS escala_setor_id UUID REFERENCES public.escalas_setores(id),
  ADD COLUMN IF NOT EXISTS dados_incompletos BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS motivo_incompleto TEXT;

-- 4. TABELA DE LOGS DE INCONSISTÊNCIA
CREATE TABLE IF NOT EXISTS public.escalas_inconsistencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  escala_id UUID REFERENCES public.escalas_integradas(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, -- 'sem_setor', 'sem_local', 'profissional_duplicado', 'dia_sem_cobertura'
  descricao TEXT NOT NULL,
  dados_originais JSONB,
  resolvido BOOLEAN DEFAULT false,
  resolvido_em TIMESTAMP WITH TIME ZONE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 5. TABELA DE ALERTAS DE ESCALAS
CREATE TABLE IF NOT EXISTS public.escalas_alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL, -- 'plantao_sem_setor', 'dia_sem_cobertura', 'profissional_duplicado'
  titulo TEXT NOT NULL,
  descricao TEXT,
  local_id UUID REFERENCES public.escalas_locais(id),
  setor_id UUID REFERENCES public.escalas_setores(id),
  data_referencia DATE,
  prioridade TEXT DEFAULT 'media', -- 'baixa', 'media', 'alta', 'critica'
  lido BOOLEAN DEFAULT false,
  lido_por UUID,
  lido_em TIMESTAMP WITH TIME ZONE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 6. ÍNDICES PARA PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_escalas_locais_id_externo ON public.escalas_locais(id_externo);
CREATE INDEX IF NOT EXISTS idx_escalas_setores_id_externo ON public.escalas_setores(id_externo, local_id_externo);
CREATE INDEX IF NOT EXISTS idx_escalas_setores_local_id ON public.escalas_setores(local_id);
CREATE INDEX IF NOT EXISTS idx_escalas_integradas_local_setor ON public.escalas_integradas(local_id_externo, setor_id_externo);
CREATE INDEX IF NOT EXISTS idx_escalas_integradas_dados_incompletos ON public.escalas_integradas(dados_incompletos) WHERE dados_incompletos = true;
CREATE INDEX IF NOT EXISTS idx_escalas_inconsistencias_tipo ON public.escalas_inconsistencias(tipo);
CREATE INDEX IF NOT EXISTS idx_escalas_alertas_tipo ON public.escalas_alertas(tipo, lido);

-- 7. TRIGGERS PARA UPDATED_AT
CREATE OR REPLACE FUNCTION public.update_escalas_locais_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_escalas_locais_updated_at
  BEFORE UPDATE ON public.escalas_locais
  FOR EACH ROW
  EXECUTE FUNCTION public.update_escalas_locais_updated_at();

CREATE TRIGGER update_escalas_setores_updated_at
  BEFORE UPDATE ON public.escalas_setores
  FOR EACH ROW
  EXECUTE FUNCTION public.update_escalas_locais_updated_at();

-- 8. RLS POLICIES (Read-only para usuários autenticados)
ALTER TABLE public.escalas_locais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_setores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_inconsistencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas_alertas ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura para todos autenticados
CREATE POLICY "Usuários autenticados podem visualizar locais" 
  ON public.escalas_locais FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Usuários autenticados podem visualizar setores" 
  ON public.escalas_setores FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Usuários autenticados podem visualizar inconsistências" 
  ON public.escalas_inconsistencias FOR SELECT 
  TO authenticated 
  USING (true);

CREATE POLICY "Usuários autenticados podem visualizar alertas" 
  ON public.escalas_alertas FOR SELECT 
  TO authenticated 
  USING (true);

-- Admins podem gerenciar (para sincronização)
CREATE POLICY "Admins podem gerenciar locais" 
  ON public.escalas_locais FOR ALL 
  TO authenticated 
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins podem gerenciar setores" 
  ON public.escalas_setores FOR ALL 
  TO authenticated 
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins podem gerenciar inconsistências" 
  ON public.escalas_inconsistencias FOR ALL 
  TO authenticated 
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins podem gerenciar alertas" 
  ON public.escalas_alertas FOR ALL 
  TO authenticated 
  USING (public.is_admin(auth.uid()));

-- Permitir que usuários marquem alertas como lidos
CREATE POLICY "Usuários podem atualizar alertas (marcar como lido)" 
  ON public.escalas_alertas FOR UPDATE 
  TO authenticated 
  USING (true)
  WITH CHECK (true);