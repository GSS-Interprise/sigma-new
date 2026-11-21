-- Avisos do SLA em sequência configurável (21/11, pedido do Raul para Wagner e Brenda).
-- Antes: um WhatsApp aos X% do prazo, outro quando vencia, e uma escada fixa de ligações (plantonista 2x, coordenador,
-- diretoria) com coordenador e diretoria lançados como "plantão" na escala. Agora são duas listas na tela:
--   destino 'plantonista'  aba Avisos      — 1º, 2º, 3º aviso ao médico de plantão (WhatsApp ou ligação), N min antes
--                                            ou depois do vencimento do laudo.
--   destino 'contato'      aba Coordenação — quem mais avisar se ninguém assumir (coordenação, equipe, diretoria),
--                                            com nome e telefone fixos, N min depois do vencimento.
-- Cada passo dispara uma vez por exame, só enquanto ninguém assumiu (WhatsApp "Assumir laudo", tecla 1 ou a tela).
-- minutos é relativo ao vencimento: negativo = antes, positivo = depois. O motor não avisa exame vencido há mais de
-- 120 min (trava de 16/11 em sla-alertas), por isso o teto de +120.

create table if not exists public.sla_aviso_passos (
  id uuid primary key default gen_random_uuid(),
  unidade text not null default 'marieta',
  destino text not null check (destino in ('plantonista', 'contato')),
  ordem int not null default 0,
  minutos int not null check (minutos between -2880 and 120),
  canal text not null check (canal in ('whatsapp', 'ligacao', 'email')),
  ativo boolean not null default true,
  contato_nome text,
  contato_papel text check (contato_papel in ('coordenacao', 'equipe', 'diretoria')),
  contato_telefone text check (contato_telefone ~ '^55\d{10,11}$'),
  contato_email text,
  atualizado_em timestamptz not null default now(),
  -- médico de plantão não recebe e-mail (o telefone vem da escala); contato precisa do meio do canal dele
  constraint sla_aviso_passos_plantonista check (destino <> 'plantonista' or canal in ('whatsapp', 'ligacao')),
  constraint sla_aviso_passos_contato check (destino <> 'contato' or (
    coalesce(trim(contato_nome), '') <> '' and contato_papel is not null
    and (canal = 'email' and coalesce(contato_email, '') like '%@%' or canal <> 'email' and contato_telefone is not null)))
);
create index if not exists sla_aviso_passos_unidade on public.sla_aviso_passos (unidade, destino, ordem);

alter table public.sla_alertas add column if not exists passo_id uuid references public.sla_aviso_passos(id) on delete set null;
create index if not exists sla_alertas_passo on public.sla_alertas (exame_id, passo_id);

alter table public.sla_aviso_passos enable row level security;
drop policy if exists sla_aviso_passos_ler on public.sla_aviso_passos;
create policy sla_aviso_passos_ler on public.sla_aviso_passos for select to authenticated using (sla_pode_operar(auth.uid()));
grant select on public.sla_aviso_passos to authenticated;
grant all on public.sla_aviso_passos to service_role;

-- Sequência de hoje como ponto de partida: WhatsApp ~80% do prazo do PS (2 h -> 25 min antes), WhatsApp no vencimento,
-- ligações depois. Ligações nascem desligadas: a ligação do Twilio ainda falha (19/11) e a escada estava desligada.
insert into public.sla_aviso_passos (destino, ordem, minutos, canal, ativo)
select * from (values
  ('plantonista', 1, -25, 'whatsapp', true),
  ('plantonista', 2, 0, 'whatsapp', true),
  ('plantonista', 3, 5, 'ligacao', false),
  ('plantonista', 4, 10, 'ligacao', false)) v(destino, ordem, minutos, canal, ativo)
where not exists (select 1 from public.sla_aviso_passos);

-- Lê as duas listas da unidade.
create or replace function public.sla_avisos(p_unidade text default 'marieta') returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(p) - 'unidade' - 'atualizado_em' order by p.destino, p.ordem, p.minutos, p.id), '[]'::jsonb)
    from sla_aviso_passos p where p.unidade = p_unidade;
$$;
revoke all on function public.sla_avisos(text) from public, anon;
grant execute on function public.sla_avisos(text) to authenticated, service_role;

-- Salva uma lista inteira (a da aba): atualiza os passos que vieram com id, cria os sem id e apaga os que sumiram.
-- Manter o id importa: o motor marca "este passo já foi para este exame" pelo id; recriar tudo reenviaria os avisos.
create or replace function public.sla_avisos_salvar(p_destino text, p_passos jsonb, p_unidade text default 'marieta')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v jsonb; v_ids uuid[] := '{}'; v_id uuid; i int := 0;
begin
  if not sla_pode_operar(auth.uid()) then raise exception 'sem_permissao'; end if;
  if p_destino not in ('plantonista', 'contato') then raise exception 'destino inválido'; end if;
  if jsonb_typeof(p_passos) <> 'array' or jsonb_array_length(p_passos) > 12 then raise exception 'no máximo 12 passos'; end if;

  for v in select * from jsonb_array_elements(p_passos) loop
    i := i + 1;
    v_id := nullif(v->>'id', '')::uuid;
    if v_id is not null and exists (select 1 from sla_aviso_passos where id = v_id and unidade = p_unidade and destino = p_destino) then
      update sla_aviso_passos set ordem = i, minutos = (v->>'minutos')::int, canal = v->>'canal',
        ativo = coalesce((v->>'ativo')::boolean, true), contato_nome = nullif(trim(v->>'contato_nome'), ''),
        contato_papel = nullif(v->>'contato_papel', ''), contato_telefone = nullif(v->>'contato_telefone', ''),
        contato_email = nullif(trim(v->>'contato_email'), ''), atualizado_em = now()
       where id = v_id;
    else
      insert into sla_aviso_passos (unidade, destino, ordem, minutos, canal, ativo, contato_nome, contato_papel, contato_telefone, contato_email)
      values (p_unidade, p_destino, i, (v->>'minutos')::int, v->>'canal', coalesce((v->>'ativo')::boolean, true),
        nullif(trim(v->>'contato_nome'), ''), nullif(v->>'contato_papel', ''), nullif(v->>'contato_telefone', ''),
        nullif(trim(v->>'contato_email'), ''))
      returning id into v_id;
    end if;
    v_ids := v_ids || v_id;
  end loop;

  delete from sla_aviso_passos where unidade = p_unidade and destino = p_destino and not (id = any(v_ids));
  return sla_avisos(p_unidade);
end;
$$;
revoke all on function public.sla_avisos_salvar(text, jsonb, text) from public, anon;
grant execute on function public.sla_avisos_salvar(text, jsonb, text) to authenticated;
