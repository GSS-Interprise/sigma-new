-- Adicionar campo unidades_vinculadas ao ages_leads
ALTER TABLE public.ages_leads 
ADD COLUMN IF NOT EXISTS unidades_vinculadas uuid[] DEFAULT '{}'::uuid[];

-- Criar tabela de propostas AGES
CREATE TABLE IF NOT EXISTS public.ages_propostas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id uuid NOT NULL REFERENCES public.ages_leads(id) ON DELETE CASCADE,
  profissional_id uuid REFERENCES public.ages_profissionais(id) ON DELETE SET NULL,
  cliente_id uuid REFERENCES public.ages_clientes(id) ON DELETE SET NULL,
  unidade_id uuid REFERENCES public.ages_unidades(id) ON DELETE SET NULL,
  contrato_id uuid REFERENCES public.ages_contratos(id) ON DELETE SET NULL,
  valor numeric,
  status text NOT NULL DEFAULT 'rascunho',
  observacoes text,
  descricao text,
  id_proposta text,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  atualizado_em timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ages_propostas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Authenticated users can view ages_propostas"
ON public.ages_propostas FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authorized users can manage ages_propostas"
ON public.ages_propostas FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos') OR 
  has_role(auth.uid(), 'gestor_ages')
);

-- Trigger para updated_at
CREATE TRIGGER update_ages_propostas_updated_at
  BEFORE UPDATE ON public.ages_propostas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();