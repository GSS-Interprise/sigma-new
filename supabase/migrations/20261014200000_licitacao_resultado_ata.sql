-- T7 do plano licitacoes-contratos-gss.md (14/10), parte 1: resultado da disputa.
-- Pedidos da reunião de 07/10: "não ganhamos" com motivo escrito e colocação visível (Bianca, 30:13);
-- anexar a ata e a IA ler participantes, colocação e valores (56:44); só interessam o arrematante e as
-- empresas acima da GSS, com a diferença de preço, e inabilitação lançada à mão com motivo (57:44).
--
-- Grava nas tabelas que o BI de inteligência competitiva já lê (licitacao_resultados,
-- licitacao_itens, licitacao_item_concorrentes, empresas_concorrentes).

alter table public.licitacao_resultados
  add column if not exists colocacao_gss int,
  add column if not exists situacao_gss text,          -- habilitada | inabilitada | desclassificada | nao_participou
  add column if not exists motivo_texto text,          -- por que não ganhamos / motivo da inabilitação (livre)
  add column if not exists valor_gss numeric,          -- lance final da GSS (para a diferença de preço)
  add column if not exists ata_bucket text,
  add column if not exists ata_path text,
  add column if not exists fonte text not null default 'manual';   -- manual | ata_ia (lido pela IA e revisado)

-- itens criados pelo diálogo de resultado (um por lote da ata, ou "Resultado geral"): o diálogo
-- regrava só estes, sem tocar nos itens lançados pela tela antiga
alter table public.licitacao_itens add column if not exists do_resultado boolean not null default false;

-- a ata nem sempre traz o valor de quem foi inabilitado ou desclassificado
alter table public.licitacao_item_concorrentes alter column valor_ofertado drop not null;

create index if not exists idx_item_concorrentes_item on public.licitacao_item_concorrentes (item_id);
create index if not exists idx_empresas_concorrentes_cnpj on public.empresas_concorrentes (regexp_replace(coalesce(cnpj, ''), '\D', '', 'g'));
