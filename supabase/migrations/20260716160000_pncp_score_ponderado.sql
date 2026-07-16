-- =====================================================================
-- SCORING PONDERADO (estágio 2 SEM IA — custo zero).
-- Substitui a classificação gpt-4o: gradua relevância por termos no objeto.
-- ~78% precisão, roda em SQL sobre o índice. Score alto = auto-aprova;
-- médio (3-4) = triagem humana; baixo = descarta. LLM (se usado) só no cinza.
-- Padrão validado no robô Alice (CGU/TCU): text-mining + regras, não LLM.
-- =====================================================================
-- Scoring ponderado (custo zero, sem IA): gradua relevância por termos no objeto.
CREATE OR REPLACE FUNCTION public.pncp_score_gss(bo tsvector) RETURNS int
LANGUAGE sql IMMUTABLE AS $$
  SELECT
    (CASE WHEN bo @@ to_tsquery('portuguese','(servico:*&medic:*)|(servicos:*&medic:*)|(prestacao:*&medic:*)|plantao:*|plantão:*|plantonist:*') THEN 4 ELSE 0 END)
  + (CASE WHEN bo @@ to_tsquery('portuguese','(credenciamento:*&(medic:*|profissional:*|saude:*|hospitalar:*))|(gestao:*&(saude:*|hospital:*|unidade:*))|(escala:*&medic:*)') THEN 3 ELSE 0 END)
  + (CASE WHEN bo @@ to_tsquery('portuguese','hospitalar:*|(atencao<->basica)|(saude<->da<->familia)|(pronto<->atendimento)|telemedicina:*|telessaude:*|anestesiolog:*|radiolog:*') THEN 2 ELSE 0 END)
  + (CASE WHEN bo @@ to_tsquery('portuguese','(servico:*&saude:*)|(servicos:*&saude:*)|(equipe:*&(medic:*|saude:*|multiprofissional:*))') THEN 1 ELSE 0 END)
  - (CASE WHEN bo @@ to_tsquery('portuguese','aquisicao:*|fornecimento:*|medicamento:*|material:*|veiculo:*|veículo:*|obra:*|reforma:*|pavimentacao:*|alimentacao:*|refeicao:*|curso:*|combustivel:*|trator:*|frota:*|locacao:*|relogio:*') THEN 5 ELSE 0 END)
$$;
GRANT EXECUTE ON FUNCTION public.pncp_score_gss(tsvector) TO authenticated, service_role;
