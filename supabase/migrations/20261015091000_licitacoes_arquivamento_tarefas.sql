-- Revisão da reunião de 07/10 (15/10). Bianca (44:00–45:19 e 01:01:56): os 30 dias contam da ÚLTIMA data
-- do edital, e o exemplo dela era o prazo de recurso. E (17:02) "não ganhamos", recurso e contrarrazão são
-- casos que voltam. Até aqui o arquivamento olhava só disputa, data limite e última edição, e "não
-- ganhamos" saía do quadro na hora mesmo com recurso em aberto.
--
-- Agora:
--   * a tarefa em aberto (recurso, contrarrazão, mandado de segurança...) conta como data do edital;
--   * descarte arquiva na hora como antes; "não ganhamos" e fracassado esperam as tarefas em aberto
--     com prazo futuro e saem do quadro no dia seguinte ao último prazo.

create or replace function public.licitacao_tem_prazo_aberto(_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from licitacao_tarefas t where t.licitacao_id = _id and t.concluida_em is null and t.data_hora > now());
$$;

create or replace function public.licitacao_arquivamento_trg()
returns trigger language plpgsql as $$
declare finais text[] := array['descarte_edital', 'nao_ganhamos', 'fracassado'];
begin
  if new.board is distinct from 'effecti' or licitacao_eh_ages(new.tipo_licitacao, new.etiquetas) then return new; end if;
  if new.status::text = any(finais) and new.status is distinct from old.status then
    -- "não ganhamos" com recurso/contrarrazão em aberto fica no quadro até o prazo (o robô diário arquiva depois)
    if new.status::text = 'descarte_edital' or not licitacao_tem_prazo_aberto(new.id) then
      new.arquivado_em := now();
      new.arquivado_motivo := new.status::text;
    end if;
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

create or replace function public.licitacoes_arquivar_por_prazo()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update licitacoes l set arquivado_em = now(),
    arquivado_motivo = case when status::text in ('descarte_edital', 'nao_ganhamos', 'fracassado') then status::text else 'prazo' end
   where board = 'effecti' and arquivado_em is null and not licitacao_eh_ages(tipo_licitacao, etiquetas)
     and (status::text = 'descarte_edital'
          or (status::text in ('nao_ganhamos', 'fracassado') and not licitacao_tem_prazo_aberto(l.id))
          or greatest(coalesce(data_disputa, '-infinity'), coalesce(data_limite::timestamptz, '-infinity'),
                      updated_at, coalesce(desarquivado_em, '-infinity'),
                      coalesce((select max(t.data_hora) from licitacao_tarefas t where t.licitacao_id = l.id), '-infinity')
             ) < now() - interval '30 days');
  get diagnostics n = row_count;
  return n;
end $$;
