-- Add UPDATE policy for comunicacao_mensagens to allow users to edit their own messages
CREATE POLICY "Users can update their own messages" 
ON public.comunicacao_mensagens 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);