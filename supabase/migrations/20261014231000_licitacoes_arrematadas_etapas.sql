-- T8 do plano licitacoes-contratos-gss.md (14/10): "Licitações arrematadas" no lugar do rascunho.
-- Bianca, reunião de 07/10 (01:12:00): a arrematada passa por adjudicação, homologação, aguardando
-- assinatura e assinado antes de virar contrato; e pode não virar (revogação, desistência por erro
-- achado na reanálise), encerrando com motivo.
alter table public.contrato_rascunho
  add column if not exists etapa text not null default 'adjudicacao',   -- adjudicacao | homologacao | aguardando_assinatura | assinado
  add column if not exists encerrado_motivo text,
  add column if not exists encerrado_em timestamptz,
  add column if not exists encerrado_por uuid;
