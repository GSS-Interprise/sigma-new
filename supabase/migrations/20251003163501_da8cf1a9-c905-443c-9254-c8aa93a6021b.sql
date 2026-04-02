-- Fix overly permissive RLS policies to implement proper role-based access control
-- This addresses the critical PUBLIC_DATA_EXPOSURE security finding

-- ============================================
-- 1. CLIENTES TABLE - Client Management
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can manage clientes" ON public.clientes;
DROP POLICY IF EXISTS "Authenticated users can view clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admins and gestores can manage clientes" ON public.clientes;

-- Admins and gestores can fully manage clients
CREATE POLICY "Admins and gestores can manage clientes"
ON public.clientes
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role)
);

-- Recrutadores can view clients (read-only)
CREATE POLICY "Recrutadores can view clientes"
ON public.clientes
FOR SELECT
USING (has_role(auth.uid(), 'recrutador'::app_role));

-- ============================================
-- 2. MEDICOS TABLE - Doctor Management
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view medicos" ON public.medicos;
DROP POLICY IF EXISTS "Authenticated users can insert medicos" ON public.medicos;
DROP POLICY IF EXISTS "Authenticated users can update medicos" ON public.medicos;
DROP POLICY IF EXISTS "Authenticated users can delete medicos" ON public.medicos;

-- Admins and recrutadores can fully manage doctors
CREATE POLICY "Admins and recrutadores can manage medicos"
ON public.medicos
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'recrutador'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'recrutador'::app_role)
);

-- Coordenadores de escalas can view doctors
CREATE POLICY "Coordenadores can view medicos"
ON public.medicos
FOR SELECT
USING (has_role(auth.uid(), 'coordenador_escalas'::app_role));

-- ============================================
-- 3. CONTRATOS TABLE - Basic Contracts
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view contratos" ON public.contratos;
DROP POLICY IF EXISTS "Authenticated users can insert contratos" ON public.contratos;
DROP POLICY IF EXISTS "Authenticated users can update contratos" ON public.contratos;
DROP POLICY IF EXISTS "Authenticated users can delete contratos" ON public.contratos;

-- Admins, gestores, and recrutadores can manage contracts
CREATE POLICY "Authorized users can manage contratos"
ON public.contratos
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role) OR
  has_role(auth.uid(), 'recrutador'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role) OR
  has_role(auth.uid(), 'recrutador'::app_role)
);

-- ============================================
-- 4. RELACIONAMENTO_MEDICO TABLE
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view relacionamento_medico" ON public.relacionamento_medico;
DROP POLICY IF EXISTS "Authenticated users can insert relacionamento_medico" ON public.relacionamento_medico;
DROP POLICY IF EXISTS "Authenticated users can update relacionamento_medico" ON public.relacionamento_medico;
DROP POLICY IF EXISTS "Authenticated users can delete relacionamento_medico" ON public.relacionamento_medico;

-- Admins, gestores, and recrutadores can manage doctor relationships
CREATE POLICY "Authorized users can manage relacionamento_medico"
ON public.relacionamento_medico
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role) OR
  has_role(auth.uid(), 'recrutador'::app_role)
)
WITH CHECK (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_demanda'::app_role) OR
  has_role(auth.uid(), 'recrutador'::app_role)
);

-- ============================================
-- 5. Fix search_path on existing functions
-- ============================================
-- Update handle_new_user function with fixed search_path
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, nome_completo, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nome_completo', 'Usuário'),
    NEW.email
  );
  RETURN NEW;
END;
$function$;