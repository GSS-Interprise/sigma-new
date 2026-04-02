-- Adicionar nova coluna para ages_clientes
ALTER TABLE public.ages_producao 
ADD COLUMN ages_cliente_id UUID REFERENCES public.ages_clientes(id);

-- Adicionar nova coluna para ages_unidades (opcional)
ALTER TABLE public.ages_producao 
ADD COLUMN ages_unidade_id UUID REFERENCES public.ages_unidades(id);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_ages_producao_ages_cliente ON public.ages_producao(ages_cliente_id);
CREATE INDEX IF NOT EXISTS idx_ages_producao_ages_unidade ON public.ages_producao(ages_unidade_id);