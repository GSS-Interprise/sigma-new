-- =====================================================================
-- Plano Aquecimento + Anti-Ban v1 — Sprint 2
-- Tabela chip_persona — persona única atribuída a cada chip
-- Doc: .claude/plano-aquecimento-anti-ban-v1.md §4.1 Migration 002
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.chip_persona (
  chip_id uuid PRIMARY KEY REFERENCES public.chips(id) ON DELETE CASCADE,
  nome_completo text NOT NULL,
  primeiro_nome text NOT NULL,
  idade int NOT NULL CHECK (idade BETWEEN 22 AND 65),
  profissao text NOT NULL,
  cidade text NOT NULL,
  estado text NOT NULL,
  estilo_escrita jsonb NOT NULL DEFAULT '{
    "formal": false,
    "abreviacoes": true,
    "kkkk_freq": 0.15,
    "emoji_freq": 0.30,
    "typos_prob": 0.08,
    "pontuacao_completa": false
  }'::jsonb,
  interesses text[] NOT NULL DEFAULT '{}',
  vida_familiar text,
  schedule_pattern jsonb NOT NULL DEFAULT '{
    "wake_up_hour": 7,
    "sleep_hour": 23,
    "work_start": 8,
    "work_end": 18,
    "lunch_start": 12,
    "lunch_end": 13,
    "weekend_active": true,
    "weekend_factor": 0.5,
    "tz": "America/Sao_Paulo"
  }'::jsonb,
  llm_system_prompt text NOT NULL,
  voz_tts text DEFAULT 'nova',
  foto_url text,
  status_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chip_persona_estado ON public.chip_persona(estado);

GRANT ALL ON public.chip_persona TO service_role, authenticated;
