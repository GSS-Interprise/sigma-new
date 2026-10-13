-- Baixa no Conta Azul a partir do Sigma (13/10). Quem paga (Thais) só sobe o comprovante; a
-- baixa no Conta Azul era dada à mão. Agora o pagamento que o Sigma lançou pode receber a baixa
-- pelo próprio Sigma, e a baixa dada direto no Conta Azul é lida de volta pelo espelho diário.
-- ca_baixa_id = id da baixa criada pelo Sigma, ou 'no-conta-azul' quando ela foi lida de lá.
alter table public.financeiro_pagamentos
  add column if not exists ca_baixa_id   text,
  add column if not exists ca_baixa_em   timestamptz,
  add column if not exists ca_baixa_por  uuid,
  add column if not exists ca_baixa_erro text;
