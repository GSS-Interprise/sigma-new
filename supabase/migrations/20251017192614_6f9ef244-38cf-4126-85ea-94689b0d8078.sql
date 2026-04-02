-- Fix search_path for generate_codigo_bem function
CREATE OR REPLACE FUNCTION generate_codigo_bem()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(codigo_bem FROM 'PAT-(\d+)') AS INTEGER)), 0) + 1
  INTO next_num
  FROM public.patrimonio;
  
  NEW.codigo_bem := 'PAT-' || LPAD(next_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$;