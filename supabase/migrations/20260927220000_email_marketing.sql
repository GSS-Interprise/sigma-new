-- E-mail marketing (27/09). Dois usos, uma estrutura só:
--   • campanha SÓ de e-mail: campanhas.canal = 'email', tipo_campanha = 'email_marketing',
--     público pelos mesmos filtros da prospecção (especialidade, UF, cidade, lista);
--   • e-mail DENTRO de uma campanha de WhatsApp: a campanha ganha um bloco de e-mail que
--     dispara para o público dela (todos, ou só quem não respondeu no WhatsApp).
-- Em ambos o Sigma decide QUEM recebe; o Resend só entrega e devolve os eventos. Não há
-- segunda base de contatos no provedor.

-- ── configuração do e-mail na campanha ────────────────────────────────────────
alter table public.campanhas
  add column if not exists email_ativo          boolean not null default false,
  add column if not exists email_publico        text not null default 'todos'
    check (email_publico in ('todos', 'sem_resposta')),
  add column if not exists email_conteudo       jsonb,          -- {titulo, mensagem, botao_texto, botao_link}
  add column if not exists email_remetente_nome text,
  add column if not exists email_limite_diario  int not null default 500,
  add column if not exists email_status         text not null default 'rascunho'
    check (email_status in ('rascunho', 'agendado', 'enviando', 'pausado', 'concluido')),
  add column if not exists email_iniciado_em    timestamptz,
  add column if not exists email_concluido_em   timestamptz;

-- ── um envio por pessoa por campanha ──────────────────────────────────────────
create table if not exists public.email_envios (
  id               uuid primary key default gen_random_uuid(),
  campanha_id      uuid not null references public.campanhas(id) on delete cascade,
  lead_id          uuid references public.leads(id) on delete set null,
  email            text not null,
  nome             text,
  status           text not null default 'fila'
    check (status in ('fila', 'enviado', 'entregue', 'aberto', 'clicado', 'rejeitado', 'spam', 'descadastrado', 'erro', 'bloqueado')),
  resend_id        text,
  erro             text,
  token            text not null default replace(gen_random_uuid()::text, '-', ''),
  enviado_em       timestamptz,
  entregue_em      timestamptz,
  aberto_em        timestamptz,
  clicado_em       timestamptz,
  created_at       timestamptz not null default now(),
  unique (campanha_id, email)
);
create index if not exists idx_email_envios_fila on public.email_envios(campanha_id, status) where status = 'fila';
create index if not exists idx_email_envios_resend on public.email_envios(resend_id);
create unique index if not exists uq_email_envios_token on public.email_envios(token);
create index if not exists idx_email_envios_lead on public.email_envios(lead_id);

-- ── quem saiu não recebe mais: vale para toda campanha de e-mail ──────────────
-- Descadastro, retorno (bounce) e marcação de spam entram aqui. É por endereço, não por
-- lead: o mesmo e-mail pode estar em mais de um cadastro.
create table if not exists public.email_optout (
  email        text primary key,
  motivo       text not null check (motivo in ('descadastro', 'rejeitado', 'spam', 'manual')),
  campanha_id  uuid references public.campanhas(id) on delete set null,
  created_at   timestamptz not null default now()
);

alter table public.email_envios enable row level security;
alter table public.email_optout enable row level security;
drop policy if exists "email envios leitura" on public.email_envios;
create policy "email envios leitura" on public.email_envios for select to authenticated using (true);
drop policy if exists "email envios escrita" on public.email_envios;
create policy "email envios escrita" on public.email_envios for all to authenticated
  using (is_admin(auth.uid()) or has_role(auth.uid(), 'diretoria'::app_role) or has_role(auth.uid(), 'gestor_captacao'::app_role) or has_role(auth.uid(), 'gestor_marketing'::app_role))
  with check (is_admin(auth.uid()) or has_role(auth.uid(), 'diretoria'::app_role) or has_role(auth.uid(), 'gestor_captacao'::app_role) or has_role(auth.uid(), 'gestor_marketing'::app_role));
drop policy if exists "email optout leitura" on public.email_optout;
create policy "email optout leitura" on public.email_optout for select to authenticated using (true);

-- tabelas criadas por SQL não herdam grant
grant select, insert, update, delete on public.email_envios to authenticated, service_role;
grant select on public.email_optout to authenticated;
grant select, insert, update, delete on public.email_optout to service_role;

-- ── números da campanha, sempre calculados dos envios (nada denormalizado a manter) ──
create or replace view public.vw_email_campanha_metricas as
select
  e.campanha_id,
  count(*)                                                        as total,
  count(*) filter (where e.status = 'fila')                       as na_fila,
  count(*) filter (where e.enviado_em is not null)                as enviados,
  count(*) filter (where e.entregue_em is not null)               as entregues,
  count(*) filter (where e.aberto_em is not null)                 as abertos,
  count(*) filter (where e.clicado_em is not null)                as cliques,
  count(*) filter (where e.status = 'rejeitado')                  as rejeitados,
  count(*) filter (where e.status = 'spam')                       as spam,
  count(*) filter (where e.status = 'descadastrado')              as descadastros,
  count(*) filter (where e.status in ('erro', 'bloqueado'))       as erros,
  max(e.enviado_em)                                               as ultimo_envio
from public.email_envios e
group by e.campanha_id;
grant select on public.vw_email_campanha_metricas to authenticated, service_role;

-- ── público: quem recebe o e-mail de uma campanha ─────────────────────────────
-- Campanha de e-mail: filtros da própria campanha. Campanha de WhatsApp: os leads dela
-- (todos, ou só quem não respondeu). Sempre: e-mail válido, fora do opt-out e sem opt-out
-- LGPD no lead. Um endereço aparece uma vez só.
create or replace function public.email_publico_campanha(p_campanha_id uuid)
returns table (lead_id uuid, email text, nome text)
language sql stable security definer set search_path = public as $$
  with c as (select * from campanhas where id = p_campanha_id),
  base as (
    -- campanha só de e-mail: pelos filtros
    select l.id, lower(trim(l.email)) as email, l.nome
      from leads l, c
     where c.canal = 'email'
       and (coalesce(array_length(c.especialidade_ids, 1), 0) = 0
            or l.especialidade_id = any(c.especialidade_ids)
            or exists (select 1 from lead_especialidades le where le.lead_id = l.id and le.especialidade_id = any(c.especialidade_ids)))
       and (coalesce(array_length(c.regiao_estados, 1), 0) = 0 or l.uf = any(c.regiao_estados))
       and (coalesce(array_length(c.regiao_cidades, 1), 0) = 0 or lower(unaccent(trim(l.cidade))) in (select lower(unaccent(trim(x))) from unnest(c.regiao_cidades) x))  -- cadastro mistura ITAJAI/Itajaí
       and (not exists (select 1 from campanha_listas cl where cl.campanha_id = c.id)
            or exists (select 1 from campanha_listas cl join disparo_lista_itens i on i.lista_id = cl.lista_id
                        where cl.campanha_id = c.id and i.lead_id = l.id))
    union all
    -- e-mail dentro de campanha de WhatsApp: o público dela
    select l.id, lower(trim(l.email)), l.nome
      from campanha_leads cl join leads l on l.id = cl.lead_id, c
     where c.canal is distinct from 'email' and cl.campanha_id = c.id
       and (c.email_publico = 'todos' or cl.status in ('frio', 'contatado', 'sem_resposta', 'sem_whatsapp'))
  )
  select distinct on (b.email) b.id, b.email, b.nome
    from base b
    join leads l on l.id = b.id
   where b.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
     and coalesce(l.opt_out, false) = false
     and not exists (select 1 from email_optout o where o.email = b.email)
   order by b.email, b.id;
$$;
grant execute on function public.email_publico_campanha(uuid) to authenticated, service_role;
