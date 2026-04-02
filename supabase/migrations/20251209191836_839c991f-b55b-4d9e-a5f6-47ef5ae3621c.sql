-- Tornar o bucket sigzap-media público para permitir acesso às URLs de mídia
UPDATE storage.buckets 
SET public = true 
WHERE id = 'sigzap-media';

-- Se não existir, criar como público
INSERT INTO storage.buckets (id, name, public)
VALUES ('sigzap-media', 'sigzap-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;