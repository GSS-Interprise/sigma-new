-- Add updated_at column to effect_sync_logs table
ALTER TABLE public.effect_sync_logs 
ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();