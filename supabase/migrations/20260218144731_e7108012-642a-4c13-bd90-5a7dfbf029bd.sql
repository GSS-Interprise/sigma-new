
-- Add created_by column to chips table to track who created each instance
ALTER TABLE public.chips ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Also add created_by_name for display without needing joins
ALTER TABLE public.chips ADD COLUMN created_by_name text;
