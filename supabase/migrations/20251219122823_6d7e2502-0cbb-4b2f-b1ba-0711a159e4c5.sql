-- Criar tabela para armazenar configuração global de etiquetas de licitações
CREATE TABLE public.licitacoes_etiquetas_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  cor_id TEXT NOT NULL DEFAULT 'gray',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.licitacoes_etiquetas_config ENABLE ROW LEVEL SECURITY;

-- Política para visualização - usuários autenticados
CREATE POLICY "Usuários autenticados podem visualizar etiquetas" 
ON public.licitacoes_etiquetas_config 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Política para gerenciamento - gestores
CREATE POLICY "Gestores podem gerenciar etiquetas" 
ON public.licitacoes_etiquetas_config 
FOR ALL 
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'lideres'::app_role))
WITH CHECK (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_contratos'::app_role) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'lideres'::app_role));

-- Inserir etiquetas padrão
INSERT INTO public.licitacoes_etiquetas_config (nome, cor_id) VALUES
  ('Saúde', 'teal'),
  ('Radiologia', 'purple'),
  ('Urgente', 'red'),
  ('Prioritário', 'orange'),
  ('Médico', 'blue'),
  ('Equipamento', 'green'),
  ('Análise Técnica', 'yellow'),
  ('Documentação', 'gray');