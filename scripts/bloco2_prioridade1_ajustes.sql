-- PRIORIDADE 1 — Ajustes para tornar o sistema funcional
-- Data: 19/04/2026

-- 1. Corrigir trigger handoff (sem dependência de campanha_propostas)
CREATE OR REPLACE FUNCTION notificar_lead_quente()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'quente' AND (OLD IS NULL OR OLD.status != 'quente') THEN
    INSERT INTO tarefas_captacao (
      lead_id,
      canal,
      tipo,
      status,
      prioridade,
      titulo,
      descricao
    ) VALUES (
      NEW.lead_id,
      COALESCE(NEW.canal_atual, 'whatsapp'),
      'solicitacao',
      'aberta',
      'urgente',
      'Lead quente - assumir conversa',
      'Lead qualificado pela IA como quente na campanha. Assumir conversa e fechar negociacao.'
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Novos campos de disparo em campanhas
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS delay_min_ms INTEGER DEFAULT 8000;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS delay_max_ms INTEGER DEFAULT 25000;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS batch_size INTEGER DEFAULT 10;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS delay_between_batches_min INTEGER DEFAULT 300;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS delay_between_batches_max INTEGER DEFAULT 600;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS chip_ids UUID[] DEFAULT '{}';
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS rotation_strategy TEXT DEFAULT 'round_robin';
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS next_batch_at TIMESTAMPTZ;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS responsaveis UUID[];
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS disparos_enviados INTEGER DEFAULT 0;
ALTER TABLE campanhas ADD COLUMN IF NOT EXISTS disparos_falhas INTEGER DEFAULT 0;

-- 3. Novos campos em campanha_leads para rastreamento de disparo
ALTER TABLE campanha_leads ADD COLUMN IF NOT EXISTS variation_indices INTEGER[];
ALTER TABLE campanha_leads ADD COLUMN IF NOT EXISTS chip_usado_id UUID;
ALTER TABLE campanha_leads ADD COLUMN IF NOT EXISTS erro_envio TEXT;
ALTER TABLE campanha_leads ADD COLUMN IF NOT EXISTS mensagem_enviada TEXT;
