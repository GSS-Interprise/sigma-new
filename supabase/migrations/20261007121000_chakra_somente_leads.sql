-- Número de uso pessoal da equipe conectado por coexistence: quando ligado, o Sigma só
-- grava conversa com quem está na base de leads. Padrão desligado (números da empresa,
-- como o do financeiro, recebem mensagem de quem não é lead).
ALTER TABLE public.whatsapp_chakra_connections
  ADD COLUMN IF NOT EXISTS somente_leads boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.whatsapp_chakra_connections.somente_leads IS
  'true = descarta mensagens (recebidas e enviadas) de contatos que não são leads. Para números pessoais da equipe.';
