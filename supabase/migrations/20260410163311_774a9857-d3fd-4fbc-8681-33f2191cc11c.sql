-- Renomear a tabela
ALTER TABLE public.regiao_interesse_leads RENAME TO banco_interesse_leads;

-- Renomear as políticas RLS para refletir o novo nome
ALTER POLICY "Authenticated users can view regiao_interesse_leads" ON public.banco_interesse_leads RENAME TO "Authenticated users can view banco_interesse_leads";
ALTER POLICY "Authenticated users can insert regiao_interesse_leads" ON public.banco_interesse_leads RENAME TO "Authenticated users can insert banco_interesse_leads";
ALTER POLICY "Authenticated users can delete regiao_interesse_leads" ON public.banco_interesse_leads RENAME TO "Authenticated users can delete banco_interesse_leads";