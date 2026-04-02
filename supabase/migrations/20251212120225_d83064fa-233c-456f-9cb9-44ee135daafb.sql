-- Add reaction column to sigzap_messages table
ALTER TABLE public.sigzap_messages 
ADD COLUMN reaction TEXT;

-- Add comment explaining the column
COMMENT ON COLUMN public.sigzap_messages.reaction IS 'Emoji reaction to this message';