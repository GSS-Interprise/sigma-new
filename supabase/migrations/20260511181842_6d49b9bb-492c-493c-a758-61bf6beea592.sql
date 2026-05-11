-- 1) Atualizar função: vincular pré-contrato ao rascunho
CREATE OR REPLACE FUNCTION public.create_captacao_card_on_licitacao_arrematada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pre_contrato_id UUID;
  v_rascunho_id UUID;
BEGIN
  IF NEW.status = 'arrematados' AND (OLD.status IS NULL OR OLD.status != 'arrematados') THEN

    SELECT id INTO v_pre_contrato_id
    FROM public.contratos
    WHERE licitacao_origem_id = NEW.id
      AND status_contrato = 'Pre-Contrato'
      AND cliente_id IS NULL
    LIMIT 1;

    IF v_pre_contrato_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM public.contratos WHERE licitacao_origem_id = NEW.id AND cliente_id IS NOT NULL) THEN
      INSERT INTO public.contratos (
        codigo_contrato, data_inicio, data_fim, status_contrato,
        licitacao_origem_id, valor_estimado, objeto_contrato, assinado
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
      RETURNING id INTO v_pre_contrato_id;
    END IF;

    SELECT id INTO v_rascunho_id
    FROM public.contrato_rascunho
    WHERE licitacao_id = NEW.id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_rascunho_id IS NULL THEN
      INSERT INTO public.contrato_rascunho (
        licitacao_id, status, status_kanban, overlay_json, servicos_json, contrato_id
      ) VALUES (
        NEW.id, 'rascunho', 'prospectar',
        jsonb_build_object(
          'numero_edital', NEW.numero_edital,
          'objeto', COALESCE(NEW.objeto_contrato, ''),
          'orgao', NEW.orgao,
          'uf', NEW.municipio_uf,
          'valor_estimado', NEW.valor_estimado,
          'data_disputa', NEW.data_disputa,
          'data_arrematacao', now()
        ),
        COALESCE(NEW.servicos_contrato, '[]'::jsonb),
        v_pre_contrato_id
      ) RETURNING id INTO v_rascunho_id;
    ELSE
      UPDATE public.contrato_rascunho
      SET status = 'rascunho',
          contrato_id = NULL,
          consolidado_em = NULL,
          consolidado_por = NULL,
          updated_at = now()
      WHERE id = v_rascunho_id
        AND status IN ('cancelado', 'consolidado')
        AND (contrato_id IS NULL OR contrato_id IN (SELECT id FROM public.contratos WHERE cliente_id IS NULL));
    END IF;

    -- Vincular pré-contrato ao rascunho (se ainda não vinculado a um contrato real)
    IF v_pre_contrato_id IS NOT NULL AND v_rascunho_id IS NOT NULL THEN
      UPDATE public.contrato_rascunho
      SET contrato_id = v_pre_contrato_id
      WHERE id = v_rascunho_id
        AND (contrato_id IS NULL OR contrato_id = v_pre_contrato_id);
    END IF;

    -- Copiar anexos para o rascunho (sem duplicatas)
    IF v_rascunho_id IS NOT NULL THEN
      INSERT INTO public.contrato_rascunho_anexos (contrato_rascunho_id, arquivo_url, arquivo_nome, arquivo_path, origem)
      SELECT v_rascunho_id, s.arquivo_url, s.arquivo_nome, s.arquivo_path, s.origem
      FROM (
        SELECT la.arquivo_nome,
               la.arquivo_url,
               'licitacoes-anexos/' || la.arquivo_url AS arquivo_path,
               'licitacao_card'::text AS origem
        FROM public.licitacoes_anexos la WHERE la.licitacao_id = NEW.id
        UNION
        SELECT split_part(o.name, '/', 2),
               (NEW.id::text || '/' || split_part(o.name, '/', 2)),
               'licitacoes-anexos/' || o.name,
               'licitacao_card'
        FROM storage.objects o
        WHERE o.bucket_id = 'licitacoes-anexos' AND o.name LIKE NEW.id::text || '/%'
        UNION
        SELECT split_part(o.name, '/', 2),
               ('editais-pdfs/' || NEW.id::text || '/' || split_part(o.name, '/', 2)),
               'editais-pdfs/' || o.name,
               'licitacao_edital'
        FROM storage.objects o
        WHERE o.bucket_id = 'editais-pdfs' AND o.name LIKE NEW.id::text || '/%'
      ) s
      WHERE NOT EXISTS (
        SELECT 1 FROM public.contrato_rascunho_anexos cra
        WHERE cra.contrato_rascunho_id = v_rascunho_id
          AND (cra.arquivo_path = s.arquivo_path OR cra.arquivo_url = s.arquivo_url OR cra.arquivo_nome = s.arquivo_nome)
      );
    END IF;

    -- Copiar anexos para o pre-contrato (sem duplicatas)
    IF v_pre_contrato_id IS NOT NULL THEN
      INSERT INTO public.contrato_anexos (contrato_id, arquivo_url, arquivo_nome, usuario_nome)
      SELECT v_pre_contrato_id, s.arquivo_url, s.arquivo_nome, 'Sistema (arrematação automática)'
      FROM (
        SELECT la.arquivo_nome,
               'licitacoes-anexos/' || la.arquivo_url AS arquivo_url
        FROM public.licitacoes_anexos la WHERE la.licitacao_id = NEW.id
        UNION
        SELECT split_part(o.name, '/', 2),
               'licitacoes-anexos/' || o.name
        FROM storage.objects o
        WHERE o.bucket_id = 'licitacoes-anexos' AND o.name LIKE NEW.id::text || '/%'
        UNION
        SELECT split_part(o.name, '/', 2),
               'editais-pdfs/' || o.name
        FROM storage.objects o
        WHERE o.bucket_id = 'editais-pdfs' AND o.name LIKE NEW.id::text || '/%'
      ) s
      WHERE NOT EXISTS (
        SELECT 1 FROM public.contrato_anexos ca
        WHERE ca.contrato_id = v_pre_contrato_id
          AND (ca.arquivo_url = s.arquivo_url OR ca.arquivo_nome = s.arquivo_nome)
      );
    END IF;

  END IF;
  RETURN NEW;
END;
$function$;

-- 2) Backfill: vincular rascunhos existentes ao pré-contrato órfão
UPDATE public.contrato_rascunho cr
SET contrato_id = c.id
FROM public.contratos c
WHERE cr.status = 'rascunho'
  AND cr.contrato_id IS NULL
  AND c.licitacao_origem_id = cr.licitacao_id
  AND c.status_contrato = 'Pre-Contrato'
  AND c.cliente_id IS NULL;