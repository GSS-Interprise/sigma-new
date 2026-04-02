
-- Tabela para armazenar contas/perfis de marketing
CREATE TABLE public.marketing_contas (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    nome TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.marketing_contas ENABLE ROW LEVEL SECURITY;

-- Política para visualização
CREATE POLICY "Authenticated users can view marketing_contas"
ON public.marketing_contas
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Política para gerenciamento
CREATE POLICY "Authorized users can manage marketing_contas"
ON public.marketing_contas
FOR ALL
USING (
    is_admin(auth.uid()) OR 
    has_role(auth.uid(), 'gestor_marketing'::app_role) OR 
    has_role(auth.uid(), 'diretoria'::app_role)
);

-- Alterar coluna conta_perfil para permitir null
ALTER TABLE public.marketing_conteudos 
ALTER COLUMN conta_perfil DROP NOT NULL;
