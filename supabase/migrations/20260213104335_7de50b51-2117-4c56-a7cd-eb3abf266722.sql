
-- Add sent_by_user_id to track which user sent each message
ALTER TABLE public.sigzap_messages 
ADD COLUMN sent_by_user_id uuid DEFAULT NULL;

-- Add instance_name to track which instance was used
ALTER TABLE public.sigzap_messages 
ADD COLUMN sent_via_instance_name text DEFAULT NULL;

-- Index for querying by sender
CREATE INDEX idx_sigzap_messages_sent_by ON public.sigzap_messages(sent_by_user_id) WHERE sent_by_user_id IS NOT NULL;
