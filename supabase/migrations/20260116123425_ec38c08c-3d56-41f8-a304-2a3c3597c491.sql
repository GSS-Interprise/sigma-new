-- 1. Criar enums para classificação e motivo de perda
CREATE TYPE classificacao_gss_licitacao AS ENUM (
  'primeiro_lugar',
  'segundo_lugar',
  'desclassificada',
  'nao_habilitada'
);

CREATE TYPE motivo_perda_licitacao AS ENUM (
  'preco',
  'documentacao',
  'prazo',
  'habilitacao_tecnica',
  'estrategia',
  'outros'
);

-- 2. Criar tabela de empresas concorrentes
CREATE TABLE public.empresas_concorrentes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cnpj TEXT,
  regiao_atuacao TEXT,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Criar índice único no nome (case insensitive) para evitar duplicatas
CREATE UNIQUE INDEX empresas_concorrentes_nome_unique ON public.empresas_concorrentes (LOWER(TRIM(nome)));

-- Enable RLS
ALTER TABLE public.empresas_concorrentes ENABLE ROW LEVEL SECURITY;

-- Políticas para empresas_concorrentes
CREATE POLICY "Usuários autenticados podem visualizar empresas concorrentes"
ON public.empresas_concorrentes FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem criar empresas concorrentes"
ON public.empresas_concorrentes FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar empresas concorrentes"
ON public.empresas_concorrentes FOR UPDATE
TO authenticated
USING (true);

-- 3. Criar tabela de resultados de licitação
CREATE TABLE public.licitacao_resultados (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  licitacao_id UUID NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  empresa_vencedora_id UUID REFERENCES public.empresas_concorrentes(id),
  empresa_vencedora_nome TEXT NOT NULL,
  valor_homologado NUMERIC(15,2) NOT NULL,
  classificacao_gss classificacao_gss_licitacao NOT NULL,
  motivo_perda motivo_perda_licitacao,
  observacoes_estrategicas TEXT,
  registrado_por UUID,
  registrado_por_nome TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT licitacao_resultados_unique UNIQUE (licitacao_id)
);

-- Índices para performance em BI
CREATE INDEX licitacao_resultados_empresa_idx ON public.licitacao_resultados(empresa_vencedora_id);
CREATE INDEX licitacao_resultados_classificacao_idx ON public.licitacao_resultados(classificacao_gss);
CREATE INDEX licitacao_resultados_motivo_idx ON public.licitacao_resultados(motivo_perda);
CREATE INDEX licitacao_resultados_created_idx ON public.licitacao_resultados(created_at);

-- Enable RLS
ALTER TABLE public.licitacao_resultados ENABLE ROW LEVEL SECURITY;

-- Políticas para licitacao_resultados
CREATE POLICY "Usuários autenticados podem visualizar resultados"
ON public.licitacao_resultados FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Usuários autenticados podem criar resultados"
ON public.licitacao_resultados FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar resultados"
ON public.licitacao_resultados FOR UPDATE
TO authenticated
USING (true);

-- 4. Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_empresas_concorrentes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER tr_empresas_concorrentes_updated_at
BEFORE UPDATE ON public.empresas_concorrentes
FOR EACH ROW
EXECUTE FUNCTION update_empresas_concorrentes_updated_at();

CREATE OR REPLACE FUNCTION update_licitacao_resultados_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER tr_licitacao_resultados_updated_at
BEFORE UPDATE ON public.licitacao_resultados
FOR EACH ROW
EXECUTE FUNCTION update_licitacao_resultados_updated_at();

-- 5. Função helper para criar ou buscar empresa concorrente (evitar duplicatas)
CREATE OR REPLACE FUNCTION get_or_create_empresa_concorrente(p_nome TEXT)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_nome_normalizado TEXT;
BEGIN
  v_nome_normalizado := TRIM(p_nome);
  
  -- Tentar encontrar existente
  SELECT id INTO v_id
  FROM public.empresas_concorrentes
  WHERE LOWER(TRIM(nome)) = LOWER(v_nome_normalizado);
  
  -- Se não existe, criar
  IF v_id IS NULL THEN
    INSERT INTO public.empresas_concorrentes (nome)
    VALUES (v_nome_normalizado)
    RETURNING id INTO v_id;
  END IF;
  
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;