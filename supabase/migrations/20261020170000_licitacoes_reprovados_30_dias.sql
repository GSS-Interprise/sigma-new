-- Reprovados ficam 30 dias no quadro antes de arquivar (Denise, 20/10: "o Sigma está excluindo muito rápido os
-- editais reprovados"; a Bianca também não achava os cards). Antes, mover para Reprovados (descarte_edital)
-- arquivava na hora. Agora o card guarda quando foi reprovado (descartado_em) e o robô diário arquiva 30 dias
-- depois. "Não ganhamos" e "Fracassado" seguem como estavam. AGES fora, como na regra original.
alter table public.licitacoes add column if not exists descartado_em timestamptz;

create or replace function public.licitacao_arquivamento_trg()
 returns trigger language plpgsql as $function$
declare finais text[] := array['descarte_edital', 'nao_ganhamos', 'fracassado'];
begin
  if new.board is distinct from 'effecti' or licitacao_eh_ages(new.tipo_licitacao, new.etiquetas) then return new; end if;
  -- data em que entrou em Reprovados: conta os 30 dias no quadro
  if new.status::text = 'descarte_edital' and old.status is distinct from new.status then
    new.descartado_em := now();
  elsif new.status::text <> 'descarte_edital' then
    new.descartado_em := null;
  end if;
  if new.status::text = any(finais) and new.status is distinct from old.status then
    -- Reprovados não arquivam na hora (robô diário, 30 dias depois). "Não ganhamos" com recurso/contrarrazão
    -- em aberto fica no quadro até o prazo (o robô diário arquiva depois)
    if new.status::text <> 'descarte_edital' and not licitacao_tem_prazo_aberto(new.id) then
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
end $function$;

create or replace function public.licitacoes_arquivar_por_prazo()
 returns integer language plpgsql security definer set search_path to 'public' as $function$
declare n int;
begin
  update licitacoes l set arquivado_em = now(),
    arquivado_motivo = case when status::text in ('descarte_edital', 'nao_ganhamos', 'fracassado') then status::text else 'prazo' end
   where board = 'effecti' and arquivado_em is null and not licitacao_eh_ages(tipo_licitacao, etiquetas)
     and ((status::text = 'descarte_edital' and coalesce(descartado_em, updated_at) < now() - interval '30 days')
          or (status::text in ('nao_ganhamos', 'fracassado') and not licitacao_tem_prazo_aberto(l.id))
          or (status::text <> 'descarte_edital'
              and greatest(coalesce(data_disputa, '-infinity'), coalesce(data_limite::timestamptz, '-infinity'),
                      updated_at, coalesce(desarquivado_em, '-infinity'),
                      coalesce((select max(t.data_hora) from licitacao_tarefas t where t.licitacao_id = l.id), '-infinity')
             ) < now() - interval '30 days'));
  get diagnostics n = row_count;
  return n;
end $function$;

-- volta ao quadro o que foi reprovado desde 15/10 (depois da primeira rodada de 14/10, que eram descartes
-- antigos), contando os 30 dias a partir de quando foi reprovado
update public.licitacoes
   set descartado_em = arquivado_em, arquivado_em = null, arquivado_motivo = null
 where board = 'effecti' and status::text = 'descarte_edital' and arquivado_motivo = 'descarte_edital'
   and arquivado_em >= '2026-10-15'::timestamptz;

-- os reprovados que já estavam no quadro sem data: conta a partir de agora
update public.licitacoes set descartado_em = coalesce(updated_at, now())
 where board = 'effecti' and status::text = 'descarte_edital' and arquivado_em is null and descartado_em is null;
