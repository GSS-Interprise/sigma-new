-- Motor Hermes (27/11/2026): PDF escaneado que foi para a fila ia_trabalho fica 'na_fila' até o Hermes entregar o OCR
-- pelo sigma-mcp. contratos_anexos_para_ler não pega 'na_fila' (só nunca lido, sem_texto sem OCR e erro).
alter table public.contrato_anexo_leitura drop constraint if exists contrato_anexo_leitura_status_check;
alter table public.contrato_anexo_leitura
  add constraint contrato_anexo_leitura_status_check check (status in ('ok', 'sem_texto', 'erro', 'ignorado', 'na_fila'));
