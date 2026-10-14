-- T12 do plano licitacoes-contratos-gss.md (14/10). Reunião de 07/10:
--  - Ramone (01:22:00): indicador para a alta gestão de quem converteu × médico que não assinou
--    (ex.: por causa da multa) → motivo do "não assinou" e indicador por pessoa;
--  - Ramone/Bianca (01:21:46): resumo das condições combinadas com cada médico (fixo, regras);
--  - Bianca (01:20:50): médico vinculado a contrato novo avisa a Maria Vitória (faturamento do médico).
-- Achados: só 280 dos 707 leads convertidos têm convertido_por (atribuição já conhecida como falha);
-- os 216 vínculos de médico têm cliente/unidade mas nenhum contrato_id — o aviso sai no vínculo.

alter table public.medicos
  add column if not exists contrato_nao_assinado_motivo text,
  add column if not exists contrato_nao_assinado_em timestamptz,
  add column if not exists condicoes_fixo text,
  add column if not exists condicoes_variavel text,
  add column if not exists condicoes_regras text,
  add column if not exists condicoes_atualizado_em timestamptz,
  add column if not exists condicoes_atualizado_por uuid;

-- assinou: o motivo de "não assinou" deixa de valer
create or replace function public.medico_assinatura_trg()
returns trigger language plpgsql as $$
begin
  if new.aprovacao_contrato_assinado and not coalesce(old.aprovacao_contrato_assinado, false) then
    new.contrato_nao_assinado_motivo := null; new.contrato_nao_assinado_em := null;
  end if;
  if new.contrato_nao_assinado_motivo is distinct from old.contrato_nao_assinado_motivo and new.contrato_nao_assinado_motivo is not null then
    new.contrato_nao_assinado_em := now();
  end if;
  if (new.condicoes_fixo, new.condicoes_variavel, new.condicoes_regras) is distinct from (old.condicoes_fixo, old.condicoes_variavel, old.condicoes_regras) then
    new.condicoes_atualizado_em := now(); new.condicoes_atualizado_por := auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists trg_medico_assinatura on public.medicos;
create trigger trg_medico_assinatura before update on public.medicos for each row execute function public.medico_assinatura_trg();

-- indicador por pessoa: convertidos × assinados × pendentes × não assinaram (com motivos)
create or replace function public.indicador_conversao_assinatura(_ini timestamptz default null, _fim timestamptz default null)
returns jsonb language sql stable as $$
  with base as (
    select l.id as lead_id, l.convertido_por, coalesce(m.nome_completo, l.nome) as nome, l.data_conversao,
           coalesce(m.aprovacao_contrato_assinado, false) as assinado, m.contrato_nao_assinado_motivo as motivo, m.id as medico_id
      from leads l left join medicos m on m.lead_id = l.id
     where lower(l.status) = 'convertido'
       and (_ini is null or l.data_conversao >= _ini) and (_fim is null or l.data_conversao < _fim)
  ),
  por_pessoa as (
    select b.convertido_por, coalesce(p.nome_completo, 'Sem responsável registrado') as pessoa,
           count(*) as convertidos,
           count(*) filter (where assinado) as assinados,
           count(*) filter (where not assinado and motivo is not null) as nao_assinaram,
           count(*) filter (where not assinado and motivo is null) as pendentes
      from base b left join profiles p on p.id = b.convertido_por
     group by 1, 2
  )
  select jsonb_build_object(
    'pessoas', coalesce((select jsonb_agg(to_jsonb(x) - 'convertido_por' order by x.convertido_por is null, x.convertidos desc) from por_pessoa x), '[]'),
    'motivos', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'n', n) order by n desc) from
        (select motivo, count(*) n from base where not assinado and motivo is not null group by 1) y), '[]'),
    'nao_assinaram', coalesce((select jsonb_agg(jsonb_build_object('medico_id', b.medico_id, 'nome', b.nome, 'motivo', b.motivo, 'pessoa', p.nome_completo) order by b.data_conversao desc)
        from base b left join profiles p on p.id = b.convertido_por where not b.assinado and b.motivo is not null), '[]')
  );
$$;
grant execute on function public.indicador_conversao_assinatura(timestamptz, timestamptz) to authenticated;

-- aviso ao financeiro quando o médico é vinculado a cliente/unidade/contrato (fila do robô contratos-avisos)
create table if not exists public.medico_vinculo_avisos (
  id uuid primary key default gen_random_uuid(),
  vinculo_id uuid not null unique references public.medico_vinculo_unidade(id) on delete cascade,
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
alter table public.medico_vinculo_avisos enable row level security;
grant all on public.medico_vinculo_avisos to service_role;

create or replace function public.medico_vinculo_aviso_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT'
     or new.contrato_id is distinct from old.contrato_id
     or new.cliente_id is distinct from old.cliente_id
     or new.unidade_id is distinct from old.unidade_id then
    insert into medico_vinculo_avisos (vinculo_id) values (new.id)
    on conflict (vinculo_id) do update set criado_em = now(), enviado_em = null;
  end if;
  return new;
end $$;
drop trigger if exists trg_medico_vinculo_aviso on public.medico_vinculo_unidade;
create trigger trg_medico_vinculo_aviso after insert or update of contrato_id, cliente_id, unidade_id on public.medico_vinculo_unidade
  for each row execute function public.medico_vinculo_aviso_trg();

insert into public.vencimentos_config (chave, dias, destinatarios)
select 'medico_vinculado', '{}', coalesce((select array_agg(id) from profiles where nome_completo ilike 'Maria Vit%ria%'), '{}')
on conflict (chave) do nothing;

-- o robô contratos-avisos passa a rodar também quando há vínculo de médico pendente
select cron.unschedule(jobid) from cron.job where jobname = 'contratos-avisos';
select cron.schedule('contratos-avisos', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/contratos-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_internal_sync_key' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
  where exists (select 1 from public.contrato_avisos where enviado_em is null)
     or exists (select 1 from public.medico_vinculo_avisos where enviado_em is null);
$$);
