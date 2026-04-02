-- Adicionar campos faltantes na tabela ages_contratos
ALTER TABLE public.ages_contratos
ADD COLUMN IF NOT EXISTS condicao_pagamento TEXT,
ADD COLUMN IF NOT EXISTS valor_estimado TEXT,
ADD COLUMN IF NOT EXISTS dias_antecedencia_aviso INTEGER DEFAULT 60;