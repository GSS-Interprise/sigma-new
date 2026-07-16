-- =====================================================================
-- ESPELHO PNCP (mirror completo do Brasil)
-- Objetivo: garantir cobertura 100% — copiamos TODO o dataset do PNCP por
-- data × modalidade (não por busca fuzzy), e a busca forte roda LOCAL sobre
-- a cópia. Substitui a dependência da Effecti sem risco de perder edital.
--
-- Duas tabelas:
--   pncp_mirror            -> o dataset bruto (1 linha por numero_controle_pncp)
--   pncp_mirror_sync_state -> checkpoint (data, modalidade, página) p/ retomar
--
-- O filtro de saúde NÃO é aplicado aqui: guardamos tudo. Relevância vira
-- VIEW/coluna reprocessável (ajusta sem re-baixar). Ver edge pncp-mirror-sync.
-- =====================================================================

-- ── Espelho: dataset bruto completo ──
CREATE TABLE IF NOT EXISTS public.pncp_mirror (
  numero_controle_pncp text PRIMARY KEY,
  ano                  int,
  sequencial           int,
  cnpj_orgao           text,
  orgao_razao_social   text,
  uf                   text,
  municipio            text,
  codigo_ibge          text,
  esfera               text,          -- F/E/M (federal/estadual/municipal)
  poder                text,
  modalidade_id        int,
  modalidade_nome      text,
  objeto_compra        text,
  valor_estimado       numeric,
  valor_homologado     numeric,
  situacao_id          int,
  situacao_nome        text,
  tem_resultado        boolean,
  data_publicacao      timestamptz,
  data_atualizacao     timestamptz,   -- muda quando resultado/vencedor entra depois
  data_abertura_proposta      timestamptz,
  data_encerramento_proposta  timestamptz,
  link_sistema_origem  text,
  -- busca forte NOSSA: full-text PT-BR sobre objeto+órgão+município
  busca tsvector GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(objeto_compra,'') || ' ' ||
      coalesce(orgao_razao_social,'') || ' ' ||
      coalesce(municipio,''))
  ) STORED,
  raw            jsonb NOT NULL,       -- payload completo do PNCP (fonte de verdade)
  capturado_em   timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pncp_mirror_busca        ON public.pncp_mirror USING gin(busca);
CREATE INDEX IF NOT EXISTS idx_pncp_mirror_data_pub      ON public.pncp_mirror (data_publicacao DESC);
CREATE INDEX IF NOT EXISTS idx_pncp_mirror_data_atu      ON public.pncp_mirror (data_atualizacao DESC);
CREATE INDEX IF NOT EXISTS idx_pncp_mirror_uf_modalidade ON public.pncp_mirror (uf, modalidade_id);
CREATE INDEX IF NOT EXISTS idx_pncp_mirror_cnpj          ON public.pncp_mirror (cnpj_orgao);
CREATE INDEX IF NOT EXISTS idx_pncp_mirror_tem_resultado ON public.pncp_mirror (tem_resultado) WHERE tem_resultado IS TRUE;

-- ── Checkpoint de varredura: 1 linha por (data, modalidade) ──
-- Permite retomar de onde parou quando o deadline do Edge corta o run.
CREATE TABLE IF NOT EXISTS public.pncp_mirror_sync_state (
  data_ref        date NOT NULL,
  modalidade_id   int  NOT NULL,
  ultima_pagina   int  NOT NULL DEFAULT 0,   -- última página já gravada
  total_paginas   int,                       -- descoberto no 1º fetch
  status          text NOT NULL DEFAULT 'pendente', -- pendente|completo|erro
  registros       int  NOT NULL DEFAULT 0,
  erro_msg        text,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (data_ref, modalidade_id)
);

CREATE INDEX IF NOT EXISTS idx_pncp_sync_pendente
  ON public.pncp_mirror_sync_state (status, data_ref) WHERE status <> 'completo';

-- ── GRANT (tabelas criadas por SQL direto NÃO herdam grant default → edge crasha 42501) ──
GRANT ALL ON public.pncp_mirror            TO authenticated, service_role;
GRANT ALL ON public.pncp_mirror_sync_state TO authenticated, service_role;

-- ── RLS: dado público (licitação é pública). Leitura p/ authenticated, escrita só service_role ──
ALTER TABLE public.pncp_mirror            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pncp_mirror_sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pncp_mirror_read ON public.pncp_mirror;
CREATE POLICY pncp_mirror_read ON public.pncp_mirror
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pncp_sync_read ON public.pncp_mirror_sync_state;
CREATE POLICY pncp_sync_read ON public.pncp_mirror_sync_state
  FOR SELECT TO authenticated USING (true);

-- ── RPC: avança o checkpoint de forma atômica (soma registros da página) ──
-- Usada pela edge a cada página gravada. SECURITY DEFINER p/ rodar sob service_role.
CREATE OR REPLACE FUNCTION public.pncp_sync_bump(
  p_data date, p_mod int, p_pagina int, p_total int, p_delta int, p_completo boolean
) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.pncp_mirror_sync_state
     SET ultima_pagina = p_pagina,
         total_paginas = p_total,
         status        = CASE WHEN p_completo THEN 'completo' ELSE 'pendente' END,
         registros     = registros + coalesce(p_delta, 0),
         erro_msg      = NULL,
         atualizado_em = now()
   WHERE data_ref = p_data AND modalidade_id = p_mod;
$$;

GRANT EXECUTE ON FUNCTION public.pncp_sync_bump(date,int,int,int,int,boolean) TO service_role;

COMMENT ON TABLE public.pncp_mirror IS 'Espelho completo do PNCP (todas modalidades, Brasil). Cópia bruta por data×modalidade — garante cobertura 100%. Filtro de relevância é reprocessável em cima daqui.';
