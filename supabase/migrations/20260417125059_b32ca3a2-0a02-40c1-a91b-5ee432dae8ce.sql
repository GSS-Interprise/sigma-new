-- Tabela principal de listas para disparo
CREATE TABLE public.disparo_listas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  descricao TEXT,
  modo TEXT NOT NULL DEFAULT 'manual' CHECK (modo IN ('manual', 'dinamica', 'mista')),
  filtro_ufs TEXT[] DEFAULT '{}',
  filtro_cidades TEXT[] DEFAULT '{}',
  filtro_especialidades TEXT[] DEFAULT '{}',
  filtro_status TEXT[] DEFAULT '{}',
  excluir_blacklist BOOLEAN NOT NULL DEFAULT true,
  total_estimado INTEGER DEFAULT 0,
  created_by UUID,
  created_by_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de itens manuais da lista
CREATE TABLE public.disparo_lista_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lista_id UUID NOT NULL REFERENCES public.disparo_listas(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  added_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(lista_id, lead_id)
);

CREATE INDEX idx_disparo_lista_itens_lista ON public.disparo_lista_itens(lista_id);
CREATE INDEX idx_disparo_lista_itens_lead ON public.disparo_lista_itens(lead_id);
CREATE INDEX idx_disparo_listas_created_by ON public.disparo_listas(created_by);

-- Habilitar RLS
ALTER TABLE public.disparo_listas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disparo_lista_itens ENABLE ROW LEVEL SECURITY;

-- Policies disparo_listas
CREATE POLICY "Autenticados podem ver listas"
  ON public.disparo_listas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Criador, admin ou líder captação podem inserir listas"
  ON public.disparo_listas FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = created_by
    OR public.is_admin(auth.uid())
    OR public.is_captacao_leader(auth.uid())
  );

CREATE POLICY "Criador, admin ou líder captação podem atualizar listas"
  ON public.disparo_listas FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_admin(auth.uid())
    OR public.is_captacao_leader(auth.uid())
  );

CREATE POLICY "Criador, admin ou líder captação podem deletar listas"
  ON public.disparo_listas FOR DELETE
  TO authenticated
  USING (
    auth.uid() = created_by
    OR public.is_admin(auth.uid())
    OR public.is_captacao_leader(auth.uid())
  );

-- Policies disparo_lista_itens
CREATE POLICY "Autenticados podem ver itens"
  ON public.disparo_lista_itens FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Criador da lista, admin ou líder podem inserir itens"
  ON public.disparo_lista_itens FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.disparo_listas l
      WHERE l.id = lista_id
        AND (
          l.created_by = auth.uid()
          OR public.is_admin(auth.uid())
          OR public.is_captacao_leader(auth.uid())
        )
    )
  );

CREATE POLICY "Criador da lista, admin ou líder podem deletar itens"
  ON public.disparo_lista_itens FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.disparo_listas l
      WHERE l.id = lista_id
        AND (
          l.created_by = auth.uid()
          OR public.is_admin(auth.uid())
          OR public.is_captacao_leader(auth.uid())
        )
    )
  );

-- Trigger updated_at
CREATE TRIGGER trg_disparo_listas_updated_at
BEFORE UPDATE ON public.disparo_listas
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();