-- 1. Add contrato_id and unidade_id to proposta table
ALTER TABLE public.proposta ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES public.contratos(id) ON DELETE SET NULL;
ALTER TABLE public.proposta ADD COLUMN IF NOT EXISTS unidade_id uuid REFERENCES public.unidades(id) ON DELETE SET NULL;

-- 2. Make servico_id nullable (for backwards compatibility)
ALTER TABLE public.proposta ALTER COLUMN servico_id DROP NOT NULL;

-- 3. Create proposta_itens table to store items with values
CREATE TABLE IF NOT EXISTS public.proposta_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposta_id uuid NOT NULL REFERENCES public.proposta(id) ON DELETE CASCADE,
  contrato_item_id uuid REFERENCES public.contrato_itens(id) ON DELETE SET NULL,
  item_nome text NOT NULL,
  valor_contrato numeric DEFAULT 0,
  valor_medico numeric NOT NULL DEFAULT 0,
  quantidade integer DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Enable RLS on proposta_itens
ALTER TABLE public.proposta_itens ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for proposta_itens
CREATE POLICY "Usuários autenticados podem visualizar proposta_itens"
ON public.proposta_itens
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Gestores podem gerenciar proposta_itens"
ON public.proposta_itens
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos')
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos')
);

-- 6. Add updated_at trigger for proposta_itens
CREATE TRIGGER update_proposta_itens_updated_at
BEFORE UPDATE ON public.proposta_itens
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- 7. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_proposta_contrato_id ON public.proposta(contrato_id);
CREATE INDEX IF NOT EXISTS idx_proposta_unidade_id ON public.proposta(unidade_id);
CREATE INDEX IF NOT EXISTS idx_proposta_itens_proposta_id ON public.proposta_itens(proposta_id);