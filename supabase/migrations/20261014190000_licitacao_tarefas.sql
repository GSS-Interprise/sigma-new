-- T5 do plano licitacoes-contratos-gss.md (14/10): tarefas com data e hora atreladas ao edital.
-- Pedidos da reunião de 07/10: datas além da disputa (impugnação, recurso, envio de documentos,
-- deliberação), aviso por e-mail e no Sigma com antecedência escolhida pela pessoa (o Trello avisava
-- 1 dia e 1 hora antes), fase invertida exigindo a data de envio dos documentos e filtro do quadro
-- por período e tipo.
--
-- Tabela própria e não worklist_tarefas: as tarefas "licitacoes" que existem lá são cópias do status
-- de cada card criadas pela captação; misturar prazo com elas confundiria o quadro e o Minhas Tarefas.

alter table public.licitacoes add column if not exists fase_invertida boolean not null default false;

create table if not exists public.licitacao_tarefas (
  id uuid primary key default gen_random_uuid(),
  licitacao_id uuid not null references public.licitacoes(id) on delete cascade,
  tipo text not null,                 -- esclarecimento_impugnacao, recurso, contrarrazao, mandado_seguranca, envio_documentos, deliberacao, personalizada
  titulo text,                        -- obrigatório na personalizada; nas outras complementa o tipo
  data_hora timestamptz not null,
  responsavel_id uuid references public.profiles(id) on delete set null,
  observacao text,
  avisos_min int[],                   -- antecedências desta tarefa em minutos; nulo = padrão de cada pessoa
  concluida_em timestamptz,
  concluida_por uuid references public.profiles(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_licitacao_tarefas_abertas on public.licitacao_tarefas (data_hora) where concluida_em is null;
create index if not exists idx_licitacao_tarefas_licitacao on public.licitacao_tarefas (licitacao_id);

-- avisos já enviados (um por tarefa, pessoa e antecedência): o robô não repete
create table if not exists public.licitacao_tarefa_avisos (
  tarefa_id uuid not null references public.licitacao_tarefas(id) on delete cascade,
  user_id uuid not null,
  antecedencia_min int not null,
  email_enviado boolean not null default false,
  enviado_em timestamptz not null default now(),
  primary key (tarefa_id, user_id, antecedencia_min)
);

-- preferências de cada pessoa: antecedências dos avisos, e-mail e o período com que o quadro abre
create table if not exists public.licitacoes_preferencias (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  avisos_min int[] not null default '{1440,60}',
  aviso_email boolean not null default true,
  filtro_dias int,                    -- nulo = quadro abre com tudo; 7 = semana, 15 = quinzena
  updated_at timestamptz not null default now()
);

alter table public.licitacao_tarefas enable row level security;
alter table public.licitacao_tarefa_avisos enable row level security;
alter table public.licitacoes_preferencias enable row level security;

drop policy if exists "Equipe vê tarefas" on public.licitacao_tarefas;
create policy "Equipe vê tarefas" on public.licitacao_tarefas for select to authenticated using (true);
drop policy if exists "Equipe cria tarefas" on public.licitacao_tarefas;
create policy "Equipe cria tarefas" on public.licitacao_tarefas for insert to authenticated with check (created_by = auth.uid());
-- qualquer um da equipe conclui ou remarca (trabalho é compartilhado, como no Trello)
drop policy if exists "Equipe atualiza tarefas" on public.licitacao_tarefas;
create policy "Equipe atualiza tarefas" on public.licitacao_tarefas for update to authenticated using (true) with check (true);
drop policy if exists "Autor, responsável ou líder exclui tarefa" on public.licitacao_tarefas;
create policy "Autor, responsável ou líder exclui tarefa" on public.licitacao_tarefas for delete to authenticated
  using (created_by = auth.uid() or responsavel_id = auth.uid() or pode_editar_quadro_licitacoes(auth.uid()));

drop policy if exists "Pessoa vê os próprios avisos" on public.licitacao_tarefa_avisos;
create policy "Pessoa vê os próprios avisos" on public.licitacao_tarefa_avisos for select to authenticated using (user_id = auth.uid());

drop policy if exists "Pessoa cuida das próprias preferências" on public.licitacoes_preferencias;
create policy "Pessoa cuida das próprias preferências" on public.licitacoes_preferencias for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.licitacao_tarefas to authenticated;
grant select on public.licitacao_tarefa_avisos to authenticated;
grant select, insert, update on public.licitacoes_preferencias to authenticated;
grant all on public.licitacao_tarefas, public.licitacao_tarefa_avisos, public.licitacoes_preferencias to service_role;

-- histórico no edital: criar, remarcar, concluir e excluir tarefa ficam nas atividades do card
alter table public.licitacoes_atividades drop constraint if exists licitacoes_atividades_tipo_check;
alter table public.licitacoes_atividades add constraint licitacoes_atividades_tipo_check
  check (tipo = any (array['comentario', 'status_alterado', 'campo_atualizado', 'anexo_adicionado', 'tarefa']));

create or replace function public.licitacao_tarefa_rotulo(_tipo text, _titulo text)
returns text language sql immutable as $$
  select case _tipo
    when 'esclarecimento_impugnacao' then 'Esclarecimento/Impugnação'
    when 'recurso' then 'Recurso'
    when 'contrarrazao' then 'Contrarrazão'
    when 'mandado_seguranca' then 'Mandado de segurança'
    when 'envio_documentos' then 'Envio de documentos'
    when 'deliberacao' then 'Deliberação'
    else coalesce(nullif(btrim(_titulo), ''), 'Tarefa') end
    || case when _tipo <> 'personalizada' and nullif(btrim(_titulo), '') is not null then ' — ' || btrim(_titulo) else '' end;
$$;

create or replace function public.licitacao_tarefa_trg()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  -- remarcou: os avisos valem de novo para a nova data
  if new.data_hora is distinct from old.data_hora then
    delete from licitacao_tarefa_avisos where tarefa_id = new.id;
  end if;
  if new.concluida_em is not null and old.concluida_em is null then
    new.concluida_por := coalesce(new.concluida_por, auth.uid());
  end if;
  if new.concluida_em is null then new.concluida_por := null; end if;
  return new;
end $$;

drop trigger if exists trg_licitacao_tarefa on public.licitacao_tarefas;
create trigger trg_licitacao_tarefa before update on public.licitacao_tarefas
  for each row execute function public.licitacao_tarefa_trg();

create or replace function public.licitacao_tarefa_historico_trg()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record; txt text;
begin
  r := coalesce(new, old);
  txt := licitacao_tarefa_rotulo(r.tipo, r.titulo) || ' · ' ||
         to_char(r.data_hora at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI');
  if tg_op = 'INSERT' then
    txt := 'Tarefa criada: ' || txt;
  elsif tg_op = 'DELETE' then
    txt := 'Tarefa excluída: ' || txt;
  elsif new.concluida_em is not null and old.concluida_em is null then
    txt := 'Tarefa concluída: ' || txt;
  elsif new.concluida_em is null and old.concluida_em is not null then
    txt := 'Tarefa reaberta: ' || txt;
  elsif new.data_hora is distinct from old.data_hora then
    txt := 'Tarefa remarcada: ' || txt || ' (antes ' ||
           to_char(old.data_hora at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI') || ')';
  else
    return null;
  end if;
  -- exclusão em cascata (card apagado): não há mais onde registrar
  if tg_op = 'DELETE' and not exists (select 1 from licitacoes where id = r.licitacao_id) then return null; end if;
  begin
    insert into licitacoes_atividades (licitacao_id, user_id, tipo, descricao)
    values (r.licitacao_id, auth.uid(), 'tarefa', txt);
  exception when foreign_key_violation then null;
  end;
  return null;
end $$;

drop trigger if exists trg_licitacao_tarefa_historico on public.licitacao_tarefas;
create trigger trg_licitacao_tarefa_historico after insert or update or delete on public.licitacao_tarefas
  for each row execute function public.licitacao_tarefa_historico_trg();

-- robô dos avisos a cada 10 minutos (edge licitacoes-tarefas-alertas: Sigma + e-mail)
select cron.unschedule(jobid) from cron.job where jobname = 'licitacoes-tarefas-alertas';
select cron.schedule('licitacoes-tarefas-alertas', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/licitacoes-tarefas-alertas',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-internal-sync-key', (select decrypted_secret from vault.decrypted_secrets where name = 'twilio_internal_sync_key' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 60000);
$$);
