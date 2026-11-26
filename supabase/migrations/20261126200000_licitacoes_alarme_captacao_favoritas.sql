-- Captação do Effecti só traz as licitações marcadas com estrela (favoritas) desde 26/11 (pedido da Ramone).
-- Dias sem card novo passam a ser normais (o Luiz pode não favoritar nada), então o alarme deixa de olhar
-- "nenhum edital novo em 3 dias". Token vencido ou perfil quebrado continuam aparecendo: a edge dá erro,
-- a rodada não é gravada e o alarme de "não roda desde" dispara.
CREATE OR REPLACE FUNCTION public.licitacoes_alarme_captacao()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ultima jsonb; quando timestamptz; motivo text; dow int := extract(isodow from now() at time zone 'America/Sao_Paulo');
begin
  if dow > 5 then return 'fim de semana'; end if;
  select valor::jsonb into ultima from config_lista_items where campo_nome = 'effecti_captacao_ultima_rodada' limit 1;
  quando := (ultima->>'em')::timestamptz;
  if quando is null or quando < now() - interval '2 hours' then
    motivo := 'A captação automática do Effecti não roda desde ' || coalesce(to_char(quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), 'nunca') || '.';
  elsif coalesce((ultima->>'erros')::int, 0) > 0 then
    motivo := 'A última rodada da captação teve ' || (ultima->>'erros') || ' erro(s).';
  end if;
  if motivo is null then return 'ok'; end if;
  if exists (select 1 from system_notifications where tipo = 'alerta_captacao_licitacoes' and created_at > now() - interval '20 hours') then
    return 'já avisado';
  end if;
  insert into system_notifications (user_id, tipo, titulo, mensagem, link)
  select distinct r.user_id, 'alerta_captacao_licitacoes', 'Captação de licitações parada', motivo, '/licitacoes'
    from user_roles r where r.role::text in ('admin', 'lider_licitacao');
  return motivo;
end $function$;
