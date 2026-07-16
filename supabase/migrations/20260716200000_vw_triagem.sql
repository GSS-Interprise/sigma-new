-- View que junta a fila de triagem com os dados do espelho (consumida pela UI).
CREATE OR REPLACE VIEW public.vw_pncp_triagem AS
SELECT
  t.numero_controle_pncp, t.perfil_slug, t.status, t.score,
  t.promovido_licitacao_id, t.created_at,
  m.objeto_compra, m.orgao_razao_social, m.municipio, m.uf,
  m.valor_estimado, m.modalidade_nome, m.data_encerramento_proposta,
  m.cnpj_orgao, m.ano, m.sequencial,
  ('https://pncp.gov.br/app/editais/' || m.cnpj_orgao || '/' || m.ano || '/' || m.sequencial) AS url_pncp
FROM public.pncp_triagem t
JOIN public.pncp_mirror m USING (numero_controle_pncp);

GRANT SELECT ON public.vw_pncp_triagem TO authenticated, service_role;
