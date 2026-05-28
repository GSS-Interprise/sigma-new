-- Templates de email/WhatsApp por campanha — arquitetura templates-email-por-campanha.md
--
-- Incidente 28/05/2026: Dr. Mauricio Macagnan (radiologista) recebeu email
-- "Oportunidade UTI Pediátrica em Cruz Alta" com WhatsApp (51) 99540-1928
-- hardcoded, mesmo estando na campanha de Telediagnóstico Radiologia.
-- Auditoria: ~493 leads de Psiquiatria + Telediagnóstico receberam o mesmo
-- email fora do perfil.
--
-- Esta migration prepara as colunas pra cada campanha ter sua própria
-- identidade de remetente + descrição de oportunidade, eliminando
-- hardcode e descasamento perfil↔conteúdo.

ALTER TABLE public.campanhas
  ADD COLUMN IF NOT EXISTS whatsapp_remetente text NULL,
  ADD COLUMN IF NOT EXISTS nome_remetente text NULL DEFAULT 'Equipe GSS',
  ADD COLUMN IF NOT EXISTS descricao_oportunidade text NULL;

COMMENT ON COLUMN public.campanhas.whatsapp_remetente IS 'WhatsApp do remetente exibido no email/template — formato livre (ex: "(51) 99540-1928"). Vazio = linha some no template via bloco condicional.';
COMMENT ON COLUMN public.campanhas.nome_remetente IS 'Nome exibido na assinatura do email/template. Default: "Equipe GSS".';
COMMENT ON COLUMN public.campanhas.descricao_oportunidade IS 'Frase curta descrevendo o que a campanha oferece. Ex: "uma vaga de Telediagnóstico em Radiologia, 100% remoto, atendendo 3 hospitais em SC".';

-- T2 — Backfill da Pediatria UTI Chapecó (única campanha confiável hoje)
UPDATE public.campanhas
SET
  whatsapp_remetente   = '(51) 99540-1928',
  nome_remetente       = 'Dr. Maikon Madeira',
  descricao_oportunidade = 'uma oportunidade de UTI Pediátrica'
WHERE id = 'f75e8e74-24c7-40e4-9349-772e650818aa';

-- Backfills das campanhas pausadas — preencher com descrição coerente pra
-- estar pronto quando o operador despausar (depois de revisão do Maikon).
UPDATE public.campanhas
SET
  whatsapp_remetente   = '(51) 99540-1928',
  nome_remetente       = 'Dr. Maikon Madeira',
  descricao_oportunidade = 'uma oportunidade de atendimento em Psiquiatria'
WHERE id = '7cb7cd8c-b42a-4247-aeb3-c5f1201eefcd'  -- Psiquiatria Extremo Oeste
  AND descricao_oportunidade IS NULL;

UPDATE public.campanhas
SET
  whatsapp_remetente   = '(51) 99540-1928',
  nome_remetente       = 'Dr. Maikon Madeira',
  descricao_oportunidade = 'uma vaga de Telediagnóstico em Radiologia, 100% remoto, atendendo 3 hospitais em SC'
WHERE id = 'e3065cf5-4d82-4b42-944e-91cbf89bd108'  -- Telediagnóstico Radiologia
  AND descricao_oportunidade IS NULL;
