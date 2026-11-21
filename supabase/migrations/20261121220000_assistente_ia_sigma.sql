-- Assistente de IA dentro do Sigma, T1 e T2 (docs/arquitetura/assistente-ia-sigma.md, 21/11/2026).
-- A IA nunca grava: ferramenta de escrita vira linha em assistente_propostas; só assistente_confirmar, chamada pelo
-- front com o login da pessoa, executa, pelas mesmas RPCs da tela e com as mesmas checagens.

-- Permissão de tela no banco: has_permission (perfil x módulo x ação) menos o bloqueio por pessoa.
create or replace function public.pode_modulo(p_uid uuid, p_modulo text, p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null
     and not exists (select 1 from usuario_modulos_bloqueados b where b.user_id = p_uid and b.modulo = p_modulo)
     and public.has_permission(p_uid, p_modulo, p_acao);
$$;
grant execute on function public.pode_modulo(uuid, text, text) to authenticated, service_role;

-- Quem edita campanha hoje: os papéis da RLS de campanhas ("Usuários autorizados podem gerenciar campanhas").
create or replace function public.pode_editar_campanha(p_uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_uid is not null
     and not exists (select 1 from usuario_modulos_bloqueados b where b.user_id = p_uid and b.modulo = 'disparos')
     and (public.is_admin(p_uid) or public.has_role(p_uid, 'gestor_marketing'::app_role)
          or public.has_role(p_uid, 'gestor_captacao'::app_role) or public.has_role(p_uid, 'diretoria'::app_role));
$$;
grant execute on function public.pode_editar_campanha(uuid) to authenticated, service_role;

create table if not exists public.assistente_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  titulo text,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
create index if not exists assistente_conversas_user_idx on public.assistente_conversas (user_id, atualizada_em desc);

create table if not exists public.assistente_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.assistente_conversas(id) on delete cascade,
  papel text not null check (papel in ('usuario', 'assistente')),
  texto text not null default '',
  ferramentas jsonb not null default '[]'::jsonb,   -- [{nome, args, hash, ms, erro}]
  proposta_id uuid,
  modelo text,
  ms int,
  erro text,
  criado_em timestamptz not null default now()
);
create index if not exists assistente_mensagens_conversa_idx on public.assistente_mensagens (conversa_id, criado_em);

create table if not exists public.assistente_propostas (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid references public.assistente_conversas(id) on delete set null,
  user_id uuid not null,
  tipo text not null check (tipo in ('criar_campanha', 'editar_campanha')),
  campanha_id uuid,
  payload jsonb not null,
  resumo jsonb not null default '{}'::jsonb,      -- o que o cartão mostra: título e linhas antes/depois
  status text not null default 'pendente' check (status in ('pendente', 'confirmada', 'descartada', 'erro')),
  resultado jsonb,
  criada_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '2 hours',
  decidida_em timestamptz
);
create index if not exists assistente_propostas_user_idx on public.assistente_propostas (user_id, criada_em desc);

grant select on public.assistente_conversas, public.assistente_mensagens, public.assistente_propostas to authenticated;
grant all on public.assistente_conversas, public.assistente_mensagens, public.assistente_propostas to service_role;
alter table public.assistente_conversas enable row level security;
alter table public.assistente_mensagens enable row level security;
alter table public.assistente_propostas enable row level security;

-- Cada um lê o que é seu; admin lê tudo (auditoria). Escrita: só a edge (service_role) e as RPCs abaixo.
drop policy if exists assistente_conversas_ler on public.assistente_conversas;
create policy assistente_conversas_ler on public.assistente_conversas for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));
drop policy if exists assistente_mensagens_ler on public.assistente_mensagens;
create policy assistente_mensagens_ler on public.assistente_mensagens for select to authenticated
  using (exists (select 1 from assistente_conversas c where c.id = conversa_id and (c.user_id = auth.uid() or public.is_admin(auth.uid()))));
drop policy if exists assistente_propostas_ler on public.assistente_propostas;
create policy assistente_propostas_ler on public.assistente_propostas for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- T2. Editar campanha de prospecção pelo assistente. Lista branca do que dá para mudar conversando; cada campo valida
-- como a tela. p_aplicar = false só valida e devolve antes/depois (é o que vira o cartão); true grava.
-- Chaves aceitas em p: nome, status ('ativa'|'pausada'), limite_por_numero (1-250), sender_ids, template_name,
-- template_variables, briefing (só as chaves de BRIEFING_EDITAVEL), alerta_destinos [{nome, fone}].
create or replace function public.campanha_assistente_editar(p_campanha_id uuid, p jsonb, p_aplicar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  c campanhas%rowtype;
  v_mud jsonb := '[]'::jsonb;   -- [{campo, rotulo, antes, depois}]
  v_senders uuid[];
  v_template text;
  v_template_id uuid;
  v_por_numero int;
  v_por_numero_atual int;
  v_brief jsonb;
  v_brief_novo jsonb;
  v_destinos jsonb;
  k text;
  -- Campos do briefing que o dono muda conversando (os mesmos do passo "vaga" do assistente de tela).
  BRIEFING_EDITAVEL constant text[] := array['hospital', 'cidade', 'tipo_servico', 'valor_min', 'valor_max', 'valor_por',
    'instrucoes_especiais', 'ia_informa_valor', 'sigilo_local'];
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if not public.pode_editar_campanha(v_user) then raise exception 'sem_permissao'; end if;
  select * into c from campanhas where id = p_campanha_id;
  if c.id is null or c.tipo_campanha is distinct from 'prospeccao' then raise exception 'campanha_nao_encontrada'; end if;
  if c.status::text in ('finalizada', 'arquivada') then raise exception 'campanha_encerrada'; end if;
  for k in select jsonb_object_keys(p) loop
    if k not in ('nome', 'status', 'limite_por_numero', 'sender_ids', 'template_name', 'template_variables', 'briefing', 'alerta_destinos') then
      raise exception 'campo_nao_editavel: %', k;
    end if;
  end loop;

  if p ? 'nome' then
    if length(btrim(coalesce(p ->> 'nome', ''))) not between 3 and 120 then raise exception 'nome_invalido'; end if;
    if btrim(p ->> 'nome') <> c.nome then
      v_mud := v_mud || jsonb_build_object('campo', 'nome', 'rotulo', 'Nome', 'antes', c.nome, 'depois', btrim(p ->> 'nome'));
    end if;
  end if;

  if p ? 'status' then
    if p ->> 'status' not in ('ativa', 'pausada') then raise exception 'status_invalido'; end if;
    if p ->> 'status' <> c.status::text then
      v_mud := v_mud || jsonb_build_object('campo', 'status', 'rotulo', 'Situação', 'antes', c.status::text, 'depois', p ->> 'status');
    end if;
  end if;

  v_senders := coalesce(c.official_sender_ids, '{}');
  if p ? 'sender_ids' then
    if c.primeiro_contato = 'celular' then raise exception 'campanha_de_celular_nao_tem_numero'; end if;
    select array_agg(x::uuid) into v_senders from jsonb_array_elements_text(p -> 'sender_ids') x;
    if coalesce(cardinality(v_senders), 0) = 0 then raise exception 'escolha_ao_menos_um_numero'; end if;
  end if;
  v_template := coalesce(nullif(p ->> 'template_name', ''), c.official_template_name);
  if p ? 'sender_ids' or p ? 'template_name' then
    if c.primeiro_contato = 'celular' then raise exception 'campanha_de_celular_nao_tem_modelo'; end if;
    if v_template is null then raise exception 'escolha_um_modelo'; end if;
    if exists (select 1 from unnest(v_senders) s where campanha_template_do_numero(s, v_template) is null) then
      raise exception 'modelo_nao_aprovado_em_algum_numero';
    end if;
    v_template_id := campanha_template_do_numero(v_senders[1], v_template);
    if v_senders is distinct from coalesce(c.official_sender_ids, '{}') then
      v_mud := v_mud || jsonb_build_object('campo', 'sender_ids', 'rotulo', 'Números',
        'antes', (select coalesce(jsonb_agg(phone_e164 order by phone_e164), '[]') from whatsapp_official_senders where id = any(coalesce(c.official_sender_ids, '{}'))),
        'depois', (select coalesce(jsonb_agg(phone_e164 order by phone_e164), '[]') from whatsapp_official_senders where id = any(v_senders)));
    end if;
    if v_template is distinct from c.official_template_name then
      v_mud := v_mud || jsonb_build_object('campo', 'template_name', 'rotulo', 'Modelo da mensagem', 'antes', c.official_template_name, 'depois', v_template);
    end if;
  end if;
  if p ? 'template_variables' and (p -> 'template_variables') is distinct from coalesce(c.official_template_variables, '{}'::jsonb) then
    if jsonb_typeof(p -> 'template_variables') <> 'object' then raise exception 'variaveis_invalidas'; end if;
    v_mud := v_mud || jsonb_build_object('campo', 'template_variables', 'rotulo', 'Variáveis do modelo', 'antes', c.official_template_variables, 'depois', p -> 'template_variables');
  end if;

  v_por_numero_atual := case when coalesce(cardinality(c.official_sender_ids), 0) > 0 and c.limite_diario_campanha is not null
    then c.limite_diario_campanha / cardinality(c.official_sender_ids) end;
  v_por_numero := coalesce((p ->> 'limite_por_numero')::int, v_por_numero_atual);
  if p ? 'limite_por_numero' then
    if c.primeiro_contato = 'celular' then raise exception 'campanha_de_celular_nao_tem_limite'; end if;
    if v_por_numero not between 1 and 250 then raise exception 'limite_por_numero_entre_1_e_250'; end if;
    if v_por_numero is distinct from v_por_numero_atual then
      v_mud := v_mud || jsonb_build_object('campo', 'limite_por_numero', 'rotulo', 'Envios por número por dia', 'antes', v_por_numero_atual, 'depois', v_por_numero);
    end if;
  end if;

  v_brief := coalesce(c.briefing_ia, '{}'::jsonb);
  v_brief_novo := v_brief;
  if p ? 'briefing' then
    if jsonb_typeof(p -> 'briefing') <> 'object' then raise exception 'briefing_invalido'; end if;
    for k in select jsonb_object_keys(p -> 'briefing') loop
      if not (k = any(BRIEFING_EDITAVEL)) then raise exception 'campo_do_briefing_nao_editavel: %', k; end if;
      if (p -> 'briefing' -> k) is distinct from (v_brief -> k) then
        v_brief_novo := jsonb_set(v_brief_novo, array[k], p -> 'briefing' -> k, true);
        v_mud := v_mud || jsonb_build_object('campo', 'briefing.' || k, 'rotulo', 'Vaga: ' || replace(k, '_', ' '), 'antes', v_brief -> k, 'depois', p -> 'briefing' -> k);
      end if;
    end loop;
  end if;

  if p ? 'alerta_destinos' then
    -- Mesma normalização do campanha_assistente_criar.
    select coalesce(jsonb_agg(jsonb_build_object('nome', left(coalesce(x.nome, ''), 60), 'fone', x.fone)), '[]'::jsonb)
      into v_destinos
      from (select e ->> 'nome' as nome, case when length(d) in (10, 11) then '55' || d else d end as fone
              from jsonb_array_elements(coalesce(p -> 'alerta_destinos', '[]')) e,
                   lateral (select regexp_replace(coalesce(e ->> 'fone', ''), '\D', '', 'g') as d) n) x
     where x.fone ~ '^55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$';
    if v_destinos is distinct from coalesce(c.alerta_destinos, '[]'::jsonb) then
      v_mud := v_mud || jsonb_build_object('campo', 'alerta_destinos', 'rotulo', 'Quem recebe o aviso', 'antes', c.alerta_destinos, 'depois', v_destinos);
    end if;
  end if;

  if p_aplicar and jsonb_array_length(v_mud) > 0 then
    update campanhas set
      nome = case when p ? 'nome' then btrim(p ->> 'nome') else nome end,
      status = case when p ? 'status' then (p ->> 'status')::status_campanha else status end,
      official_sender_ids = case when p ? 'sender_ids' then v_senders else official_sender_ids end,
      official_sender_id = case when p ? 'sender_ids' then v_senders[1] else official_sender_id end,
      official_template_name = case when p ? 'template_name' then v_template else official_template_name end,
      official_template_id = case when p ? 'sender_ids' or p ? 'template_name' then coalesce(v_template_id, official_template_id) else official_template_id end,
      official_template_variables = case when p ? 'template_variables' then p -> 'template_variables' else official_template_variables end,
      limite_diario_campanha = case when (p ? 'limite_por_numero' or p ? 'sender_ids') and v_por_numero is not null
        then v_por_numero * cardinality(v_senders) else limite_diario_campanha end,
      briefing_ia = v_brief_novo,
      alerta_destinos = case when p ? 'alerta_destinos' then v_destinos else alerta_destinos end,
      updated_by = v_user,
      updated_by_name = (select nome_completo from profiles where id = v_user),
      updated_at = now()
    where id = c.id;
  end if;

  return jsonb_build_object('campanha_id', c.id, 'nome', c.nome, 'mudancas', v_mud, 'aplicado', p_aplicar and jsonb_array_length(v_mud) > 0);
end $$;
revoke all on function public.campanha_assistente_editar(uuid, jsonb, boolean) from public, anon;
grant execute on function public.campanha_assistente_editar(uuid, jsonb, boolean) to authenticated;

-- Confirmar ou descartar a proposta: só a dona da proposta, só pendente e dentro do prazo. A RPC chamada aqui roda
-- com o mesmo auth.uid() de quem clicou, então as checagens dela valem de novo.
create or replace function public.assistente_confirmar(p_proposta_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  pr assistente_propostas%rowtype;
  v_res jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into pr from assistente_propostas where id = p_proposta_id for update;
  if pr.id is null or pr.user_id <> v_user then raise exception 'proposta_nao_encontrada'; end if;
  if pr.status <> 'pendente' then raise exception 'proposta_ja_decidida'; end if;
  if pr.expira_em < now() then raise exception 'proposta_expirada'; end if;
  begin
    if pr.tipo = 'criar_campanha' then
      v_res := public.campanha_assistente_criar(pr.payload);
    else
      v_res := public.campanha_assistente_editar(pr.campanha_id, pr.payload, true);
    end if;
  exception when others then
    update assistente_propostas set status = 'erro', resultado = jsonb_build_object('erro', sqlerrm), decidida_em = now() where id = pr.id;
    return jsonb_build_object('ok', false, 'erro', sqlerrm);
  end;
  update assistente_propostas set status = 'confirmada', resultado = v_res, decidida_em = now() where id = pr.id;
  return jsonb_build_object('ok', true, 'resultado', v_res);
end $$;
revoke all on function public.assistente_confirmar(uuid) from public, anon;
grant execute on function public.assistente_confirmar(uuid) to authenticated;

create or replace function public.assistente_descartar(p_proposta_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update assistente_propostas set status = 'descartada', decidida_em = now()
   where id = p_proposta_id and user_id = auth.uid() and status = 'pendente';
end $$;
revoke all on function public.assistente_descartar(uuid) from public, anon;
grant execute on function public.assistente_descartar(uuid) to authenticated;

-- campanha_assistente_criar: igual à de 17/11, mais o portão de permissão no banco.
create or replace function public.campanha_assistente_criar(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_nome_user text;
  v_campanha uuid;
  v_strategy uuid;
  v_senders uuid[];
  v_template_name text := nullif(p ->> 'template_name', '');
  v_template_id uuid;
  v_esp uuid[];
  v_ufs text[];
  v_cidades text[];
  v_lista uuid := nullif(p ->> 'lista_id', '')::uuid;
  v_por_numero int := greatest(1, least(coalesce((p ->> 'limite_por_numero')::int, 50), 250));
  v_lead_ids uuid[];
  v_inseridos int := 0;
  v_status text := case when coalesce((p ->> 'comecar')::boolean, false) then 'ativa' else 'pausada' end;
  -- 'celular': a equipe chama do próprio celular; o Sigma não envia nada (sem número, sem modelo, sem aviso).
  v_celular boolean := p ->> 'primeiro_contato' = 'celular';
  v_texto_celular text := nullif(trim(coalesce(p ->> 'texto_celular', '')), '');
  -- 'ia': a IA conversa depois do 1º contato; 'manual': o 1º contato sai pela API e a equipe conversa pelo Sigma.
  v_tipo_envio text := case when v_celular or p ->> 'tipo_envio' = 'manual' then 'manual' else 'ia' end;
  v_destinos jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  -- Mesmo portão da tela (/prospeccao, canView('disparos')), agora no banco: o assistente de IA também chega aqui
  -- (assistente_confirmar) e o bloqueio por pessoa (usuario_modulos_bloqueados) só existia no front.
  if not public.pode_modulo(v_user, 'disparos', 'visualizar') then raise exception 'sem_permissao'; end if;

  select array_agg(x::uuid) into v_senders from jsonb_array_elements_text(coalesce(p -> 'sender_ids', '[]')) x;
  select array_agg(x::uuid) into v_esp from jsonb_array_elements_text(coalesce(p -> 'especialidade_ids', '[]')) x;
  select array_agg(x) into v_ufs from jsonb_array_elements_text(coalesce(p -> 'ufs', '[]')) x;
  select array_agg(x) into v_cidades from jsonb_array_elements_text(coalesce(p -> 'cidades', '[]')) x;

  if v_lista is null and coalesce(cardinality(v_esp), 0) = 0 then raise exception 'escolha_especialidade_ou_lista'; end if;

  if v_celular then
    if v_texto_celular is null then raise exception 'escreva_o_texto_sugerido'; end if;
    v_senders := '{}';
    v_template_name := null;
    v_destinos := '[]'::jsonb;
  else
    if coalesce(cardinality(v_senders), 0) = 0 then raise exception 'escolha_ao_menos_um_numero'; end if;
    if v_template_name is null then raise exception 'escolha_um_modelo'; end if;

    -- Todo número escolhido precisa ter a cópia aprovada do modelo.
    if exists (select 1 from unnest(v_senders) s where campanha_template_do_numero(s, v_template_name) is null) then
      raise exception 'modelo_nao_aprovado_em_algum_numero';
    end if;
    v_template_id := campanha_template_do_numero(v_senders[1], v_template_name);

    -- Quem recebe o aviso no WhatsApp: [{nome, fone}], fone só dígitos com 55 (número com DDD e sem 55 ganha o 55).
    -- Vazio = destinos gerais da equipe. Número que não fecha 12-13 dígitos é descartado.
    select coalesce(jsonb_agg(jsonb_build_object('nome', left(coalesce(x.nome, ''), 60), 'fone', x.fone)), '[]'::jsonb)
      into v_destinos
      from (select e ->> 'nome' as nome,
                   case when length(d) in (10, 11) then '55' || d else d end as fone
              from jsonb_array_elements(coalesce(p -> 'alerta_destinos', '[]')) e,
                   lateral (select regexp_replace(coalesce(e ->> 'fone', ''), '\D', '', 'g') as d) n) x
     -- Mesma regra de _shared/alertas.ts (foneValido): celular 9+8 dígitos ou fixo 2-5+7, DDD 11-99.
     where x.fone ~ '^55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$';
  end if;

  select nome_completo into v_nome_user from profiles where id = v_user;

  insert into campanhas (
    nome, canal, status, tipo_campanha, tipo_envio,
    especialidade_ids, especialidade_id, regiao_estados, regiao_estado, regiao_cidades,
    whatsapp_provider, official_sender_ids, official_sender_id, official_template_name, official_template_id,
    official_template_variables, limite_diario_campanha,
    horario_inteligente_ativo, horario_inicio_brt, horario_fim_brt, dias_semana,
    briefing_ia, cadencia_ativa, responsavel_id, nome_remetente,
    criada_via, aprovado_por, aprovado_em, criado_por, created_by, created_by_name, alerta_destinos,
    primeiro_contato, mensagem_inicial
  ) values (
    coalesce(nullif(p ->> 'nome', ''), 'Campanha ' || to_char(now(), 'DD/MM')),
    'whatsapp'::canal_campanha, v_status::status_campanha, 'prospeccao', v_tipo_envio,
    v_esp, v_esp[1], v_ufs, v_ufs[1], v_cidades,
    -- Celular fica como 'evolution' + manual: é a combinação que o scheduler e o processor já pulam.
    case when v_celular then 'evolution' else 'chakra' end, v_senders, v_senders[1], v_template_name, v_template_id,
    case when v_celular then '{}'::jsonb else coalesce(p -> 'template_variables', '{}'::jsonb) end,
    case when v_celular then null else v_por_numero * cardinality(v_senders) end,
    true, 7, 17, array[1, 2, 3, 4, 5]::smallint[],
    coalesce(p -> 'briefing', '{}'::jsonb), not v_celular, v_user, 'Equipe GSS',
    'assistente', v_user, now(), v_user, v_user, v_nome_user, v_destinos,
    case when v_celular then 'celular' else 'sigma' end, v_texto_celular
  ) returning id into v_campanha;

  -- A estratégia principal nasce pelo trigger da campanha.
  select id into v_strategy from campaign_strategies where campanha_id = v_campanha order by prioridade asc limit 1;
  if v_strategy is null then raise exception 'estrategia_principal_nao_criada'; end if;

  if v_lista is not null then
    insert into campanha_listas (campanha_id, lista_id, created_by) values (v_campanha, v_lista, v_user)
    on conflict do nothing;
  end if;

  -- Quem já está em campanha ativa/pausada fica de fora (não falar duas vezes com o mesmo médico).
  select array_agg(lead_id) into v_lead_ids
    from campanha_assistente_leads(v_esp, v_ufs, v_cidades, v_lista)
   where not em_outra;
  if coalesce(cardinality(v_lead_ids), 0) > 0 then
    v_inseridos := adicionar_leads_estrategia(v_campanha, v_strategy, v_lead_ids);
  end if;

  return jsonb_build_object('campanha_id', v_campanha, 'leads', v_inseridos, 'status', v_status);
end;
$function$;
