-- =====================================================================
-- Plano Aquecimento + Anti-Ban v1 — Sprint 2 Camada 2 (Aquecedor)
-- Tabelas: aquecedor_par, isca_externa, midia_aquecimento
-- Doc: §4.1 Migrations 006-008
-- =====================================================================

-- aquecedor_par — pares de chips que conversam entre si (power-law)
CREATE TABLE IF NOT EXISTS public.aquecedor_par (
  id bigserial PRIMARY KEY,
  chip_a_id uuid NOT NULL REFERENCES public.chips(id) ON DELETE CASCADE,
  chip_b_id uuid NOT NULL REFERENCES public.chips(id) ON DELETE CASCADE,
  intensidade int NOT NULL CHECK (intensidade BETWEEN 1 AND 5),
  fase text NOT NULL DEFAULT 'ativo' CHECK (fase IN ('ativo','esfriando','inativo')),
  ativado_em timestamptz NOT NULL DEFAULT now(),
  desativado_em timestamptz,
  CHECK (chip_a_id <> chip_b_id),
  UNIQUE (chip_a_id, chip_b_id)
);
CREATE INDEX IF NOT EXISTS idx_aquecedor_par_ativo ON public.aquecedor_par(fase) WHERE fase='ativo';
GRANT ALL ON public.aquecedor_par TO service_role, authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.aquecedor_par_id_seq TO service_role, authenticated;

-- isca_externa — humanos reais cadastrados como iscas (Bruna, equipe, etc)
CREATE TABLE IF NOT EXISTS public.isca_externa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jid text NOT NULL UNIQUE,
  nome_referencia text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('equipe','amigo','familia','random')),
  ativo bool NOT NULL DEFAULT true,
  pode_simular_forward bool NOT NULL DEFAULT false,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.isca_externa TO service_role, authenticated;

-- midia_aquecimento — pool curado de stickers/imagens/áudios pré-aprovados
CREATE TABLE IF NOT EXISTS public.midia_aquecimento (
  id bigserial PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('image','sticker','audio')),
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  tamanho_bytes int,
  tags text[] DEFAULT '{}',
  uso_total int NOT NULL DEFAULT 0,
  ativo bool NOT NULL DEFAULT true,
  added_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_midia_aquecimento_tipo_ativo ON public.midia_aquecimento(tipo, ativo);
GRANT ALL ON public.midia_aquecimento TO service_role, authenticated;
GRANT USAGE,SELECT ON SEQUENCE public.midia_aquecimento_id_seq TO service_role, authenticated;
