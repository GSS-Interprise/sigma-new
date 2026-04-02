-- Criar enums para suporte
CREATE TYPE public.destino_suporte AS ENUM ('interno', 'externo');
CREATE TYPE public.tipo_suporte AS ENUM ('software', 'hardware');
CREATE TYPE public.status_ticket AS ENUM ('pendente', 'em_analise', 'concluido');
CREATE TYPE public.fornecedor_externo AS ENUM ('dr_escala', 'infra_ti');

-- Criar tabela de tickets de suporte
CREATE TABLE public.suporte_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero TEXT UNIQUE NOT NULL,
  solicitante_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  solicitante_nome TEXT NOT NULL,
  setor_id UUID REFERENCES public.setores(id),
  setor_nome TEXT,
  data_abertura TIMESTAMPTZ NOT NULL DEFAULT now(),
  destino public.destino_suporte NOT NULL,
  tipo public.tipo_suporte NOT NULL,
  fornecedor_externo public.fornecedor_externo,
  descricao TEXT NOT NULL CHECK (LENGTH(descricao) >= 10),
  status public.status_ticket NOT NULL DEFAULT 'pendente',
  anexos TEXT[],
  historico JSONB DEFAULT '[]'::jsonb,
  data_ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  data_conclusao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Criar tabela de comentários
CREATE TABLE public.suporte_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.suporte_tickets(id) ON DELETE CASCADE NOT NULL,
  autor_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  autor_nome TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  anexos TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Criar função para gerar número do ticket
CREATE OR REPLACE FUNCTION public.generate_ticket_numero()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  year_str TEXT;
  next_num INTEGER;
BEGIN
  year_str := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(numero FROM 'SUP-\d{4}-(\d{6})') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.suporte_tickets
  WHERE numero LIKE 'SUP-' || year_str || '-%';
  
  RETURN 'SUP-' || year_str || '-' || LPAD(next_num::TEXT, 6, '0');
END;
$$;

-- Criar trigger para gerar número do ticket automaticamente
CREATE OR REPLACE FUNCTION public.set_ticket_numero()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = '' THEN
    NEW.numero := public.generate_ticket_numero();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_set_ticket_numero
BEFORE INSERT ON public.suporte_tickets
FOR EACH ROW
EXECUTE FUNCTION public.set_ticket_numero();

-- Criar trigger para atualizar data_ultima_atualizacao
CREATE TRIGGER update_suporte_tickets_updated_at
BEFORE UPDATE ON public.suporte_tickets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_suporte_comentarios_updated_at
BEFORE UPDATE ON public.suporte_comentarios
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.suporte_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suporte_comentarios ENABLE ROW LEVEL SECURITY;

-- RLS Policies para suporte_tickets
-- Usuários podem ver seus próprios tickets
CREATE POLICY "Users can view own tickets"
ON public.suporte_tickets
FOR SELECT
USING (
  auth.uid() = solicitante_id 
  OR is_admin(auth.uid())
);

-- Usuários podem criar tickets
CREATE POLICY "Users can create tickets"
ON public.suporte_tickets
FOR INSERT
WITH CHECK (auth.uid() = solicitante_id);

-- Usuários podem editar seus tickets (quando não concluídos)
CREATE POLICY "Users can update own tickets"
ON public.suporte_tickets
FOR UPDATE
USING (
  (auth.uid() = solicitante_id AND status != 'concluido')
  OR is_admin(auth.uid())
);

-- Admins podem deletar tickets
CREATE POLICY "Admins can delete tickets"
ON public.suporte_tickets
FOR DELETE
USING (is_admin(auth.uid()));

-- RLS Policies para suporte_comentarios
-- Usuários podem ver comentários de seus tickets
CREATE POLICY "Users can view comments on their tickets"
ON public.suporte_comentarios
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.suporte_tickets
    WHERE id = ticket_id
    AND (solicitante_id = auth.uid() OR is_admin(auth.uid()))
  )
);

-- Usuários podem criar comentários em seus tickets
CREATE POLICY "Users can create comments on their tickets"
ON public.suporte_comentarios
FOR INSERT
WITH CHECK (
  auth.uid() = autor_id
  AND EXISTS (
    SELECT 1 FROM public.suporte_tickets
    WHERE id = ticket_id
    AND (solicitante_id = auth.uid() OR is_admin(auth.uid()))
  )
);

-- Criar índices para performance
CREATE INDEX idx_suporte_tickets_numero ON public.suporte_tickets(numero);
CREATE INDEX idx_suporte_tickets_status ON public.suporte_tickets(status);
CREATE INDEX idx_suporte_tickets_solicitante ON public.suporte_tickets(solicitante_id);
CREATE INDEX idx_suporte_tickets_data_abertura ON public.suporte_tickets(data_abertura);
CREATE INDEX idx_suporte_tickets_data_atualizacao ON public.suporte_tickets(data_ultima_atualizacao);
CREATE INDEX idx_suporte_comentarios_ticket ON public.suporte_comentarios(ticket_id);