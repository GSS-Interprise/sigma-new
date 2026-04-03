
-- Also allow them to update proposta_itens (for editing linked proposals)
DROP POLICY IF EXISTS "Captadores podem atualizar proposta_itens" ON public.proposta_itens;
CREATE POLICY "Captadores podem atualizar proposta_itens"
ON public.proposta_itens
FOR UPDATE
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
);

-- Also allow delete for captadores
DROP POLICY IF EXISTS "Captadores podem deletar proposta_itens" ON public.proposta_itens;
CREATE POLICY "Captadores podem deletar proposta_itens"
ON public.proposta_itens
FOR DELETE
USING (
  is_admin(auth.uid()) 
  OR has_role(auth.uid(), 'gestor_captacao'::app_role) 
  OR has_role(auth.uid(), 'gestor_contratos'::app_role)
  OR is_captacao_leader(auth.uid())
  OR has_captacao_permission(auth.uid(), 'contratos_servicos'::text)
);


-- === 20260218182958_84e7c032-0197-4d2e-a38f-943ee38cf9a9.sql ===

-- Drop the old restrictive ALL policy that only allowed gestores
DROP POLICY IF EXISTS "Gestores podem gerenciar proposta_itens" ON public.proposta_itens;


-- === 20260223184151_058592d3-7b89-44f5-a539-ebe0adb8a23e.sql ===

-- 1. Adicionar coluna especialidades_crua
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS especialidades_crua TEXT;

-- 2. Limpar CPFs duplicados (manter o mais recente)
DELETE FROM leads 
WHERE id NOT IN (
  SELECT DISTINCT ON (cpf) id 
  FROM leads 
  WHERE cpf IS NOT NULL AND TRIM(cpf) != ''
  ORDER BY cpf, updated_at DESC NULLS LAST
)
AND cpf IN (
  SELECT cpf FROM leads 
  WHERE cpf IS NOT NULL AND TRIM(cpf) != ''
  GROUP BY cpf HAVING COUNT(*) > 1
);

-- 3. Criar indice unique parcial no CPF
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_cpf_unique 
ON public.leads (cpf) WHERE cpf IS NOT NULL AND TRIM(cpf) != '';

-- 4. Relaxar phone_e164 (permitir NULL)
DO $altc$ BEGIN ALTER TABLE public.leads ALTER COLUMN phone_e164 DROP NOT NULL; EXCEPTION WHEN undefined_column THEN NULL; WHEN undefined_table THEN NULL; END $altc$;

-- 5. Atualizar trigger chave_unica para priorizar CPF
CREATE OR REPLACE FUNCTION public.generate_lead_chave_unica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.cpf IS NOT NULL AND TRIM(NEW.cpf) != '' THEN
    NEW.chave_unica := 'cpf_' || REGEXP_REPLACE(NEW.cpf, '[^0-9]', '', 'g');
  ELSIF NEW.nome IS NOT NULL AND NEW.data_nascimento IS NOT NULL THEN
    NEW.chave_unica := LOWER(TRIM(NEW.nome)) || '_' || NEW.data_nascimento;
  ELSE
    NEW.chave_unica := NULL;
  END IF;
  RETURN NEW;
END;
$function$;


-- === 20260223185012_5aa11ac1-1548-4c72-bf6e-3d3402a0c336.sql ===

-- 1. Limpar leads com CPF duplicado (manter o mais recente por updated_at)
DELETE FROM public.leads a
USING public.leads b
WHERE a.id != b.id
  AND a.cpf IS NOT NULL AND TRIM(a.cpf) != ''
  AND b.cpf IS NOT NULL AND TRIM(b.cpf) != ''
  AND REGEXP_REPLACE(a.cpf, '[^0-9]', '', 'g') = REGEXP_REPLACE(b.cpf, '[^0-9]', '', 'g')
  AND a.updated_at < b.updated_at;

-- 2. Criar tabela especialidades normalizada
CREATE TABLE IF NOT EXISTS public.especialidades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.especialidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Especialidades são visíveis por todos autenticados" ON public.especialidades;
CREATE POLICY "Especialidades são visíveis por todos autenticados"
  ON public.especialidades FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Admins podem gerenciar especialidades" ON public.especialidades;
CREATE POLICY "Admins podem gerenciar especialidades"
  ON public.especialidades FOR ALL
  USING (public.is_admin(auth.uid()));

-- 3. Popular com dados existentes
INSERT INTO public.especialidades (nome)
SELECT DISTINCT UPPER(TRIM(especialidade))
FROM public.leads
WHERE especialidade IS NOT NULL AND TRIM(especialidade) != ''
ON CONFLICT (nome) DO NOTHING;

-- 4. Adicionar FK na tabela leads
DO $acol$ BEGIN ALTER TABLE public.leads ADD COLUMN especialidade_id UUID REFERENCES public.especialidades(id); EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;
CREATE INDEX IF NOT EXISTS idx_leads_especialidade_id ON public.leads (especialidade_id);

-- 5. Dropar triggers de user-land temporariamente
DROP TRIGGER IF EXISTS trigger_lead_chave_unica ON public.leads;
DROP TRIGGER IF EXISTS update_leads_updated_at ON public.leads;
DROP TRIGGER IF EXISTS validate_lead_status_trigger ON public.leads;

-- 6. Preencher especialidade_id
UPDATE public.leads l
SET especialidade_id = e.id
FROM public.especialidades e
WHERE UPPER(TRIM(l.especialidade)) = e.nome
  AND l.especialidade IS NOT NULL
  AND TRIM(l.especialidade) != '';

-- 7. Recriar triggers
DROP TRIGGER IF EXISTS "trigger_lead_chave_unica" ON public.leads;
CREATE TRIGGER trigger_lead_chave_unica
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.generate_lead_chave_unica();

DROP TRIGGER IF EXISTS "update_leads_updated_at" ON public.leads;
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "validate_lead_status_trigger" ON public.leads;
CREATE TRIGGER validate_lead_status_trigger
  BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.validate_lead_status();

-- 8. Índices para SELECT DISTINCT
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads (status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_origem ON public.leads (origem) WHERE origem IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_uf ON public.leads (uf) WHERE uf IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_cidade ON public.leads (cidade) WHERE cidade IS NOT NULL;


-- === 20260223190713_567fd19f-51ca-4059-b8e0-02bd0a0c9f58.sql ===
CREATE OR REPLACE FUNCTION public.get_leads_especialidade_counts()
RETURNS TABLE(especialidade_id uuid, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT especialidade_id, count(*) as count
  FROM public.leads
  WHERE especialidade_id IS NOT NULL
  GROUP BY especialidade_id;
$$;

-- === 20260223190910_46928d6b-9994-49ba-823d-fa17d2a1d9d9.sql ===
CREATE OR REPLACE FUNCTION public.get_leads_filter_counts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'status', (SELECT jsonb_object_agg(status, cnt) FROM (SELECT status, count(*) as cnt FROM leads WHERE status IS NOT NULL AND status != '' GROUP BY status) s),
    'origem', (SELECT jsonb_object_agg(origem, cnt) FROM (SELECT origem, count(*) as cnt FROM leads WHERE origem IS NOT NULL AND origem != '' GROUP BY origem) o),
    'uf', (SELECT jsonb_object_agg(uf, cnt) FROM (SELECT uf, count(*) as cnt FROM leads WHERE uf IS NOT NULL AND uf != '' GROUP BY uf) u),
    'cidade', (SELECT jsonb_object_agg(cidade, cnt) FROM (SELECT cidade, count(*) as cnt FROM leads WHERE cidade IS NOT NULL AND cidade != '' GROUP BY cidade) c),
    'especialidade', (SELECT jsonb_object_agg(especialidade_id::text, cnt) FROM (SELECT especialidade_id, count(*) as cnt FROM leads WHERE especialidade_id IS NOT NULL GROUP BY especialidade_id) e)
  ) INTO result;
  
  RETURN result;
END;
$$;

-- === 20260226124700_2e35531b-b32f-4aed-a136-5cd306028fd1.sql ===
-- Adicionar gestor_financeiro e outros roles às policies de contrato_anexos
DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
DROP POLICY IF EXISTS "Authorized users can view contrato_anexos" ON public.contrato_anexos;
CREATE POLICY "Authorized users can view contrato_anexos"
ON public.contrato_anexos FOR SELECT
USING (
  is_admin(auth.uid()) OR
  has_role(auth.uid(), 'gestor_contratos') OR
  has_role(auth.uid(), 'gestor_captacao') OR
  has_role(auth.uid(), 'gestor_financeiro') OR
  has_role(auth.uid(), 'diretoria') OR
  has_role(auth.uid(), 'lideres') OR
  has_role(auth.uid(), 'coordenador_escalas') OR
  is_captacao_leader(auth.uid())
);

-- Também adicionar storage policy para contratos-documentos para gestor_financeiro
-- (o bucket contratos-documentos já tem policy via storage.objects)


-- === 20260226132425_99961531-eb69-4414-92e2-f30dd07258b0.sql ===
ALTER TABLE public.licitacoes ADD COLUMN IF NOT EXISTS objeto_contrato TEXT;

-- === 20260226135938_499daed8-5d9d-4d84-92ef-12e19abb6454.sql ===
ALTER TABLE public.licitacoes ADD COLUMN IF NOT EXISTS cnpj_orgao text;

-- === 20260226140635_8caf1781-6316-405d-a274-b9d4537e2dc7.sql ===

DROP POLICY IF EXISTS "Financeiro e líderes podem visualizar contrato_itens" ON public.contrato_itens;
CREATE POLICY "Financeiro e líderes podem visualizar contrato_itens"
ON public.contrato_itens
FOR SELECT
USING (
  is_admin(auth.uid()) OR
  has_role(auth.uid(), 'gestor_contratos'::app_role) OR
  has_role(auth.uid(), 'gestor_captacao'::app_role) OR
  has_role(auth.uid(), 'gestor_financeiro'::app_role) OR
  has_role(auth.uid(), 'diretoria'::app_role) OR
  has_role(auth.uid(), 'lideres'::app_role) OR
  has_role(auth.uid(), 'coordenador_escalas'::app_role)
);


-- === 20260303190730_74354ccc-ccb8-40f6-91dc-5308fc5eac4e.sql ===

ALTER TABLE public.leads 
  ADD COLUMN IF NOT EXISTS api_enrich_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS api_enrich_last_attempt timestamptz,
  ADD COLUMN IF NOT EXISTS api_enrich_source text;

CREATE INDEX IF NOT EXISTS idx_leads_enrich_status 
  ON public.leads(api_enrich_status, api_enrich_last_attempt);


-- === 20260310122931_f9ff8d80-1a0e-4651-8a77-a8fc92809ca3.sql ===

-- Corrigir rascunhos que já têm contrato_id mas estão com status 'rascunho'
-- Esses registros já foram consolidados mas a atualização de status falhou
UPDATE contrato_rascunho
SET 
  status = 'consolidado',
  consolidado_em = COALESCE(consolidado_em, updated_at, created_at)
WHERE 
  status = 'rascunho' 
  AND contrato_id IS NOT NULL;


-- === 20260312124412_caeee496-f20c-4ad9-8aa4-f87404bfd812.sql ===

-- Remove a constraint UNIQUE de 'numero' (não faz sentido, múltiplas instâncias podem compartilhar número)
ALTER TABLE public.chips DROP CONSTRAINT IF EXISTS chips_numero_key;

-- Adiciona UNIQUE em instance_name para permitir UPSERT correto
DO $ac$ BEGIN ALTER TABLE public.chips ADD CONSTRAINT chips_instance_name_key UNIQUE (instance_name); EXCEPTION WHEN duplicate_object THEN NULL; END $ac$;


-- === 20260312194816_5f5b89e1-bf13-4b5c-acef-39614d6e0af7.sql ===
ALTER TABLE captacao_permissoes_usuario ADD COLUMN IF NOT EXISTS realtime_licitacoes boolean NOT NULL DEFAULT false;

-- === 20260317135448_93e06409-b15d-487b-be1a-bc7d60bc2e71.sql ===

CREATE TABLE IF NOT EXISTS public.import_leads_failed_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload jsonb NOT NULL,
  error_code text,
  error_message text,
  attempts integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  next_retry_at timestamptz NOT NULL DEFAULT now() + interval '5 minutes',
  resolved_at timestamptz,
  lead_id uuid
);

CREATE INDEX IF NOT EXISTS idx_import_leads_failed_queue_status_retry 
  ON public.import_leads_failed_queue(status, next_retry_at)
  WHERE status IN ('pending', 'processing');

ALTER TABLE public.import_leads_failed_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access to failed queue" ON public.import_leads_failed_queue;
CREATE POLICY "Service role full access to failed queue"
  ON public.import_leads_failed_queue
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- === 20260317143138_c74a68da-9903-4356-a0c7-455585fdbd26.sql ===

-- Adicionar coluna abandonment_reason à tabela import_leads_failed_queue
ALTER TABLE public.import_leads_failed_queue
  ADD COLUMN IF NOT EXISTS abandonment_reason text;

COMMENT ON COLUMN public.import_leads_failed_queue.abandonment_reason IS 
  'Motivo do abandono: invalid_payload | phone_conflict_unresolvable | lead_not_found | max_retries_exceeded | timeout | unknown_error';

CREATE INDEX IF NOT EXISTS idx_failed_queue_abandonment_reason 
  ON public.import_leads_failed_queue(abandonment_reason)
  WHERE abandonment_reason IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_failed_queue_retry_scan
  ON public.import_leads_failed_queue(status, next_retry_at)
  WHERE status = 'pending';


-- === 20260317163027_fab2a3e0-f594-4fb4-b147-5e471d0741fe.sql ===

-- Adicionar coluna abandonment_reason à tabela import_leads_failed_queue (se não existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'import_leads_failed_queue'
      AND column_name = 'abandonment_reason'
  ) THEN
    DO $acol$ BEGIN ALTER TABLE public.import_leads_failed_queue
      ADD COLUMN abandonment_reason text; EXCEPTION WHEN duplicate_column THEN NULL; END $acol$;
  END IF;
END;
$$;

-- Index para facilitar diagnóstico por razão de abandono
CREATE INDEX IF NOT EXISTS idx_failed_queue_abandonment_reason
  ON public.import_leads_failed_queue(abandonment_reason)
  WHERE status = 'abandoned';

-- Index composto para o cron: busca por pending + next_retry_at
CREATE INDEX IF NOT EXISTS idx_failed_queue_pending_retry
  ON public.import_leads_failed_queue(status, next_retry_at)
  WHERE status = 'pending';


-- === 20260317185753_c3c13eb3-2711-4972-b594-42e406e7018e.sql ===

-- Drop políticas existentes conflitantes
DROP POLICY IF EXISTS "Admins podem visualizar todos os logs" ON public.auditoria_logs;
DROP POLICY IF EXISTS "Usuários podem ver seus próprios logs" ON public.auditoria_logs;

-- Política única consolidada: admin e líder veem tudo; usuário normal vê apenas os seus
DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;
CREATE POLICY "auditoria_logs_select"
ON public.auditoria_logs
FOR SELECT
USING (
  is_admin(auth.uid())
  OR is_leader(auth.uid())
  OR (auth.uid() = usuario_id)
);


-- === 20260317190305_d296c7a2-60af-4c29-8d3f-0a2e4356bb7d.sql ===

-- Atualizar política RLS: apenas admins podem visualizar logs de auditoria
DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;

DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;
CREATE POLICY "auditoria_logs_select"
ON public.auditoria_logs
FOR SELECT
USING (is_admin(auth.uid()));


-- === 20260317190547_f4f913a4-6575-4015-82f7-d35211418aba.sql ===

-- Substituir por política direta sem depender da função is_admin
DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;

DROP POLICY IF EXISTS "auditoria_logs_select" ON public.auditoria_logs;
CREATE POLICY "auditoria_logs_select"
ON public.auditoria_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);


-- === 20260318172631_74a307c6-1526-47b3-9576-92cabb22795d.sql ===

CREATE INDEX IF NOT EXISTS idx_leads_cpf_digits 
ON public.leads (REGEXP_REPLACE(cpf, '\D', '', 'g'))
WHERE cpf IS NOT NULL;


-- === 20260325173640_b9ae8d14-6912-4cd7-86f8-c2aacaa63c59.sql ===
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS emails_adicionais text[] DEFAULT '{}';

-- === 20260325182106_2fc9c5b4-d1e2-4d29-afe2-904d3fdc9026.sql ===
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS data_formatura date;

-- === 20260326122101_f11b47f3-3bd5-47e4-acbe-f68cfd4f7fdb.sql ===

-- Create leads_bloqueio_temporario table
CREATE TABLE public.leads_bloqueio_temporario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  motivo TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,
  removed_by UUID
);

-- Enable RLS
ALTER TABLE public.leads_bloqueio_temporario ENABLE ROW LEVEL SECURITY;

-- Indexes for fast lookup
CREATE INDEX idx_leads_bloqueio_lead_id ON public.leads_bloqueio_temporario(lead_id);
CREATE INDEX idx_leads_bloqueio_active ON public.leads_bloqueio_temporario(lead_id) WHERE removed_at IS NULL;

-- SELECT: all authenticated users
DROP POLICY IF EXISTS "Authenticated can view bloqueio temporario" ON public.leads_bloqueio_temporario;
CREATE POLICY "Authenticated can view bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: authenticated users (must set their own created_by)
DROP POLICY IF EXISTS "Authenticated can insert bloqueio temporario" ON public.leads_bloqueio_temporario;
CREATE POLICY "Authenticated can insert bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- UPDATE (unblocking - setting removed_at): all authenticated users
DROP POLICY IF EXISTS "Authenticated can update bloqueio temporario" ON public.leads_bloqueio_temporario;
CREATE POLICY "Authenticated can update bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE: only admin / gestor_captacao
DROP POLICY IF EXISTS "Admins can delete bloqueio temporario" ON public.leads_bloqueio_temporario;
CREATE POLICY "Admins can delete bloqueio temporario"
  ON public.leads_bloqueio_temporario
  FOR DELETE
  TO authenticated
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_captacao')
  );


-- === 20260326135243_b17cec99-daf2-422e-9e7e-f85eba5801b6.sql ===

-- =====================================================================
-- FIX 1: Update trigger — only recalculate chave_unica when relevant
-- fields change (prevents conflict on enrichment-only updates)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.generate_lead_chave_unica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- On UPDATE: skip recalculation if CPF, nome and data_nascimento are unchanged
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.cpf IS NOT DISTINCT FROM OLD.cpf)
       AND (NEW.nome IS NOT DISTINCT FROM OLD.nome)
       AND (NEW.data_nascimento IS NOT DISTINCT FROM OLD.data_nascimento) THEN
      RETURN NEW;
    END IF;
  END IF;

  -- (Re)calculate chave_unica
  IF NEW.cpf IS NOT NULL AND TRIM(NEW.cpf) != '' THEN
    NEW.chave_unica := 'cpf_' || REGEXP_REPLACE(NEW.cpf, '[^0-9]', '', 'g');
  ELSIF NEW.nome IS NOT NULL AND NEW.data_nascimento IS NOT NULL THEN
    NEW.chave_unica := LOWER(TRIM(NEW.nome)) || '_' || NEW.data_nascimento;
  ELSE
    NEW.chave_unica := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- =====================================================================
-- FIX 2: Clean up duplicate leads
-- DELETE newer duplicates FIRST, then fix chave_unica on the kept ones
-- =====================================================================

-- cpf 00857458043: remove newer (22217718), then fix older (2b786cfa)
DELETE FROM leads WHERE id = '22217718-9dfb-49ea-a222-7b63737d780d';
UPDATE leads SET chave_unica = 'cpf_00857458043'
  WHERE id = '2b786cfa-46fa-4426-bc7d-eefad71b65b0' AND (chave_unica IS NULL OR chave_unica != 'cpf_00857458043');

-- cpf 05361763969: remove newer (423ae390), fix older (a7c742a4)
DELETE FROM leads WHERE id = '423ae390-66c6-4b65-b486-fdf5c2fd2fd7';
UPDATE leads SET chave_unica = 'cpf_05361763969'
  WHERE id = 'a7c742a4-b33f-48e7-afa5-5f25e4205a52' AND (chave_unica IS NULL OR chave_unica != 'cpf_05361763969');

-- cpf 07134818896: remove newer (13a5fd04), fix older (9747214f)
DELETE FROM leads WHERE id = '13a5fd04-f607-46c7-9bd4-64e88c5a4607';
UPDATE leads SET chave_unica = 'cpf_07134818896'
  WHERE id = '9747214f-557e-4319-9116-f668f88ea07c' AND (chave_unica IS NULL OR chave_unica != 'cpf_07134818896');

-- cpf 39992926600: remove the one with NULL chave_unica (15785c8a), keep the other
DELETE FROM leads WHERE id = '15785c8a-71e5-4250-8748-0ac95b759cc7';


-- === 20260326164559_cdf541c9-3972-49f5-b6e3-01df35ea9959.sql ===
UPDATE lead_import_jobs SET status = 'erro', finished_at = now() WHERE id = '72987f90-e2a0-48da-8bdf-743993f3034d' AND status = 'processando';

-- === 20260326200000_cron_processar_disparos_agendados.sql ===
-- Cron job para processar campanhas de disparo agendadas (limite 120/dia atingido)
-- Roda diariamente às 11:05 UTC = 08:05 BRT (5min após o horário de envio para evitar race condition)

-- Função que busca campanhas agendadas e chama a Edge Function para cada uma
CREATE OR REPLACE FUNCTION public.processar_disparos_agendados()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  base_url TEXT;
  service_key TEXT;
BEGIN
  base_url := current_setting('app.settings.supabase_url');
  service_key := current_setting('app.settings.service_role_key');

  FOR r IN
    SELECT id
    FROM public.disparos_campanhas
    WHERE status = 'agendado'
      AND proximo_envio <= now()
      AND ativo = true
  LOOP
    PERFORM net.http_post(
      url := base_url || '/functions/v1/disparos-webhook',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || service_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'campanha_id', r.id,
        'acao', 'iniciar'
      )
    );

    RAISE LOG '[processar_disparos_agendados] Disparado iniciar para campanha %', r.id;
  END LOOP;
END;
$$;

-- Agendar cron: todo dia às 08:05 BRT (11:05 UTC)
SELECT cron.schedule(
  'processar-disparos-agendados',
  '5 11 * * *',
  $$SELECT public.processar_disparos_agendados();$$
);


-- === 20260330150111_e2bc9233-5614-4a36-802b-c2795933d70f.sql ===

-- Table to register external BI clients
CREATE TABLE public.bi_clientes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bi_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view bi_clientes" ON public.bi_clientes;
CREATE POLICY "Authenticated users can view bi_clientes"
  ON public.bi_clientes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage bi_clientes" ON public.bi_clientes;
CREATE POLICY "Admins can manage bi_clientes"
  ON public.bi_clientes FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Table for import history per client
CREATE TABLE public.bi_client_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES public.bi_clientes(id) ON DELETE CASCADE,
  arquivo_nome TEXT NOT NULL,
  arquivo_url TEXT,
  total_registros INTEGER NOT NULL DEFAULT 0,
  total_erros INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  uploaded_by UUID,
  uploaded_by_nome TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bi_client_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view bi_client_imports" ON public.bi_client_imports;
CREATE POLICY "Authenticated users can view bi_client_imports"
  ON public.bi_client_imports FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert bi_client_imports" ON public.bi_client_imports;
CREATE POLICY "Authenticated users can insert bi_client_imports"
  ON public.bi_client_imports FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update bi_client_imports" ON public.bi_client_imports;
CREATE POLICY "Authenticated users can update bi_client_imports"
  ON public.bi_client_imports FOR UPDATE TO authenticated USING (true);

-- Staging table for imported rows with per-row error tracking
CREATE TABLE public.bi_client_import_rows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  import_id UUID NOT NULL REFERENCES public.bi_client_imports(id) ON DELETE CASCADE,
  linha_numero INTEGER NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pendente',
  erro_mensagem TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bi_client_import_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view bi_client_import_rows" ON public.bi_client_import_rows;
CREATE POLICY "Authenticated users can view bi_client_import_rows"
  ON public.bi_client_import_rows FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert bi_client_import_rows" ON public.bi_client_import_rows;
CREATE POLICY "Authenticated users can insert bi_client_import_rows"
  ON public.bi_client_import_rows FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can update bi_client_import_rows" ON public.bi_client_import_rows;
CREATE POLICY "Authenticated users can update bi_client_import_rows"
  ON public.bi_client_import_rows FOR UPDATE TO authenticated USING (true);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS "update_bi_clientes_updated_at" ON public.bi_clientes;
CREATE TRIGGER update_bi_clientes_updated_at
  BEFORE UPDATE ON public.bi_clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS "update_bi_client_imports_updated_at" ON public.bi_client_imports;
CREATE TRIGGER update_bi_client_imports_updated_at
  BEFORE UPDATE ON public.bi_client_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX idx_bi_client_imports_cliente ON public.bi_client_imports(cliente_id);
CREATE INDEX idx_bi_client_import_rows_import ON public.bi_client_import_rows(import_id);
CREATE INDEX idx_bi_client_import_rows_status ON public.bi_client_import_rows(status);

-- Seed Hospital de Gaspar
INSERT INTO public.bi_clientes (nome, slug) VALUES ('Hospital de Gaspar', 'hospital-de-gaspar');


-- === 20260330175007_e5d07e64-beca-4fa3-9437-39c0f030bd90.sql ===

-- Config table for hourly rates per tipo_plantao/setor
CREATE TABLE public.financeiro_config_valores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  descricao TEXT NOT NULL,
  tipo_plantao TEXT,
  setor TEXT,
  unidade_id UUID REFERENCES public.unidades(id),
  valor_hora NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Consolidated payments per doctor per period
CREATE TABLE public.financeiro_pagamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profissional_nome TEXT NOT NULL,
  profissional_id_externo TEXT,
  profissional_crm TEXT,
  mes_referencia INTEGER NOT NULL,
  ano_referencia INTEGER NOT NULL,
  unidade TEXT,
  total_plantoes INTEGER NOT NULL DEFAULT 0,
  total_horas_minutos INTEGER NOT NULL DEFAULT 0,
  valor_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pendente',
  data_vencimento DATE,
  data_pagamento DATE,
  observacoes TEXT,
  gerado_por UUID,
  integration_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(profissional_id_externo, mes_referencia, ano_referencia, unidade)
);

-- Individual shifts linked to a payment
CREATE TABLE public.financeiro_pagamento_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pagamento_id UUID NOT NULL REFERENCES public.financeiro_pagamentos(id) ON DELETE CASCADE,
  escala_integrada_id UUID REFERENCES public.escalas_integradas(id),
  data_plantao DATE NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fim TEXT NOT NULL,
  carga_horaria_minutos INTEGER,
  setor TEXT,
  local_nome TEXT,
  valor_hora NUMERIC(10,2) NOT NULL DEFAULT 0,
  valor_total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.financeiro_config_valores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financeiro_pagamento_itens ENABLE ROW LEVEL SECURITY;

-- RLS policies - authenticated users can read, admins can write
DROP POLICY IF EXISTS "Authenticated users can read config_valores" ON public.financeiro_config_valores;
CREATE POLICY "Authenticated users can read config_valores" ON public.financeiro_config_valores FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins can manage config_valores" ON public.financeiro_config_valores;
CREATE POLICY "Admins can manage config_valores" ON public.financeiro_config_valores FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read pagamentos" ON public.financeiro_pagamentos;
CREATE POLICY "Authenticated users can read pagamentos" ON public.financeiro_pagamentos FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins can manage pagamentos" ON public.financeiro_pagamentos;
CREATE POLICY "Admins can manage pagamentos" ON public.financeiro_pagamentos FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can read pagamento_itens" ON public.financeiro_pagamento_itens;
CREATE POLICY "Authenticated users can read pagamento_itens" ON public.financeiro_pagamento_itens FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins can manage pagamento_itens" ON public.financeiro_pagamento_itens;
CREATE POLICY "Admins can manage pagamento_itens" ON public.financeiro_pagamento_itens FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Trigger for updated_at
DROP TRIGGER IF EXISTS "update_financeiro_config_valores_updated_at" ON public.financeiro_config_valores;
CREATE TRIGGER update_financeiro_config_valores_updated_at BEFORE UPDATE ON public.financeiro_config_valores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS "update_financeiro_pagamentos_updated_at" ON public.financeiro_pagamentos;
CREATE TRIGGER update_financeiro_pagamentos_updated_at BEFORE UPDATE ON public.financeiro_pagamentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- === 20260331172239_61f49e1b-9c77-4be9-a5b3-70b5a48b0336.sql ===
ALTER TABLE public.ages_leads ADD COLUMN IF NOT EXISTS cnpj text;

-- === 20260331183226_80df11f9-5aa5-4199-9643-b14892e6559b.sql ===
-- Fix: usar objeto_contrato (texto puro) em vez de objeto (HTML) no pré-contrato
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  novo_contrato_id UUID;
  novo_rascunho_id UUID;
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    
    -- 1. CRIAR CONTRATO REAL na tabela contratos (se não existir)
    IF NOT EXISTS (SELECT 1 FROM public.contratos WHERE licitacao_origem_id = NEW.id) THEN
      INSERT INTO public.contratos (
        codigo_contrato,
        data_inicio,
        data_fim,
        status_contrato,
        licitacao_origem_id,
        valor_estimado,
        objeto_contrato,
        assinado
      ) VALUES (
        'LC-' || COALESCE(NEW.numero_edital, 'S/N'),
        CURRENT_DATE,
        (CURRENT_DATE + INTERVAL '12 months')::DATE,
        'Pre-Contrato',
        NEW.id,
        NEW.valor_estimado,
        LEFT(COALESCE(NEW.objeto_contrato, ''), 2000),
        'Pendente'
      )
      RETURNING id INTO novo_contrato_id;
      
      -- Copiar anexos da licitação para o pré-contrato
      INSERT INTO public.contrato_anexos (contrato_id, arquivo_url, arquivo_nome, usuario_nome)
      SELECT 
        novo_contrato_id,
        la.arquivo_url,
        la.arquivo_nome,
        'Sistema (arrematação automática)'
      FROM public.licitacao_anexos la
      WHERE la.licitacao_id = NEW.id;
      
      PERFORM log_auditoria(
        'Contratos',
        'contratos',
        'INSERT',
        novo_contrato_id::text,
        'Pré-contrato criado automaticamente da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital, 'origem', 'arrematacao_automatica'),
        NULL,
        'Criação automática de pré-contrato após arrematação de licitação'
      );
    END IF;
    
    -- 2. Criar contrato_rascunho para o Kanban de captação (se não existir)
    IF NOT EXISTS (SELECT 1 FROM public.contrato_rascunho WHERE licitacao_id = NEW.id) THEN
      INSERT INTO public.contrato_rascunho (
        licitacao_id,
        status,
        status_kanban,
        overlay_json,
        servicos_json
      ) VALUES (
        NEW.id,
        'rascunho',
        'prospectar',
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', NEW.objeto_contrato,
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'modalidade', NEW.modalidade,
          'data_disputa', NEW.data_disputa,
          'data_arrematacao', now()
        ),
        COALESCE(NEW.servicos_contrato, '[]'::jsonb)
      )
      RETURNING id INTO novo_rascunho_id;
      
      PERFORM log_auditoria(
        'Licitações',
        'contrato_rascunho',
        'INSERT',
        novo_rascunho_id::text,
        'Contrato temporário criado da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital),
        NULL,
        'Criação automática de contrato temporário após arrematação'
      );
    END IF;
    
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_licitacao_arrematada ON public.licitacoes;
DROP TRIGGER IF EXISTS "on_licitacao_arrematada" ON public.licitacoes;
CREATE TRIGGER on_licitacao_arrematada
  AFTER UPDATE ON public.licitacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_captacao_card_on_licitacao_arrematada();

-- === 20260331183256_aea40ce2-b602-447f-947f-13c8563d4f5e.sql ===
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  novo_contrato_id UUID;
  novo_rascunho_id UUID;
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN
    
    IF NOT EXISTS (SELECT 1 FROM public.contratos WHERE licitacao_origem_id = NEW.id) THEN
      INSERT INTO public.contratos (
        codigo_contrato,
        data_inicio,
        data_fim,
        status_contrato,
        licitacao_origem_id,
        valor_estimado,
        objeto_contrato,
        assinado
      ) VALUES (
        'LC-' || COALESCE(NEW.numero_edital, 'S/N'),
        CURRENT_DATE,
        (CURRENT_DATE + INTERVAL '12 months')::DATE,
        'Pre-Contrato',
        NEW.id,
        NEW.valor_estimado,
        LEFT(COALESCE(NEW.objeto_contrato, ''), 2000),
        'Pendente'
      )
      RETURNING id INTO novo_contrato_id;
      
      PERFORM log_auditoria(
        'Contratos',
        'contratos',
        'INSERT',
        novo_contrato_id::text,
        'Pré-contrato criado automaticamente da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital, 'origem', 'arrematacao_automatica'),
        NULL,
        'Criação automática de pré-contrato após arrematação de licitação'
      );
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM public.contrato_rascunho WHERE licitacao_id = NEW.id) THEN
      INSERT INTO public.contrato_rascunho (
        licitacao_id,
        status,
        status_kanban,
        overlay_json,
        servicos_json
      ) VALUES (
        NEW.id,
        'rascunho',
        'prospectar',
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', COALESCE(NEW.objeto_contrato, ''),
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'modalidade', NEW.modalidade,
          'data_disputa', NEW.data_disputa,
          'data_arrematacao', now()
        ),
        COALESCE(NEW.servicos_contrato, '[]'::jsonb)
      )
      RETURNING id INTO novo_rascunho_id;
      
      PERFORM log_auditoria(
        'Licitações',
        'contrato_rascunho',
        'INSERT',
        novo_rascunho_id::text,
        'Contrato temporário criado da licitação ' || COALESCE(NEW.numero_edital, 'S/N'),
        NULL,
        jsonb_build_object('licitacao_id', NEW.id, 'numero_edital', NEW.numero_edital),
        NULL,
        'Criação automática de contrato temporário após arrematação'
      );
    END IF;
    
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_licitacao_arrematada ON public.licitacoes;
DROP TRIGGER IF EXISTS "on_licitacao_arrematada" ON public.licitacoes;
CREATE TRIGGER on_licitacao_arrematada
  AFTER UPDATE ON public.licitacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_captacao_card_on_licitacao_arrematada();

-- === 20260331194246_2c0cea4a-8647-4555-a68e-b23e359875fc.sql ===
DELETE FROM public.escalas_integradas WHERE sistema_origem = 'DR_ESCALA' AND local_id_externo IS NULL AND setor_id_externo IS NULL;

-- === 20260403003045_cf463171-9041-48b5-8b90-9305affec9e5.sql ===
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
DO $tyblk$ BEGIN CREATE TYPE public.tipo_contrato AS ENUM ('licitacao', 'privado'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE public.status_contrato AS ENUM ('ativo', 'inativo', 'suspenso'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE public.status_demanda AS ENUM ('aberta', 'em_atendimento', 'concluida', 'cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE public.status_proposta AS ENUM ('pendente', 'aceita', 'recusada'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE public.status_documentacao AS ENUM ('pendente', 'em_analise', 'aprovada', 'reprovada'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE public.status_assinatura AS ENUM ('pendente', 'assinado', 'cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE public.status_execucao AS ENUM ('pendente', 'executada', 'cancelada'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE public.status_pagamento AS ENUM ('pendente', 'pago', 'atrasado', 'cancelado'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;
DO $tyblk$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin', 'gestor_demanda', 'recrutador', 'coordenador_escalas', 'financeiro', 'medico'); EXCEPTION WHEN duplicate_object THEN NULL; END $tyblk$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE TABLE IF NOT EXISTS public.clientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_empresa TEXT NOT NULL,
  cnpj TEXT NOT NULL UNIQUE,
  contato_principal TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  endereco TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contratos_demanda (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cliente_id UUID NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  numero_contrato TEXT NOT NULL UNIQUE,
  tipo_contrato tipo_contrato NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE,
  status status_contrato NOT NULL DEFAULT 'ativo',
  documento_url TEXT,
  valor_total DECIMAL(12, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.demandas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_demanda_id UUID NOT NULL REFERENCES public.contratos_demanda(id) ON DELETE CASCADE,
  especialidade_medica TEXT NOT NULL,
  quantidade_medicos INTEGER NOT NULL DEFAULT 1,
  periodo_inicio DATE NOT NULL,
  periodo_fim DATE,
  local_atuacao TEXT NOT NULL,
  status status_demanda NOT NULL DEFAULT 'aberta',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.medicos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_completo TEXT NOT NULL,
  crm TEXT NOT NULL UNIQUE,
  especialidade TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT NOT NULL,
  documentos_url TEXT[],
  status_documentacao status_documentacao NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.propostas_medicas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  demanda_id UUID NOT NULL REFERENCES public.demandas(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  data_envio TIMESTAMP WITH TIME ZONE DEFAULT now(),
  status_proposta status_proposta NOT NULL DEFAULT 'pendente',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contratos_medico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  numero_contrato TEXT NOT NULL UNIQUE,
  data_assinatura DATE,
  status_assinatura status_assinatura NOT NULL DEFAULT 'pendente',
  documento_url TEXT,
  valor_hora DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.escalas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_medico_id UUID NOT NULL REFERENCES public.contratos_medico(id) ON DELETE CASCADE,
  demanda_id UUID NOT NULL REFERENCES public.demandas(id) ON DELETE CASCADE,
  data_escala DATE NOT NULL,
  hora_inicio TIME NOT NULL,
  hora_fim TIME NOT NULL,
  status_execucao status_execucao NOT NULL DEFAULT 'pendente',
  valor_pagamento DECIMAL(10, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pagamentos_medico (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  escala_id UUID NOT NULL REFERENCES public.escalas(id) ON DELETE CASCADE,
  medico_id UUID NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  valor DECIMAL(10, 2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_pagamento DATE,
  status_pagamento status_pagamento NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.recebimentos_cliente (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contrato_demanda_id UUID NOT NULL REFERENCES public.contratos_demanda(id) ON DELETE CASCADE,
  valor DECIMAL(12, 2) NOT NULL,
  data_vencimento DATE NOT NULL,
  data_recebimento DATE,
  status_recebimento status_pagamento NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_demanda ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.demandas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propostas_medicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_medico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.escalas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagamentos_medico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recebimentos_cliente ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated users can view clientes" ON public.clientes;
DROP POLICY IF EXISTS "Authenticated users can view clientes" ON public.clientes;
CREATE POLICY "Authenticated users can view clientes"
  ON public.clientes FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and gestores can manage clientes" ON public.clientes;
DROP POLICY IF EXISTS "Admins and gestores can manage clientes" ON public.clientes;
CREATE POLICY "Admins and gestores can manage clientes"
  ON public.clientes FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_demanda')
  );

DROP POLICY IF EXISTS "Authenticated users can view contratos_demanda" ON public.contratos_demanda;
DROP POLICY IF EXISTS "Authenticated users can view contratos_demanda" ON public.contratos_demanda;
CREATE POLICY "Authenticated users can view contratos_demanda"
  ON public.contratos_demanda FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and gestores can manage contratos_demanda" ON public.contratos_demanda;
DROP POLICY IF EXISTS "Admins and gestores can manage contratos_demanda" ON public.contratos_demanda;
CREATE POLICY "Admins and gestores can manage contratos_demanda"
  ON public.contratos_demanda FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_demanda')
  );

DROP POLICY IF EXISTS "Authenticated users can view demandas" ON public.demandas;
DROP POLICY IF EXISTS "Authenticated users can view demandas" ON public.demandas;
CREATE POLICY "Authenticated users can view demandas"
  ON public.demandas FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins, gestores and recrutadores can manage demandas" ON public.demandas;
DROP POLICY IF EXISTS "Admins, gestores and recrutadores can manage demandas" ON public.demandas;
CREATE POLICY "Admins, gestores and recrutadores can manage demandas"
  ON public.demandas FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'gestor_demanda') OR
    public.has_role(auth.uid(), 'recrutador')
  );

DROP POLICY IF EXISTS "Authenticated users can view medicos" ON public.medicos;
DROP POLICY IF EXISTS "Authenticated users can view medicos" ON public.medicos;
CREATE POLICY "Authenticated users can view medicos"
  ON public.medicos FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and recrutadores can manage medicos" ON public.medicos;
DROP POLICY IF EXISTS "Admins and recrutadores can manage medicos" ON public.medicos;
CREATE POLICY "Admins and recrutadores can manage medicos"
  ON public.medicos FOR ALL
  USING (
    public.is_admin(auth.uid()) OR
    public.has_role(auth.uid(), 'recrutador')
  );

DROP POLICY IF EXISTS "Authenticated users can view propostas" ON public.propostas_medicas;
DROP POLICY IF EXISTS "Authenticated users can view propostas" ON public.propostas_medicas;
CREATE POLICY "Authenticated users can view propostas"
  ON public.propostas_medicas FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins and recrutadores can manage propostas" ON public.propostas_medicas;
DROP POLICY IF EXISTS "Admins and recrutadores can manage propostas" ON public.propostas_medicas;