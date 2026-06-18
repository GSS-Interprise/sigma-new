
-- =====================================================================
-- BLOCO DB — Módulo Licitação
-- =====================================================================

-- 1) ALTER TABLE public.licitacoes -------------------------------------
ALTER TABLE public.licitacoes
  ADD COLUMN IF NOT EXISTS empresa_disputante text,
  ADD COLUMN IF NOT EXISTS card_origem_id uuid REFERENCES public.licitacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_gemeo_id uuid REFERENCES public.licitacoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disputa_valor_anonimo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS objeto_resumo text;

ALTER TABLE public.licitacoes
  DROP CONSTRAINT IF EXISTS licitacoes_empresa_disputante_check;
ALTER TABLE public.licitacoes
  ADD CONSTRAINT licitacoes_empresa_disputante_check
  CHECK (empresa_disputante IS NULL OR empresa_disputante IN ('GSS','AGES'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_licitacao_origem_empresa
  ON public.licitacoes (card_origem_id, empresa_disputante)
  WHERE card_origem_id IS NOT NULL;

-- 2) ALTER TABLE public.licitacao_itens --------------------------------
ALTER TABLE public.licitacao_itens
  ADD COLUMN IF NOT EXISTS lote text,
  ADD COLUMN IF NOT EXISTS numero_item text,
  ADD COLUMN IF NOT EXISTS qnt_unit_total numeric(14,4),
  ADD COLUMN IF NOT EXISTS qnt_valor_und numeric(14,4),
  ADD COLUMN IF NOT EXISTS vlr_und_deliberado numeric(14,4),
  ADD COLUMN IF NOT EXISTS origem_extracao text NOT NULL DEFAULT 'manual';

-- coluna GENERATED só pode ser adicionada se ainda não existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='licitacao_itens' AND column_name='vlr_total_estimavel'
  ) THEN
    EXECUTE 'ALTER TABLE public.licitacao_itens
             ADD COLUMN vlr_total_estimavel numeric(14,2)
             GENERATED ALWAYS AS (qnt_unit_total * qnt_valor_und) STORED';
  END IF;
END $$;

ALTER TABLE public.licitacao_itens
  DROP CONSTRAINT IF EXISTS licitacao_itens_origem_extracao_check;
ALTER TABLE public.licitacao_itens
  ADD CONSTRAINT licitacao_itens_origem_extracao_check
  CHECK (origem_extracao IN ('manual','ia','importacao_ata'));

CREATE INDEX IF NOT EXISTS idx_licitacao_itens_lote
  ON public.licitacao_itens(licitacao_id, lote);

-- 3) ALTER TABLE public.licitacao_item_concorrentes --------------------
ALTER TABLE public.licitacao_item_concorrentes
  ADD COLUMN IF NOT EXISTS valor_total numeric(14,2),
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS ata_anexo_id uuid REFERENCES public.licitacoes_anexos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requer_revisao_manual boolean NOT NULL DEFAULT false;

ALTER TABLE public.licitacao_item_concorrentes
  DROP CONSTRAINT IF EXISTS licitacao_item_concorrentes_origem_check;
ALTER TABLE public.licitacao_item_concorrentes
  ADD CONSTRAINT licitacao_item_concorrentes_origem_check
  CHECK (origem IN ('manual','ata_ia'));

CREATE INDEX IF NOT EXISTS idx_lic_item_conc_ata
  ON public.licitacao_item_concorrentes(ata_anexo_id)
  WHERE ata_anexo_id IS NOT NULL;

-- 4) Nova tabela: licitacao_raia_log -----------------------------------
CREATE TABLE IF NOT EXISTS public.licitacao_raia_log (
  id              bigserial PRIMARY KEY,
  licitacao_id    uuid NOT NULL REFERENCES public.licitacoes(id) ON DELETE CASCADE,
  status          public.status_licitacao NOT NULL,
  kanban_status_id uuid REFERENCES public.kanban_status_config(id) ON DELETE SET NULL,
  entrou_em       timestamptz NOT NULL DEFAULT now(),
  saiu_em         timestamptz,
  duracao_segundos int GENERATED ALWAYS AS (
    CASE WHEN saiu_em IS NULL THEN NULL
         ELSE EXTRACT(EPOCH FROM (saiu_em - entrou_em))::int
    END
  ) STORED,
  movido_por      uuid,
  ordem_passagem  int NOT NULL DEFAULT 1
);

GRANT SELECT, INSERT, UPDATE ON public.licitacao_raia_log TO authenticated;
GRANT ALL ON public.licitacao_raia_log TO service_role;
GRANT USAGE ON SEQUENCE public.licitacao_raia_log_id_seq TO authenticated, service_role;

ALTER TABLE public.licitacao_raia_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_raia_log_licitacao
  ON public.licitacao_raia_log(licitacao_id, entrou_em);
CREATE INDEX IF NOT EXISTS idx_raia_log_aberto
  ON public.licitacao_raia_log(licitacao_id)
  WHERE saiu_em IS NULL;

DROP POLICY IF EXISTS "raia_log_select_autenticados" ON public.licitacao_raia_log;
CREATE POLICY "raia_log_select_autenticados"
  ON public.licitacao_raia_log
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Trigger de tracking
CREATE OR REPLACE FUNCTION public.fn_licitacao_raia_track()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.licitacao_raia_log
       SET saiu_em = now()
     WHERE licitacao_id = NEW.id
       AND saiu_em IS NULL;

    INSERT INTO public.licitacao_raia_log
      (licitacao_id, status, kanban_status_id, entrou_em, movido_por, ordem_passagem)
    VALUES (
      NEW.id,
      NEW.status,
      (SELECT id FROM public.kanban_status_config
        WHERE modulo='licitacoes' AND status_key = NEW.status::text
        LIMIT 1),
      now(),
      auth.uid(),
      COALESCE(
        (SELECT MAX(ordem_passagem) + 1
           FROM public.licitacao_raia_log
          WHERE licitacao_id = NEW.id AND status = NEW.status),
        1
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_licitacao_raia_track ON public.licitacoes;
CREATE TRIGGER trg_licitacao_raia_track
AFTER UPDATE OF status ON public.licitacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_licitacao_raia_track();

-- 5) Backfill ----------------------------------------------------------
-- Insere uma linha aberta (entrou_em = created_at, status atual) para cards sem log
INSERT INTO public.licitacao_raia_log (licitacao_id, status, entrou_em, ordem_passagem)
SELECT l.id, l.status, COALESCE(l.created_at, now()), 1
FROM public.licitacoes l
WHERE NOT EXISTS (
  SELECT 1 FROM public.licitacao_raia_log r WHERE r.licitacao_id = l.id
);
