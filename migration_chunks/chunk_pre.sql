-- Run this FIRST, before any other chunk.
-- All ALTER TYPE ADD VALUE statements extracted here to avoid transaction issues.

DO $aw$ BEGIN ALTER TYPE status_assinatura_contrato ADD VALUE IF NOT EXISTS 'Em Análise'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_assinatura_contrato ADD VALUE IF NOT EXISTS 'Aguardando Retorno'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'gestor_radiologia'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aberto'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aguardando_usuario'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'em_validacao'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE categoria_patrimonio ADD VALUE IF NOT EXISTS 'equipamento_hospitalar'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_licitacao ADD VALUE IF NOT EXISTS 'capitacao_de_credenciamento'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'aguardando_confirmacao'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE status_ticket ADD VALUE IF NOT EXISTS 'resolvido'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'gestor_marketing'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'externos'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_documento_medico ADD VALUE IF NOT EXISTS 'link_externo'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'lideres'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE public.tipo_documento_medico ADD VALUE IF NOT EXISTS 'contrato_aditivo'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'status_alterado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'enviado_acompanhamento'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_criado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_editado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_qualificado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'em_resposta'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'lead_descartado'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE tipo_evento_lead ADD VALUE IF NOT EXISTS 'desconvertido_para_lead'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'gestor_ages'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
DO $aw$ BEGIN ALTER TYPE public.tipo_evento_lead ADD VALUE IF NOT EXISTS 'reprocessado_kanban'; EXCEPTION WHEN duplicate_object THEN NULL; END $aw$;
    ALTER TYPE public.status_licitacao ADD VALUE 'conferencia' AFTER 'edital_analise';
    ALTER TYPE public.status_licitacao ADD VALUE 'suspenso_revogado' AFTER 'descarte_edital';
