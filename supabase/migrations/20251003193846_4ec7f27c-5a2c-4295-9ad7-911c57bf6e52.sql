-- Create enum for user status
CREATE TYPE user_status AS ENUM ('ativo', 'inativo', 'suspenso');

-- Add status column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN status user_status NOT NULL DEFAULT 'ativo';