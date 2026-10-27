-- Template "nota conferida" (gss_nf_conferida_v1) enviado à Meta em 27/10 para avisar o médico
-- quando o financeiro aceita a nota à mão. O envio ainda NÃO está ligado: Raul vai decidir se
-- esse aviso deve existir. Aqui só ficam os rótulos das variáveis (o envio usa os rótulos para
-- saber o que vai em cada posição) e o id na configuração, para quando for ligado.
-- Ao ligar: uma única mensagem por pagamento (trava atômica) e nunca para quem já recebeu
-- "Nota fiscal recebida" na chegada pelo WhatsApp.
update public.whatsapp_official_templates
   set variables = '{"1":"nome","2":"competencia","3":"valor"}'::jsonb
 where id = '358cf371-840e-4c2a-a1f7-0dccab9994bd';

insert into public.config_lista_items (campo_nome, valor)
select 'financeiro_nf_whatsapp_template_conferida_id', '358cf371-840e-4c2a-a1f7-0dccab9994bd'
 where not exists (select 1 from public.config_lista_items where campo_nome = 'financeiro_nf_whatsapp_template_conferida_id');
