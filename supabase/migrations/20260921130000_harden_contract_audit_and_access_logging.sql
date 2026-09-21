-- A auditoria antiga registrava a troca de itens como DELETE + INSERT.
-- Esses eventos podem ter sido gravados com alguns segundos de diferença
-- por causa de várias requisições do navegador. Eles não representam duas
-- ações humanas quando o mesmo item reaparece com os mesmos valores.
CREATE OR REPLACE FUNCTION public.get_contrato_item_auditoria(p_contrato_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL OR NOT (
    is_admin(v_user_id)
    OR has_role(v_user_id, 'gestor_contratos')
    OR has_role(v_user_id, 'gestor_captacao')
    OR has_role(v_user_id, 'gestor_financeiro')
    OR has_role(v_user_id, 'diretoria')
    OR has_role(v_user_id, 'coordenador_escalas')
  ) THEN
    RAISE EXCEPTION 'Usuário não autorizado a consultar atividades do contrato'
      USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT coalesce(
      jsonb_agg(to_jsonb(log) ORDER BY log.created_at DESC),
      '[]'::jsonb
    )
    FROM public.auditoria_logs AS log
    WHERE log.tabela = 'contrato_itens'
      AND (
        log.registro_id = p_contrato_id::text
        OR log.dados_antigos->>'contrato_id' = p_contrato_id::text
        OR log.dados_novos->>'contrato_id' = p_contrato_id::text
        OR log.detalhes ILIKE '%' || p_contrato_id::text || '%'
      )
      AND NOT (
        log.acao IN ('DELETE', 'INSERT')
        AND log.detalhes IN ('Registro excluído', 'Registro criado')
        AND EXISTS (
          SELECT 1
          FROM public.auditoria_logs AS par
          WHERE par.tabela = 'contrato_itens'
            AND par.id <> log.id
            AND par.acao = CASE WHEN log.acao = 'DELETE' THEN 'INSERT' ELSE 'DELETE' END
            -- O salvamento legado fazia uma requisição por item. A janela
            -- cobre a latência observada sem esconder uma edição posterior.
            AND par.created_at BETWEEN log.created_at - interval '2 minutes'
                                   AND log.created_at + interval '2 minutes'
            AND par.usuario_id IS NOT DISTINCT FROM log.usuario_id
            AND coalesce(par.dados_antigos->>'contrato_id', par.dados_novos->>'contrato_id')
                IS NOT DISTINCT FROM coalesce(log.dados_antigos->>'contrato_id', log.dados_novos->>'contrato_id')
            AND btrim(
              CASE WHEN par.acao = 'DELETE' THEN par.dados_antigos->>'item' ELSE par.dados_novos->>'item' END
            ) IS NOT DISTINCT FROM btrim(
              CASE WHEN log.acao = 'DELETE' THEN log.dados_antigos->>'item' ELSE log.dados_novos->>'item' END
            )
            AND nullif(
              CASE WHEN par.acao = 'DELETE' THEN par.dados_antigos->>'valor_item' ELSE par.dados_novos->>'valor_item' END,
              ''
            )::numeric IS NOT DISTINCT FROM nullif(
              CASE WHEN log.acao = 'DELETE' THEN log.dados_antigos->>'valor_item' ELSE log.dados_novos->>'valor_item' END,
              ''
            )::numeric
            AND coalesce(
              CASE WHEN par.acao = 'DELETE' THEN par.dados_antigos->>'quantidade' ELSE par.dados_novos->>'quantidade' END,
              '1'
            )::integer = coalesce(
              CASE WHEN log.acao = 'DELETE' THEN log.dados_antigos->>'quantidade' ELSE log.dados_novos->>'quantidade' END,
              '1'
            )::integer
        )
      )
  );
END;
$$;

COMMENT ON FUNCTION public.get_contrato_item_auditoria(uuid)
  IS 'Retorna atividades reais dos itens e oculta pares históricos de substituição técnica sem alteração, mesmo quando a gravação legada teve latência.';

GRANT EXECUTE ON FUNCTION public.get_contrato_item_auditoria(uuid) TO authenticated;

-- O cliente não insere mais diretamente em contrato_acessos. A função usa o
-- usuário do JWT no servidor e evita falhas quando o id vindo do navegador
-- não coincide com o token renovado.
CREATE OR REPLACE FUNCTION public.registrar_acesso_contrato(
  p_contrato_id uuid,
  p_tipo_acesso text,
  p_anexo_id uuid DEFAULT NULL,
  p_anexo_nome text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_detalhes jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_usuario_nome text;
  v_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado' USING ERRCODE = '42501';
  END IF;

  IF p_contrato_id IS NULL THEN
    RAISE EXCEPTION 'Contrato obrigatório';
  END IF;

  SELECT coalesce(nullif(trim(nome_completo), ''), email, 'Usuário desconhecido')
    INTO v_usuario_nome
    FROM public.profiles
   WHERE id = v_user_id;

  INSERT INTO public.contrato_acessos (
    contrato_id,
    usuario_id,
    usuario_nome,
    tipo_acesso,
    anexo_id,
    anexo_nome,
    user_agent,
    detalhes
  ) VALUES (
    p_contrato_id,
    v_user_id,
    coalesce(v_usuario_nome, 'Usuário desconhecido'),
    p_tipo_acesso,
    p_anexo_id,
    p_anexo_nome,
    p_user_agent,
    p_detalhes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_acesso_contrato(uuid, text, uuid, text, text, jsonb)
  IS 'Registra visualizações e operações de contrato usando auth.uid() no servidor.';

GRANT EXECUTE ON FUNCTION public.registrar_acesso_contrato(uuid, text, uuid, text, text, jsonb) TO authenticated;
