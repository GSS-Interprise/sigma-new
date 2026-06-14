-- Parecer Assistencial — investigação do médico pelo Dr. Maikon.
-- Spec: docs/arquitetura/parecer-assistencial.md
-- F1 tabela + F2 task automática + RPC de salvar + view da fila.

-- ========== F1 — tabela de pareceres ==========
create table if not exists public.lead_pareceres (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references public.leads(id) on delete cascade,
  campanha_lead_id uuid not null references public.campanha_leads(id) on delete cascade,
  veredito        text not null check (veredito in ('apto','apto_com_ressalva','inapto','precisa_mais_info')),
  investigacao    text,          -- o que o Maikon descobriu / com quem falou (campo livre)
  ressalvas       text,
  parecer_por     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (campanha_lead_id)      -- 1 parecer atual por campanha-lead (histórico via lead_id em outras campanhas)
);

create index if not exists idx_lead_pareceres_lead on public.lead_pareceres (lead_id);
create index if not exists idx_lead_pareceres_veredito on public.lead_pareceres (veredito);

drop trigger if exists trg_lead_pareceres_updated on public.lead_pareceres;
create trigger trg_lead_pareceres_updated before update on public.lead_pareceres
  for each row execute function public.update_updated_at_column();

grant select, insert, update, delete on public.lead_pareceres to authenticated, service_role;

alter table public.lead_pareceres enable row level security;
create policy lead_pareceres_auth_read on public.lead_pareceres for select to authenticated using (true);
create policy lead_pareceres_auth_write on public.lead_pareceres for all to authenticated using (true) with check (true);

-- ========== F2 — task automática "Fazer parecer do médico" ao entrar em análise ==========
create or replace function public.trg_auto_task_parecer()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if NEW.etapa_acompanhamento = 'em_analise'
     and (OLD.etapa_acompanhamento is distinct from NEW.etapa_acompanhamento) then
    if not exists (
      select 1 from campanha_lead_tasks
      where campanha_lead_id = NEW.id and tipo = 'parecer' and status = 'pendente'
    ) then
      insert into campanha_lead_tasks (campanha_lead_id, tipo, rotulo, status, ordem, prazo_at)
      values (NEW.id, 'parecer', 'Fazer parecer do médico', 'pendente', 0, now() + interval '2 days');
    end if;
  end if;
  return NEW;
end $$;

drop trigger if exists trg_cl_auto_task_parecer on public.campanha_leads;
create trigger trg_cl_auto_task_parecer
  after update of etapa_acompanhamento on public.campanha_leads
  for each row execute function public.trg_auto_task_parecer();

-- ========== RPC — salvar parecer (reflete em validacao_maikon + fecha a task) ==========
create or replace function public.prospeccao_salvar_parecer(
  p_campanha_lead_id uuid,
  p_veredito text,
  p_investigacao text default null,
  p_ressalvas text default null
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare _uid uuid; _lead_id uuid; _validacoes jsonb; _aprovado boolean;
begin
  _uid := auth.uid();
  if _uid is null then return jsonb_build_object('ok', false, 'error', 'nao_autenticado'); end if;
  if p_veredito not in ('apto','apto_com_ressalva','inapto','precisa_mais_info') then
    return jsonb_build_object('ok', false, 'error', 'veredito_invalido');
  end if;

  select lead_id, coalesce(validacoes, '{}'::jsonb) into _lead_id, _validacoes
    from campanha_leads where id = p_campanha_lead_id;
  if not found then return jsonb_build_object('ok', false, 'error', 'nao_encontrado'); end if;

  insert into lead_pareceres (lead_id, campanha_lead_id, veredito, investigacao, ressalvas, parecer_por)
  values (_lead_id, p_campanha_lead_id, p_veredito, p_investigacao, p_ressalvas, _uid)
  on conflict (campanha_lead_id) do update set
    veredito = excluded.veredito, investigacao = excluded.investigacao,
    ressalvas = excluded.ressalvas, parecer_por = excluded.parecer_por, updated_at = now();

  -- apto/ressalva libera o gate validacao_maikon; inapto/mais_info = registra mas não libera (só registrar)
  _aprovado := p_veredito in ('apto', 'apto_com_ressalva');
  _validacoes := jsonb_set(_validacoes, array['validacao_maikon'], jsonb_build_object(
    'ok', _aprovado, 'por', _uid::text, 'em', now()::text, 'obs', coalesce(p_investigacao, '')
  ), true);
  update campanha_leads set validacoes = _validacoes, updated_at = now() where id = p_campanha_lead_id;

  update campanha_lead_tasks set status = 'feita', feita_em = now(), feita_por = _uid, updated_at = now()
    where campanha_lead_id = p_campanha_lead_id and tipo = 'parecer' and status = 'pendente';

  return jsonb_build_object('ok', true, 'veredito', p_veredito, 'validacao_maikon_ok', _aprovado);
end $$;

grant execute on function public.prospeccao_salvar_parecer(uuid, text, text, text) to authenticated, service_role;

-- ========== F3 (apoio) — view da fila de pareceres (consolidado de todas as campanhas) ==========
create or replace view public.vw_pareceres_fila as
select
  cl.id            as campanha_lead_id,
  cl.lead_id,
  cl.campanha_id,
  l.nome           as lead_nome,
  l.especialidade,
  l.uf,
  l.cidade,
  c.nome           as campanha_nome,
  c.tipo_envio,
  cl.data_status   as entrou_em,
  bi.observacoes_ia       as perfil_resumo,
  bi.modalidade_preferida,
  bi.valor_minimo_aceitavel,
  p.id             as parecer_id,
  p.veredito,
  p.investigacao,
  p.ressalvas,
  p.created_at     as parecer_em,
  pf.nome_completo as parecer_por_nome,
  case when p.id is not null then 'feito' else 'a_fazer' end as situacao
from campanha_leads cl
join leads l on l.id = cl.lead_id
left join campanhas c on c.id = cl.campanha_id
left join banco_interesse_leads bi on bi.lead_id = cl.lead_id
left join lead_pareceres p on p.campanha_lead_id = cl.id
left join profiles pf on pf.id = p.parecer_por
where cl.etapa_acompanhamento = 'em_analise' or p.id is not null;

grant select on public.vw_pareceres_fila to authenticated, service_role;

-- ========== F4 — métricas de parecer ==========
create or replace view public.vw_parecer_metricas as
select
  count(*) filter (where situacao = 'a_fazer')                as pendentes,
  count(*) filter (where situacao = 'feito')                  as concluidos,
  count(*) filter (where veredito = 'apto')                   as apto,
  count(*) filter (where veredito = 'apto_com_ressalva')      as ressalva,
  count(*) filter (where veredito = 'inapto')                 as inapto,
  count(*) filter (where veredito = 'precisa_mais_info')      as mais_info,
  round(avg(extract(epoch from (parecer_em - entrou_em)) / 3600.0)
        filter (where parecer_em is not null and entrou_em is not null), 1) as horas_medias_ate_parecer
from public.vw_pareceres_fila;

grant select on public.vw_parecer_metricas to authenticated, service_role;

comment on table public.lead_pareceres is 'Parecer assistencial do Dr. Maikon por médico/campanha. Spec: parecer-assistencial.md';
