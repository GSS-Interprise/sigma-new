-- Empresa de cada card (14/10). GSS e AGES dividem a tabela e o quadro "effecti", mas a empresa
-- estava espalhada em dois lugares: o tipo (tipo_licitacao) e a etiqueta "AGES". O captador da
-- AGES grava tipo "GSS" com etiqueta "AGES", então o filtro por tipo misturava as duas. A regra
-- aqui é única: tipo AGES ou etiqueta AGES = card da AGES; o resto é da GSS. O quadro da GSS
-- filtra por esta coluna; a AGES continua vendo os dela (agora inclusive os 16 que tinham tipo GSS).
alter table public.licitacoes add column if not exists empresa text
  generated always as (
    case when upper(coalesce(tipo_licitacao, '')) = 'AGES' or 'AGES' = any(coalesce(etiquetas, '{}'::text[]))
         then 'AGES' else 'GSS' end
  ) stored;
create index if not exists idx_licitacoes_board_empresa_status on public.licitacoes (board, empresa, status);
