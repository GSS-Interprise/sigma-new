-- Allow all authenticated users to read the licitacao_webhook_url key
CREATE POLICY "All authenticated can read licitacao_webhook_url"
ON public.supabase_config
FOR SELECT
TO authenticated
USING (chave = 'licitacao_webhook_url');
