-- Create table for médicos kanban cards
CREATE TABLE public.medico_kanban_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  cpf TEXT,
  data_nascimento DATE,
  crm TEXT,
  telefone TEXT,
  email TEXT,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'novo_canal',
  canal_id UUID REFERENCES public.comunicacao_canais(id) ON DELETE SET NULL,
  medico_id UUID REFERENCES public.medicos(id) ON DELETE SET NULL,
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.medico_kanban_cards ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Usuários autenticados podem visualizar cards"
ON public.medico_kanban_cards FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autorizados podem gerenciar cards"
ON public.medico_kanban_cards FOR ALL
USING (is_admin(auth.uid()) OR has_role(auth.uid(), 'gestor_captacao'::app_role) OR has_role(auth.uid(), 'gestor_contratos'::app_role));

-- Insert default kanban columns for médicos module
INSERT INTO public.kanban_status_config (modulo, status_id, label, cor, ordem, ativo)
VALUES 
  ('medicos', 'novo_canal', 'Novo Canal / Lead Médico', '#6366f1', 1, true),
  ('medicos', 'captando_info', 'Captando Informações', '#f59e0b', 2, true),
  ('medicos', 'revisar_dados', 'Revisar Dados', '#ef4444', 3, true),
  ('medicos', 'pronto_cadastro', 'Pronto para Cadastro', '#8b5cf6', 4, true),
  ('medicos', 'cadastrado', 'Cadastrado', '#3b82f6', 5, true),
  ('medicos', 'validacao_documental', 'Em Validação Documental', '#f97316', 6, true),
  ('medicos', 'ativo', 'Ativo', '#22c55e', 7, true);

-- Create trigger for updated_at
CREATE TRIGGER update_medico_kanban_cards_updated_at
BEFORE UPDATE ON public.medico_kanban_cards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();