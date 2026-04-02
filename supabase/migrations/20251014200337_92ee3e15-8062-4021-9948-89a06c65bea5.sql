-- Create rate limiting table for WhatsApp sends
CREATE TABLE IF NOT EXISTS public.whatsapp_rate_limit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_rate_limit ENABLE ROW LEVEL SECURITY;

-- Create index for efficient rate limit queries
CREATE INDEX IF NOT EXISTS idx_whatsapp_rate_limit_user_time 
ON public.whatsapp_rate_limit(user_id, created_at DESC);

-- Users can only view their own rate limit records
CREATE POLICY "Users can view own rate limits"
ON public.whatsapp_rate_limit
FOR SELECT
USING (auth.uid() = user_id);

-- Allow authenticated users to insert rate limit records
CREATE POLICY "System can track rate limits"
ON public.whatsapp_rate_limit
FOR INSERT
WITH CHECK (true);

-- Auto-cleanup old records (older than 24 hours) to keep table size manageable
CREATE OR REPLACE FUNCTION public.cleanup_whatsapp_rate_limit()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.whatsapp_rate_limit
  WHERE created_at < now() - INTERVAL '24 hours';
END;
$$;