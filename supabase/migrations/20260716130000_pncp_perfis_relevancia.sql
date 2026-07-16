-- =====================================================================
-- CAMADA DE RELEVÂNCIA sobre o espelho PNCP (config-driven / multi-cliente)
--
-- O espelho (pncp_mirror) guarda o Brasil inteiro, cru. A relevância — "quais
-- dessas licitações interessam" — NÃO é hardcoded: vive em perfis. Cada cliente
-- (ou setor) é um perfil com seus termos/modalidades/UFs. Isso é o que torna o
-- produto replicável: cliente novo = novo perfil, zero código.
--
-- GSS = perfil 'gss-saude'. Outro cliente (ex.: engenharia) = outro perfil.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.licitacao_captura_perfis (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text UNIQUE NOT NULL,          -- 'gss-saude'
  nome          text NOT NULL,
  cliente       text,                          -- p/ multi-tenant futuro
  ativo         boolean NOT NULL DEFAULT true,
  -- tsquery PT-BR: termos que definem relevância (OR entre eles, prefixo com :*)
  termos_busca  text NOT NULL,
  -- filtros duros opcionais (null = sem filtro)
  modalidades   int[],                         -- ex: {6,8,9,12} — null = todas
  ufs           text[],                        -- ex: {SP,RJ} — null = todas
  -- destino do promote (pro Sigma da GSS, ou CRM de outro cliente)
  destino_config jsonb,                        -- {tipo:'api-licitacoes'|'webhook', url, ...}
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.licitacao_captura_perfis TO authenticated, service_role;
ALTER TABLE public.licitacao_captura_perfis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS perfis_read ON public.licitacao_captura_perfis;
CREATE POLICY perfis_read ON public.licitacao_captura_perfis FOR SELECT TO authenticated USING (true);

-- ── Seed: perfil GSS-Saúde (mesmos termos do classificador de saúde já em uso) ──
INSERT INTO public.licitacao_captura_perfis (slug, nome, cliente, termos_busca, modalidades)
VALUES (
  'gss-saude', 'GSS — Serviços Médicos e Saúde', 'GSS',
  -- prefixo :* casa derivações (medic → médico/médica/medicina). OR entre termos.
  'medic:* | saude:* | saúde:* | hospital:* | ambulator:* | plantao:* | plantão:* | plantonist:* '
  || '| enfermag:* | enfermeir:* | radiolog:* | telemedicina:* | telessaude:* | laudo:* '
  || '| tomografia:* | ressonancia:* | ultrassonograf:* | ultrassom:* | anestesiolog:* '
  || '| cirurg:* | uti:* | upa:* | ubs:* | samu:* | pronto:* | clinica:* | clínica:* '
  || '| especialidade:* | credenciamento:* | multiprofissional:* | assistencia:* | assistência:*',
  NULL  -- todas modalidades (credenciamento/dispensa também trazem saúde)
)
ON CONFLICT (slug) DO NOTHING;

-- ── Função: licitações do espelho relevantes p/ um perfil ──
-- Aplica full-text (coluna `busca` já indexada GIN) + filtros duros do perfil.
-- Retorna o espelho filtrado; a triagem/promote consome daqui.
CREATE OR REPLACE FUNCTION public.pncp_relevantes(p_slug text)
RETURNS SETOF public.pncp_mirror
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE perf public.licitacao_captura_perfis;
BEGIN
  SELECT * INTO perf FROM public.licitacao_captura_perfis WHERE slug = p_slug AND ativo;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
    SELECT m.* FROM public.pncp_mirror m
    WHERE m.busca @@ to_tsquery('portuguese', perf.termos_busca)
      AND (perf.modalidades IS NULL OR m.modalidade_id = ANY(perf.modalidades))
      AND (perf.ufs IS NULL OR m.uf = ANY(perf.ufs));
END;
$$;

GRANT EXECUTE ON FUNCTION public.pncp_relevantes(text) TO authenticated, service_role;
