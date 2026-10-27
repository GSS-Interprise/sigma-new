-- Twilio cortado do Sigma (decisão do Raul, 27/10/2026). Nada saía pelo Twilio desde 18/08;
-- a API oficial em uso é o Chakra. Os números Twilio ficam desativados (não aparecem para
-- escolher e o envio recusa) e as campanhas Twilio que sobraram pausadas são arquivadas.
-- O histórico (mensagens, campanhas finalizadas, templates) fica como está.

update public.whatsapp_official_senders
   set status = 'desativado', updated_at = now()
 where provider = 'twilio' and status <> 'desativado';

update public.campanhas
   set status = 'arquivada'
 where whatsapp_provider = 'twilio' and status in ('pausada', 'rascunho', 'planejada', 'agendada');

-- (as instâncias Twilio do SigZap já estavam como 'deleted')
