-- Contato inteligente (12/11/2026): o que o médico responde vira ação no lead, sem depender de alguém lembrar.
-- Análise: docs/arquitetura/conversas-medicos-o-que-o-crm-perde.md. Antes: 0 de 50 "número errado" tinham o telefone
-- marcado, 32 seguiam em campanha aberta e a IA prometia "vou tirar da base" sem nada acontecer.

-- Situação de cada telefone do lead. Telefone em dígitos com 55 (mesmo formato de telefones_adicionais).
create table if not exists public.lead_telefone_situacao (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  telefone text not null check (telefone ~ '^55\d{10,11}$'),
  situacao text not null check (situacao in ('ativo', 'errado', 'consultorio', 'informado', 'saiu')),
  origem text not null check (origem in ('classificador', 'ia', 'equipe', 'conversa')),
  motivo text,
  trecho text,
  conversation_id uuid,
  campanha_id uuid,
  marcado_por uuid,
  marcado_em timestamptz not null default now(),
  unique (lead_id, telefone)
);
create index if not exists lead_telefone_situacao_fone on public.lead_telefone_situacao (telefone);
alter table public.lead_telefone_situacao enable row level security;
drop policy if exists lead_telefone_situacao_ler on public.lead_telefone_situacao;
create policy lead_telefone_situacao_ler on public.lead_telefone_situacao for select to authenticated using (true);
-- Tabela criada por SQL não ganha GRANT sozinha (incidente 18/05). Escrita só pelas funções abaixo.
grant select on public.lead_telefone_situacao to authenticated;
grant all on public.lead_telefone_situacao to service_role;

-- Normaliza para 55 + DDD + número (aceita +55, espaços, traços, 0 na frente). Null se não parece telefone BR.
-- Exige DDD de 11 a 99 e, com 11 dígitos, celular começando em 9 (evita pegar CPF, CRM ou data no meio do texto).
create or replace function public.fone_br(p text) returns text language sql immutable as $$
  select case when n ~ '^[1-9][1-9](9\d{8}|[2-8]\d{7})$' then '55' || n end
  from (select case when d ~ '^55\d{10,11}$' then substr(d, 3) when d ~ '^0\d{10,11}$' then substr(d, 2) else d end n
        from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') d) x) y
$$;

-- Grava a situação sem rebaixar: "errado" e "saiu" não voltam para "consultorio"/"informado" por uma regra automática.
create or replace function public.lead_telefone_marcar(
  p_lead uuid, p_telefone text, p_situacao text, p_origem text, p_motivo text default null, p_trecho text default null,
  p_conversation uuid default null, p_campanha uuid default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_fone text := fone_br(p_telefone);
  v_atual text;
  v_rotulo text;
begin
  if v_fone is null or p_lead is null then return false; end if;
  -- a equipe (tela) pode marcar; a função também é chamada pelas regras automáticas (sem auth.uid())
  if auth.uid() is not null and p_origem = 'equipe' then
    if not exists (select 1 from profiles where id = auth.uid()) then raise exception 'sem_permissao'; end if;
  end if;
  select situacao into v_atual from lead_telefone_situacao where lead_id = p_lead and telefone = v_fone;
  if v_atual = p_situacao then return false; end if;
  if p_origem <> 'equipe' and v_atual in ('errado', 'saiu') then return false; end if;
  if p_origem <> 'equipe' and v_atual = 'consultorio' and p_situacao = 'informado' then return false; end if;
  insert into lead_telefone_situacao (lead_id, telefone, situacao, origem, motivo, trecho, conversation_id, campanha_id, marcado_por)
  values (p_lead, v_fone, p_situacao, p_origem, p_motivo, left(p_trecho, 200), p_conversation, p_campanha, auth.uid())
  on conflict (lead_id, telefone) do update set situacao = excluded.situacao, origem = excluded.origem, motivo = excluded.motivo,
    trecho = excluded.trecho, conversation_id = excluded.conversation_id, campanha_id = excluded.campanha_id,
    marcado_por = excluded.marcado_por, marcado_em = now();
  v_rotulo := case p_situacao when 'errado' then 'não é do médico' when 'consultorio' then 'é do consultório (secretária ou robô)'
    when 'informado' then 'informado na conversa' when 'saiu' then 'pediu para sair' else 'ativo' end;
  insert into lead_historico (lead_id, tipo_evento, descricao_resumida, metadados, usuario_id)
  values (p_lead, 'outro', 'Telefone ' || v_fone || ' ' || v_rotulo || coalesce(': ' || p_motivo, ''),
    jsonb_build_object('tipo', 'telefone_situacao', 'telefone', v_fone, 'situacao', p_situacao, 'origem', p_origem, 'campanha_id', p_campanha),
    auth.uid());
  -- errado/saiu entram em telefones_inativos (lista que o resto do Sigma já conhece)
  if p_situacao in ('errado', 'saiu') then
    update leads set telefones_inativos = array_append(coalesce(telefones_inativos, '{}'), v_fone)
    where id = p_lead and not (v_fone = any(coalesce(telefones_inativos, '{}')));
  end if;
  return true;
end;
$$;
revoke all on function public.lead_telefone_marcar(uuid, text, text, text, text, text, uuid, uuid) from public, anon;
grant execute on function public.lead_telefone_marcar(uuid, text, text, text, text, text, uuid, uuid) to authenticated, service_role;

-- Outro número utilizável do lead: WhatsApp conhecido primeiro, depois adicionais; nunca um inativo, errado,
-- consultório ou que já é o principal de outro lead (phone_e164 é único entre leads ativos).
create or replace function public.lead_outro_telefone(p_lead uuid) returns text
language sql stable security definer set search_path = public as $$
  select f from (
    select fone_br(x) f, ord from leads l,
      lateral (select unnest(coalesce(l.whatsapp_phones, '{}')) x, 1 ord union all select unnest(coalesce(l.telefones_adicionais, '{}')), 2) u
    where l.id = p_lead
  ) c
  where f is not null
    and f <> fone_br((select phone_e164 from leads where id = p_lead))
    and not exists (select 1 from leads l2 where l2.id = p_lead and f = any(coalesce(l2.telefones_inativos, '{}')))
    and not exists (select 1 from lead_telefone_situacao s where s.lead_id = p_lead and s.telefone = f and s.situacao in ('errado', 'consultorio', 'saiu'))
    and not exists (select 1 from leads o where o.phone_e164 = '+' || f and o.id <> p_lead and o.merged_into_id is null)
  order by ord limit 1
$$;

-- Aplica a classificação de uma conversa ao lead (chamada pelo gatilho abaixo e pelo backfill). Idempotente.
create or replace function public.lead_contato_aplicar(p_classificacao uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  c record;
  v_conv uuid;
  v_fone text;
  v_principal text;
  v_outro text;
  v_m text;
  v_txt text;
  v_citado text;
  v_feito text := '';
  cl record;
begin
  select * into c from conversa_classificacao where id = p_classificacao;
  if c.lead_id is null or coalesce(c.confianca, 0) < 0.8 then return 'ignorado'; end if;
  select conversa_id into v_conv from campanha_leads where id = c.campanha_lead_id;
  select fone_br(ct.contact_phone) into v_fone
  from sigzap_conversations sc join sigzap_contacts ct on ct.id = sc.contact_id where sc.id = v_conv;
  select fone_br(phone_e164) into v_principal from leads where id = c.lead_id;
  v_fone := coalesce(v_fone, v_principal);

  -- Número que o médico ou a secretária mandaram na conversa (texto, wa.me): guarda no lead como "informado".
  for v_m, v_txt in
    select fone_br(m[1]), sm.message_text from sigzap_messages sm,
      lateral regexp_matches(sm.message_text, '((?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4})', 'g') m
    where sm.conversation_id = v_conv and not sm.from_me and sm.message_text is not null
  loop
    if v_m is not null and v_m <> v_fone and v_m <> coalesce(v_principal, '') then
      -- Número citado pelo consultório ou junto de agendamento/receita/secretária é outro canal do consultório,
      -- não o do médico (caso real: "falar com a Monique pelo WhatsApp 54…" virava o telefone principal).
      if c.resultado = 'filtro_secretaria' or v_txt ~* 'agend|consulta|receita|secret[aá]ri|exame|document|paciente|conv[eê]nio' then
        perform lead_telefone_marcar(c.lead_id, v_m, 'consultorio', 'conversa', 'Número citado como canal do consultório', null, v_conv, c.campanha_id);
      elsif lead_telefone_marcar(c.lead_id, v_m, 'informado', 'conversa', 'Número enviado na conversa', left(v_txt, 200), v_conv, c.campanha_id) then
        update leads set whatsapp_phones = array_append(coalesce(whatsapp_phones, '{}'), v_m)
        where id = c.lead_id and not (v_m = any(coalesce(whatsapp_phones, '{}')));
        v_feito := v_feito || 'informado ';
      end if;
      if v_txt !~* 'agend|consulta|receita|secret[aá]ri|exame|document|paciente|conv[eê]nio' then v_citado := coalesce(v_citado, v_m); end if;
    end if;
  end loop;

  if c.resultado = 'contato_errado' then
    perform lead_telefone_marcar(c.lead_id, v_fone, 'errado', 'classificador', 'Quem respondeu disse que o número não é do médico', c.trecho, v_conv, c.campanha_id);
    v_feito := v_feito || 'errado ';
    -- O número errado era o principal: troca pelo outro número utilizável do lead, se houver.
    if v_fone = v_principal then
      -- Quem avisou do engano e passou o número certo ("segue o número correto dele"): esse vem primeiro.
      v_outro := coalesce(
        case when v_citado is not null and not exists (select 1 from leads o where o.phone_e164 = '+' || v_citado and o.id <> c.lead_id and o.merged_into_id is null)
             then v_citado end,
        lead_outro_telefone(c.lead_id));
      if v_outro is not null then
        update leads set phone_e164 = '+' || v_outro, updated_at = now() where id = c.lead_id;
        insert into lead_historico (lead_id, tipo_evento, descricao_resumida, metadados)
        values (c.lead_id, 'outro', 'Telefone principal trocado para ' || v_outro || ' (o anterior não era do médico)',
          jsonb_build_object('tipo', 'telefone_principal', 'anterior', v_fone, 'novo', v_outro));
        v_feito := v_feito || 'trocou_principal ';
      end if;
    end if;
    -- Sai das campanhas abertas: a conversa por esse número acabou. Com outro número, entra de novo numa próxima campanha.
    for cl in select campanha_id from campanha_leads where lead_id = c.lead_id and status in ('contatado', 'em_conversa', 'aquecido') loop
      perform atualizar_status_lead_campanha(cl.campanha_id, c.lead_id, 'descartado', 'whatsapp',
        jsonb_build_object('motivo', 'contato_errado', 'telefone', v_fone, 'outro_telefone', v_outro));
    end loop;
  elsif c.resultado = 'filtro_secretaria' then
    if lead_telefone_marcar(c.lead_id, v_fone, 'consultorio', 'classificador', 'Respondeu a secretária ou o robô do consultório', c.trecho, v_conv, c.campanha_id) then
      v_feito := v_feito || 'consultorio ';
    end if;
  elsif c.resultado = 'fora_do_perfil' then
    -- Só a campanha desta conversa: "fora do perfil" mistura "não atuo mais" com "não sou dessa subárea".
    if exists (select 1 from campanha_leads where id = c.campanha_lead_id and status in ('contatado', 'em_conversa', 'aquecido')) then
      perform atualizar_status_lead_campanha(c.campanha_id, c.lead_id, 'descartado', 'whatsapp',
        jsonb_build_object('motivo', 'fora_do_perfil', 'trecho', c.trecho));
      v_feito := v_feito || 'fora_do_perfil ';
    end if;
  end if;
  return coalesce(nullif(trim(v_feito), ''), 'nada');
end;
$$;
revoke all on function public.lead_contato_aplicar(uuid) from public, anon, authenticated;
grant execute on function public.lead_contato_aplicar(uuid) to service_role;

create or replace function public.tg_conversa_classificacao_aplicar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- nunca derruba a classificação por causa da regra: erro vira aviso no log
  begin
    perform lead_contato_aplicar(new.id);
  exception when others then
    raise warning 'lead_contato_aplicar(%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists conversa_classificacao_aplicar on public.conversa_classificacao;
create trigger conversa_classificacao_aplicar after insert or update of resultado on public.conversa_classificacao
  for each row execute function public.tg_conversa_classificacao_aplicar();
