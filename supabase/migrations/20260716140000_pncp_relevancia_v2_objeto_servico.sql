-- =====================================================================
-- RELEVÂNCIA v2 — corrige 2 erros de alvo descobertos na validação:
--   (1) filtro casava pelo ÓRGÃO ("Secretaria de Saúde" comprando merenda)
--       → agora busca SÓ no objeto (coluna busca_objeto dedicada).
--   (2) mirava "saúde" genérica (pegava compra de medicamento)
--       → agora mira SERVIÇO médico (prestação/plantão/credenciamento/gestão)
--       e EXCLUI compras (aquisição/fornecimento/material).
--
-- Keyword tem teto de precisão (~60%). É de propósito: este é o estágio de
-- RECALL (não perder saúde real, afunilar volume). A precisão final vem do
-- estágio IA (edge pncp-classificar) que roda só nos candidatos daqui.
-- =====================================================================

-- ── busca só do OBJETO (separada da `busca` geral que inclui órgão+município) ──
ALTER TABLE public.pncp_mirror
  ADD COLUMN IF NOT EXISTS busca_objeto tsvector
  GENERATED ALWAYS AS (to_tsvector('portuguese', coalesce(objeto_compra,''))) STORED;

CREATE INDEX IF NOT EXISTS idx_pncp_mirror_busca_objeto ON public.pncp_mirror USING gin(busca_objeto);

-- ── perfil ganha termos de exclusão (corta compras/lixo) ──
ALTER TABLE public.licitacao_captura_perfis
  ADD COLUMN IF NOT EXISTS termos_exclui text;

-- ── atualiza o perfil GSS: mira SERVIÇO médico, exclui compras ──
UPDATE public.licitacao_captura_perfis SET
  termos_busca =
    '(servico:* & medic:*) | (servicos:* & medic:*) | (prestacao:* & medic:*) | '
    || 'plantao:* | plantão:* | plantonist:* | (escala:* & medic:*) | '
    || '(credenciamento:* & (medic:* | profissional:* | saude:* | hospitalar:*)) | '
    || '(gestao:* & (hospital:* | saude:* | unidade:*)) | (servico:* & saude:*) | '
    || '(servicos:* & saude:*) | (atencao <-> basica) | (saude <-> da <-> familia) | '
    || '(pronto <-> atendimento) | (pronto <-> socorro) | telemedicina:* | telessaude:* | '
    || '(equipe:* & (medic:* | saude:* | multiprofissional:*)) | anestesiolog:* | radiolog:*',
  termos_exclui =
    'aquisicao:* | fornecimento:* | medicamento:* | alimentacao:* | refeicao:* | '
    || 'material:* | veiculo:* | veículo:* | trator:* | frota:* | combustivel:* | '
    || 'relogio:* | pavimentacao:* | obra:* | reforma:*',
  updated_at = now()
WHERE slug = 'gss-saude';

-- ── função v2: busca_objeto + inclui + NOT exclui ──
CREATE OR REPLACE FUNCTION public.pncp_relevantes(p_slug text)
RETURNS SETOF public.pncp_mirror
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE perf public.licitacao_captura_perfis;
BEGIN
  SELECT * INTO perf FROM public.licitacao_captura_perfis WHERE slug = p_slug AND ativo;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
    SELECT m.* FROM public.pncp_mirror m
    WHERE m.busca_objeto @@ to_tsquery('portuguese', perf.termos_busca)
      AND (perf.termos_exclui IS NULL OR NOT m.busca_objeto @@ to_tsquery('portuguese', perf.termos_exclui))
      AND (perf.modalidades IS NULL OR m.modalidade_id = ANY(perf.modalidades))
      AND (perf.ufs IS NULL OR m.uf = ANY(perf.ufs));
END;
$$;
