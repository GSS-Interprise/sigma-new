-- Adicionar colunas para validação de conversão em contrato
-- Coluna JSONB para armazenar serviços com nome e valor
ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS servicos_contrato jsonb DEFAULT '[]'::jsonb;

-- Comentário explicativo
COMMENT ON COLUMN public.licitacoes.servicos_contrato IS 'Array de serviços do contrato: [{nome: string, valor: number}]';

-- 3 Checkboxes obrigatórios para validação
ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS check_conversao_1 boolean DEFAULT false;

ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS check_conversao_2 boolean DEFAULT false;

ALTER TABLE public.licitacoes 
ADD COLUMN IF NOT EXISTS check_conversao_3 boolean DEFAULT false;

-- Comentários explicativos
COMMENT ON COLUMN public.licitacoes.check_conversao_1 IS 'Checkbox 1: Documentação verificada';
COMMENT ON COLUMN public.licitacoes.check_conversao_2 IS 'Checkbox 2: Valores conferidos';
COMMENT ON COLUMN public.licitacoes.check_conversao_3 IS 'Checkbox 3: Responsável definido';