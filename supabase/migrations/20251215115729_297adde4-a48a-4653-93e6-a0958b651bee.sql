-- Add array columns for multiple specialties and linked units
ALTER TABLE public.leads 
ADD COLUMN IF NOT EXISTS especialidades text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS unidades_vinculadas uuid[] DEFAULT '{}';