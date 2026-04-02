-- Atualizar RLS policies das tabelas de radiologia para incluir gestor_radiologia

-- radiologia_agendas
DROP POLICY IF EXISTS "Authorized users can manage radiologia_agendas" ON radiologia_agendas;
CREATE POLICY "Authorized users can manage radiologia_agendas"
ON radiologia_agendas
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_producao_exames
DROP POLICY IF EXISTS "Authorized users can manage radiologia_producao_exames" ON radiologia_producao_exames;
CREATE POLICY "Authorized users can manage radiologia_producao_exames"
ON radiologia_producao_exames
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_pendencias
DROP POLICY IF EXISTS "Authorized users can manage radiologia_pendencias" ON radiologia_pendencias;
CREATE POLICY "Authorized users can manage radiologia_pendencias"
ON radiologia_pendencias
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_ajuste_laudos
DROP POLICY IF EXISTS "Authorized users can manage radiologia_ajuste_laudos" ON radiologia_ajuste_laudos;
CREATE POLICY "Authorized users can manage radiologia_ajuste_laudos"
ON radiologia_ajuste_laudos
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_exames_atraso
DROP POLICY IF EXISTS "Authorized users can manage radiologia_exames_atraso" ON radiologia_exames_atraso;
CREATE POLICY "Authorized users can manage radiologia_exames_atraso"
ON radiologia_exames_atraso
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);

-- radiologia_ecg
DROP POLICY IF EXISTS "Authorized users can manage radiologia_ecg" ON radiologia_ecg;
CREATE POLICY "Authorized users can manage radiologia_ecg"
ON radiologia_ecg
FOR ALL
USING (
  is_admin(auth.uid()) OR 
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR 
  has_role(auth.uid(), 'gestor_radiologia'::app_role)
);