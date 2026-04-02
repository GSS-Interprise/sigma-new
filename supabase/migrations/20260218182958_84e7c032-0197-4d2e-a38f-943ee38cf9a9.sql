
-- Drop the old restrictive ALL policy that only allowed gestores
DROP POLICY IF EXISTS "Gestores podem gerenciar proposta_itens" ON public.proposta_itens;
