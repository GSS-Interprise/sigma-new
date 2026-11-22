-- Currículo do médico (ficha do Corpo Clínico, parte 3 do item 5 da tabela da Ramone; 22/11/2026).
-- De onde vem: o médico manda pelo WhatsApp (80 currículos já estavam no storage sigzap-media sem ligação com o lead)
-- ou alguém envia na ficha. A edge medico-curriculo importa, liga ao lead e a IA lê formação, residência, especialidades
-- e experiência. O arquivo continua onde está (sigzap-media ou lead-anexos); aqui fica o endereço e o que foi lido.
create table if not exists public.medico_curriculos (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  origem text not null check (origem in ('whatsapp', 'upload')),
  mensagem_id uuid unique references public.sigzap_messages(id) on delete set null,
  arquivo_url text not null,
  arquivo_nome text,
  mime text,
  recebido_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente', 'lido', 'erro', 'nao_suportado')),
  dados jsonb,
  resumo text,
  erro text,
  lido_em timestamptz,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
create index if not exists medico_curriculos_lead_idx on public.medico_curriculos (lead_id, recebido_em desc);
create index if not exists medico_curriculos_pendente_idx on public.medico_curriculos (status) where status = 'pendente';

-- Quem vê a ficha do lead/médico vê o currículo: módulo médicos ou prospecção (disparos).
create or replace function public.curriculo_pode_ver(p_uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.pode_modulo(p_uid, 'medicos', 'visualizar'), false) or coalesce(public.pode_modulo(p_uid, 'disparos', 'visualizar'), false)
$$;

alter table public.medico_curriculos enable row level security;
drop policy if exists medico_curriculos_ler on public.medico_curriculos;
create policy medico_curriculos_ler on public.medico_curriculos for select to authenticated using (public.curriculo_pode_ver(auth.uid()));
grant select on public.medico_curriculos to authenticated;
grant all on public.medico_curriculos to service_role;
grant execute on function public.curriculo_pode_ver(uuid) to authenticated, service_role;

-- Contato do WhatsApp que chega como identificador interno (@lid) não tem telefone para achar o lead: o currículo entra
-- sem lead e, depois de lido, é ligado pelo nome escrito nele, só se houver exatamente UM lead com esse nome completo.
alter table public.medico_curriculos alter column lead_id drop not null;

create or replace function public.curriculo_ligar_por_nome(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_nome text; v_lead uuid; v_n int;
begin
  select lower(translate(trim(regexp_replace(regexp_replace(dados ->> 'nome', '^(dra?\.?|doutora?)\s+', '', 'i'), '\s+', ' ', 'g')),
         'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'))
    into v_nome from medico_curriculos where id = p_id and lead_id is null;
  if v_nome is null or length(v_nome) < 8 or position(' ' in v_nome) = 0 then return null; end if;
  select count(*), min(id::text)::uuid into v_n, v_lead from (
    select id from leads
    where lower(translate(trim(regexp_replace(nome, '\s+', ' ', 'g')), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')) = v_nome
    limit 2) x;
  if v_n = 1 then update medico_curriculos set lead_id = v_lead where id = p_id; return v_lead; end if;
  return null;
end $$;
revoke all on function public.curriculo_ligar_por_nome(uuid) from public, anon, authenticated;
grant execute on function public.curriculo_ligar_por_nome(uuid) to service_role;

-- Importa e lê os currículos a cada 10 min (5 por rodada: cada leitura leva ~10-20 s e a edge tem teto de tempo).
select cron.unschedule('medico-curriculos') where exists (select 1 from cron.job where jobname = 'medico-curriculos');
select cron.schedule('medico-curriculos', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/medico-curriculo',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"acao":"importar"}'::jsonb, timeout_milliseconds := 150000);
$$);
