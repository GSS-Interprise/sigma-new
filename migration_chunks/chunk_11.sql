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
CREATE TABLE IF NOT EXISTS public.bi_clientes (
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
CREATE TABLE IF NOT EXISTS public.bi_client_imports (
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
CREATE TABLE IF NOT EXISTS public.bi_client_import_rows (
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
CREATE TRIGGER update_bi_clientes_updated_at
  BEFORE UPDATE ON public.bi_clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bi_client_imports_updated_at
  BEFORE UPDATE ON public.bi_client_imports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_bi_client_imports_cliente ON public.bi_client_imports(cliente_id);
CREATE INDEX IF NOT EXISTS idx_bi_client_import_rows_import ON public.bi_client_import_rows(import_id);
CREATE INDEX IF NOT EXISTS idx_bi_client_import_rows_status ON public.bi_client_import_rows(status);

-- Seed Hospital de Gaspar
INSERT INTO public.bi_clientes (nome, slug) VALUES ('Hospital de Gaspar', 'hospital-de-gaspar');


-- === 20260330175007_e5d07e64-beca-4fa3-9437-39c0f030bd90.sql ===

-- Config table for hourly rates per tipo_plantao/setor
CREATE TABLE IF NOT EXISTS public.financeiro_config_valores (
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
CREATE TABLE IF NOT EXISTS public.financeiro_pagamentos (
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
CREATE TABLE IF NOT EXISTS public.financeiro_pagamento_itens (
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
CREATE TRIGGER update_financeiro_config_valores_updated_at BEFORE UPDATE ON public.financeiro_config_valores FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
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
CREATE TRIGGER on_licitacao_arrematada
  AFTER UPDATE ON public.licitacoes
  FOR EACH ROW
  EXECUTE FUNCTION public.create_captacao_card_on_licitacao_arrematada();

-- === 20260331194246_2c0cea4a-8647-4555-a68e-b23e359875fc.sql ===
DELETE FROM public.escalas_integradas WHERE sistema_origem = 'DR_ESCALA' AND local_id_externo IS NULL AND setor_id_externo IS NULL;

