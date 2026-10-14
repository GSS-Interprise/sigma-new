-- T2 e T1 do plano licitacoes-contratos-gss.md (14/10).
--
-- Arquivamento (pedido da Bianca na reunião de 07/10): nenhum edital é excluído; o quadro só
-- mostra o que está em andamento. Arquiva 30 dias depois da ÚLTIMA data do edital (disputa,
-- limite ou a última movimentação); descarte, "não ganhamos" e fracassado arquivam na hora.
-- Card arquivado continua achável pela busca e pode ser reaberto. Só o quadro da GSS: a AGES
-- tem o próprio processo e não é arquivada aqui.
alter table public.licitacoes
  add column if not exists arquivado_em     timestamptz,
  add column if not exists arquivado_motivo text,
  add column if not exists desarquivado_em  timestamptz;
create index if not exists idx_licitacoes_quadro_ativo on public.licitacoes (board, empresa, status) where arquivado_em is null;

create or replace function public.licitacao_eh_ages(_tipo text, _etiquetas text[])
returns boolean language sql immutable as $$
  select upper(coalesce(_tipo, '')) = 'AGES' or 'AGES' = any(coalesce(_etiquetas, '{}'::text[]));
$$;

-- mudança de coluna e de data mexem no arquivamento na hora
create or replace function public.licitacao_arquivamento_trg()
returns trigger language plpgsql as $$
declare finais text[] := array['descarte_edital', 'nao_ganhamos', 'fracassado'];
begin
  if new.board is distinct from 'effecti' or licitacao_eh_ages(new.tipo_licitacao, new.etiquetas) then return new; end if;
  if new.status::text = any(finais) and new.status is distinct from old.status then
    new.arquivado_em := now();
    new.arquivado_motivo := new.status::text;
  elsif old.status::text = any(finais) and not (new.status::text = any(finais)) then
    -- voltou do descarte/não ganhamos: reabre
    new.arquivado_em := null; new.arquivado_motivo := null; new.desarquivado_em := now();
  end if;
  -- edital que voltou a ter disputa marcada (suspenso que reabriu, recaptura) volta ao quadro
  if new.data_disputa is distinct from old.data_disputa and new.data_disputa > now() and new.arquivado_em is not null
     and not (new.status::text = any(finais)) then
    new.arquivado_em := null; new.arquivado_motivo := null; new.desarquivado_em := now();
  end if;
  -- reabertura manual (desarquivado pela tela) conta como movimentação: mais 30 dias
  if old.arquivado_em is not null and new.arquivado_em is null and new.desarquivado_em is not distinct from old.desarquivado_em then
    new.desarquivado_em := now();
  end if;
  return new;
end $$;

drop trigger if exists trg_licitacao_arquivamento on public.licitacoes;
create trigger trg_licitacao_arquivamento before update of status, data_disputa, arquivado_em on public.licitacoes
  for each row execute function public.licitacao_arquivamento_trg();

create or replace function public.licitacoes_arquivar_por_prazo()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update licitacoes set arquivado_em = now(),
    arquivado_motivo = case when status::text in ('descarte_edital', 'nao_ganhamos', 'fracassado') then status::text else 'prazo' end
   where board = 'effecti' and arquivado_em is null and not licitacao_eh_ages(tipo_licitacao, etiquetas)
     and (status::text in ('descarte_edital', 'nao_ganhamos', 'fracassado')
          or greatest(coalesce(data_disputa, '-infinity'), coalesce(data_limite::timestamptz, '-infinity'),
                      updated_at, coalesce(desarquivado_em, '-infinity')) < now() - interval '30 days');
  get diagnostics n = row_count;
  return n;
end $$;

-- Alarme da captação (T1): em agosto a captação da GSS parou e ninguém viu por dois meses.
-- Avisa admin e líder de licitação quando a última rodada é velha ou quando 2 dias úteis
-- passam sem nenhum edital novo da GSS. Um aviso por dia, no máximo.
create or replace function public.licitacoes_alarme_captacao()
returns text language plpgsql security definer set search_path = public as $$
declare ultima jsonb; quando timestamptz; novos int; motivo text; dow int := extract(isodow from now() at time zone 'America/Sao_Paulo');
begin
  if dow > 5 then return 'fim de semana'; end if;
  select valor::jsonb into ultima from config_lista_items where campo_nome = 'effecti_captacao_ultima_rodada' limit 1;
  quando := (ultima->>'em')::timestamptz;
  select count(*) into novos from licitacoes
   where fonte = 'n8n' and board = 'effecti' and not licitacao_eh_ages(tipo_licitacao, etiquetas)
     and created_at > now() - interval '3 days';
  if quando is null or quando < now() - interval '2 hours' then
    motivo := 'A captação automática do Effecti não roda desde ' || coalesce(to_char(quando at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'), 'nunca') || '.';
  elsif novos = 0 then
    motivo := 'Nenhum edital novo da GSS entrou pela captação nos últimos dias. Pode ser o token do Effecti ou o perfil de busca.';
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
end $$;

revoke all on function public.licitacoes_arquivar_por_prazo() from public, anon, authenticated;
revoke all on function public.licitacoes_alarme_captacao() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('licitacoes-arquivar-prazo', 'licitacoes-alarme-captacao');
select cron.schedule('licitacoes-arquivar-prazo', '0 7 * * *', $$ select public.licitacoes_arquivar_por_prazo(); $$);
select cron.schedule('licitacoes-alarme-captacao', '0 14,20 * * 1-5', $$ select public.licitacoes_alarme_captacao(); $$);
