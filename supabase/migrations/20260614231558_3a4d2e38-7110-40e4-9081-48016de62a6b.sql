
-- Configuração OAuth Google por usuário (admin define)
CREATE TABLE public.user_google_oauth_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  client_secret TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_google_oauth_config TO authenticated;
GRANT ALL ON public.user_google_oauth_config TO service_role;

ALTER TABLE public.user_google_oauth_config ENABLE ROW LEVEL SECURITY;

-- O próprio usuário pode ver/usar sua config (precisa pra montar a auth URL)
CREATE POLICY "user reads own oauth config"
ON public.user_google_oauth_config FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Admin pode gerenciar todas
CREATE POLICY "admin manages all oauth configs"
ON public.user_google_oauth_config FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_user_google_oauth_config_updated
BEFORE UPDATE ON public.user_google_oauth_config
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tokens OAuth do Google por usuário (preenchido pelo callback)
CREATE TABLE public.user_google_calendar_tokens (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  google_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_google_calendar_tokens TO authenticated;
GRANT ALL ON public.user_google_calendar_tokens TO service_role;

ALTER TABLE public.user_google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user manages own google tokens"
ON public.user_google_calendar_tokens FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_user_google_calendar_tokens_updated
BEFORE UPDATE ON public.user_google_calendar_tokens
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
