-- =====================================================================
-- COBERTURA — o canário que valida "podemos cortar a Effecti".
-- Guarda a medição diária: das licitações que a Effecti trouxe, quantas %
-- estão no espelho (casadas), quantas incertas, quantas AUSENTES (candidatas
-- a fonte-fora-do-PNCP — o número que decide o corte).
-- Alimentada pela edge pncp-comparador (cron diário).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS public.licitacao_cobertura_diaria (
  data_ref       date PRIMARY KEY DEFAULT (now()::date),
  janela_desde   date,
  janela_ate     date,
  total_effecti  int NOT NULL DEFAULT 0,
  casados        int NOT NULL DEFAULT 0,   -- muni+numero+modalidade no espelho
  incertos       int NOT NULL DEFAULT 0,   -- muni existe mas numero nao bateu (casamento duvidoso)
  ausentes       int NOT NULL DEFAULT 0,   -- muni nem existe no espelho -> candidato a fonte externa
  sem_parse      int NOT NULL DEFAULT 0,   -- titulo sem numero/municipio parseavel
  pct_cobertura  numeric,                  -- casados / (total - sem_parse)
  ausentes_amostra jsonb,                  -- titulos ausentes p/ investigar a origem
  medido_em      timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.licitacao_cobertura_diaria TO authenticated, service_role;
ALTER TABLE public.licitacao_cobertura_diaria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobertura_read ON public.licitacao_cobertura_diaria;
CREATE POLICY cobertura_read ON public.licitacao_cobertura_diaria FOR SELECT TO authenticated USING (true);

COMMENT ON TABLE public.licitacao_cobertura_diaria IS 'Canário diário Effecti x espelho PNCP. pct_cobertura=100 por 7 dias + ausentes=0 (ou explicados) => pode cortar a Effecti.';
