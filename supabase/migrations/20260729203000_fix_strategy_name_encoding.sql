-- Use a PostgreSQL Unicode escape so the value stays correct even when a SQL
-- client or terminal has a different code page.
UPDATE public.campaign_strategies
SET nome = U&'Estrat\00E9gia principal'
WHERE nome = U&'Estrat\FFFDgia principal'
   OR nome LIKE '%' || U&'\FFFD' || '%';

CREATE OR REPLACE FUNCTION public.create_default_campaign_strategy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.campaign_strategies(
    campanha_id, nome, status, prioridade, publico_alvo, abordagem,
    briefing_ia, inicio_em, created_by
  )
  VALUES (
    NEW.id,
    U&'Estrat\00E9gia principal',
    CASE WHEN NEW.status::text = 'ativa' THEN 'ativa' ELSE 'rascunho' END,
    100,
    coalesce(NEW.publico_alvo, '{}'::jsonb),
    NEW.mensagem_inicial,
    coalesce(NEW.briefing_ia, '{}'::jsonb),
    NEW.data_inicio,
    NEW.criado_por
  )
  ON CONFLICT (campanha_id, nome) DO NOTHING;
  RETURN NEW;
END;
$$;
