-- Função para remover automaticamente o card do Kanban quando os 3 campos de aprovação forem marcados
CREATE OR REPLACE FUNCTION public.auto_remove_kanban_card_on_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Se todas as 3 aprovações estão marcadas como true
  IF NEW.aprovacao_contrato_assinado = true 
     AND NEW.aprovacao_documentacao_unidade = true 
     AND NEW.aprovacao_cadastro_unidade = true THEN
    -- Deleta o card do kanban vinculado a este médico
    DELETE FROM public.medico_kanban_cards 
    WHERE medico_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger que executa após UPDATE na tabela medicos
CREATE TRIGGER trigger_remove_kanban_on_approval
  AFTER UPDATE ON public.medicos
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_remove_kanban_card_on_approval();

-- Limpar cards órfãos existentes (médicos já aprovados que ainda estão no Kanban)
DELETE FROM public.medico_kanban_cards 
WHERE medico_id IN (
  SELECT m.id FROM public.medicos m
  WHERE m.aprovacao_contrato_assinado = true
    AND m.aprovacao_documentacao_unidade = true
    AND m.aprovacao_cadastro_unidade = true
);