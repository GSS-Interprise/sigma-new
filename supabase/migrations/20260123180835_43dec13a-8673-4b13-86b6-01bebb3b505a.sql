-- Adicionar política para permitir que usuários autenticados leiam a URL do webhook de email
CREATE POLICY "Authenticated users can read email webhook url"
ON public.supabase_config
FOR SELECT
USING (
  auth.uid() IS NOT NULL 
  AND chave = 'email_webhook_url'
);