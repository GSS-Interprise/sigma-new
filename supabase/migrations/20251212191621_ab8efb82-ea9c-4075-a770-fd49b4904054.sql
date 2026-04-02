-- Criar enum para tipos de origem do card
CREATE TYPE origem_tipo_board AS ENUM ('manual', 'licitacao_arrematada');

-- Criar enum para status do kanban de captação
CREATE TYPE status_captacao_board AS ENUM ('prospectar', 'analisando', 'em_andamento', 'completo', 'descarte');

-- Criar tabela do Kanban de Captação
CREATE TABLE public.captacao_contratos_board (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  origem_tipo origem_tipo_board NOT NULL DEFAULT 'manual',
  origem_licitacao_id UUID REFERENCES public.licitacoes(id) ON DELETE SET NULL,
  contrato_id UUID REFERENCES public.contratos(id) ON DELETE SET NULL,
  status status_captacao_board NOT NULL DEFAULT 'prospectar',
  titulo_card TEXT NOT NULL,
  overlay_json JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.captacao_contratos_board ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários autenticados podem visualizar cards" 
ON public.captacao_contratos_board 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Usuários autorizados podem gerenciar cards" 
ON public.captacao_contratos_board 
FOR ALL 
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_captacao') OR 
  has_role(auth.uid(), 'gestor_contratos')
);

-- Índice único para garantir idempotência (uma licitação só pode gerar um card)
CREATE UNIQUE INDEX idx_captacao_board_licitacao_unica 
ON public.captacao_contratos_board(origem_licitacao_id) 
WHERE origem_licitacao_id IS NOT NULL;

-- Função para criar card automaticamente quando licitação for arrematada
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
RETURNS TRIGGER AS $$
BEGIN
  -- Só executar se o status mudou para 'arrematados'
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    -- Verificar se já existe card para esta licitação (idempotência)
    IF NOT EXISTS (SELECT 1 FROM public.captacao_contratos_board WHERE origem_licitacao_id = NEW.id) THEN
      INSERT INTO public.captacao_contratos_board (
        origem_tipo,
        origem_licitacao_id,
        status,
        titulo_card,
        overlay_json
      ) VALUES (
        'licitacao_arrematada',
        NEW.id,
        'prospectar',
        COALESCE(NEW.numero_edital, 'Licitação') || ' - ' || COALESCE(LEFT(NEW.objeto, 50), 'Sem objeto'),
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', NEW.objeto,
          'orgao', NEW.orgao,
          'uf', NEW.uf,
          'valor_estimado', NEW.valor_estimado,
          'data_arrematacao', now()
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger para chamar a função quando licitação for atualizada
CREATE TRIGGER trigger_create_captacao_card_on_arrematados
AFTER UPDATE ON public.licitacoes
FOR EACH ROW
EXECUTE FUNCTION public.create_captacao_card_on_licitacao_arrematada();

-- Trigger para updated_at
CREATE TRIGGER update_captacao_board_updated_at
BEFORE UPDATE ON public.captacao_contratos_board
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.captacao_contratos_board;