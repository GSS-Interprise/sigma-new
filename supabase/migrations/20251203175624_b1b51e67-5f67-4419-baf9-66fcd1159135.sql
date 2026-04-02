-- Add Evolution API fields to chips table
ALTER TABLE public.chips 
ADD COLUMN IF NOT EXISTS instance_id text,
ADD COLUMN IF NOT EXISTS instance_name text,
ADD COLUMN IF NOT EXISTS connection_state text DEFAULT 'close',
ADD COLUMN IF NOT EXISTS profile_name text,
ADD COLUMN IF NOT EXISTS profile_picture_url text,
ADD COLUMN IF NOT EXISTS webhook_url text,
ADD COLUMN IF NOT EXISTS engine text DEFAULT 'baileys',
ADD COLUMN IF NOT EXISTS behavior_config jsonb DEFAULT '{"rejectCall": false, "ignoreGroups": false, "alwaysOnline": false, "readMessages": false, "syncFullHistory": false}'::jsonb,
ADD COLUMN IF NOT EXISTS proxy_config jsonb,
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT now();

-- Create index for instance_id
CREATE INDEX IF NOT EXISTS idx_chips_instance_id ON public.chips(instance_id);

-- Update updated_at trigger
CREATE OR REPLACE FUNCTION public.update_chips_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_chips_updated_at ON public.chips;
CREATE TRIGGER update_chips_updated_at
  BEFORE UPDATE ON public.chips
  FOR EACH ROW
  EXECUTE FUNCTION public.update_chips_updated_at();