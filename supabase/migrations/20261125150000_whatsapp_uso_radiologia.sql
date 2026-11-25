-- Tipo de número "radiologia" (25/11/2026): números da radiologia da GSS (Wagner e Brenda), que falam com médicos
-- laudistas e hospitais sobre laudos. Antes entravam como "prospeccao" e podiam cair no rodízio de campanha
-- (campanha_assistente_numeros só lista uso = 'prospeccao'). Radiologia, como escalas e ambulatório, nunca entra em
-- campanha. A leitura de conversas pelo Claude (domínio conversas) NÃO inclui radiologia: a conversa de laudo pode
-- citar paciente.
alter table public.whatsapp_chakra_connections
  drop constraint if exists whatsapp_chakra_connections_uso_check;
alter table public.whatsapp_chakra_connections
  add constraint whatsapp_chakra_connections_uso_check
  check (uso in ('prospeccao', 'escalas', 'clientes', 'ambulatorio', 'radiologia', 'financeiro', 'pessoal'));

-- Tipos conforme a lista do Vinicius (25/11): Danilo no ambulatório, Wagner e Brenda na radiologia.
update public.whatsapp_chakra_connections set uso = 'ambulatorio' where phone_e164 = '+554792174297';
update public.whatsapp_chakra_connections set uso = 'radiologia' where phone_e164 in ('+554792338374', '+554796472547');
