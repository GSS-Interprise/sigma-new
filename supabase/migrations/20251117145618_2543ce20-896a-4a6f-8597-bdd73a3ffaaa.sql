-- Adicionar campo anexos na tabela suporte_comentarios
ALTER TABLE public.suporte_comentarios
ADD COLUMN IF NOT EXISTS anexos TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.suporte_comentarios.anexos IS 'Caminhos dos arquivos anexados ao comentário';