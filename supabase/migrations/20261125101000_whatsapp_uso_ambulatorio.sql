-- Tipo de número "ambulatorio" (reunião com os sócios da GSS em 24/11/2026): números que atendem as consultas
-- ambulatoriais dos municípios. Doc: docs/arquitetura/tempo-de-resposta-atendimento.md §3g.
--
-- Campanha continua usando só uso = 'prospeccao' (campanha_assistente_numeros filtra por ele): número de ambulatório
-- nunca entra em campanha. No Tempo de resposta ele tem fila e indicadores próprios (p_uso = 'ambulatorio').
alter table public.whatsapp_chakra_connections
  drop constraint if exists whatsapp_chakra_connections_uso_check;
alter table public.whatsapp_chakra_connections
  add constraint whatsapp_chakra_connections_uso_check
  check (uso in ('prospeccao', 'escalas', 'clientes', 'ambulatorio', 'financeiro', 'pessoal'));
