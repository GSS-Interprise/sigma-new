-- Campanha com 1º contato pelo celular da equipe (Raul, 17/11/2026).
-- A equipe quer campanhas em que o Sigma NÃO envia nada: ele só monta a lista de médicos e um texto sugerido; cada
-- pessoa chama o médico do próprio celular e marca no Sigma que chamou. A resposta chega no celular, não no Sigma.
--
-- Como o Sigma deixa de enviar:
--   tipo_envio = 'manual' + whatsapp_provider = 'evolution' -> campanha-disparo-scheduler e campanha-disparo-processor
--   já pulam (manual só dispara pela API oficial); cadencia_ativa = false -> sem follow-up automático; a IA já recusa
--   tipo_envio manual. A coluna primeiro_contato diz à tela que não há chip nem modelo: mostra "Abrir no WhatsApp".

alter table public.campanhas
  add column if not exists primeiro_contato text not null default 'sigma';

do $$ begin
  alter table public.campanhas add constraint campanhas_primeiro_contato_check
    check (primeiro_contato in ('sigma', 'celular'));
exception when duplicate_object then null; end $$;

comment on column public.campanhas.primeiro_contato is
  'sigma = o 1º contato sai pelo Sigma (API oficial ou chip); celular = a equipe chama do próprio celular e marca no Sigma (o Sigma não envia nada). Texto sugerido em mensagem_inicial.';

create or replace function public.campanha_assistente_criar(p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

revoke all on function public.campanha_assistente_criar(jsonb) from public, anon;
grant execute on function public.campanha_assistente_criar(jsonb) to authenticated, service_role;

-- "Marquei que chamei": a pessoa chamou o médico do celular. Mesmo efeito do 1º contato manual pelo chip
-- (campanha-disparo-manual-1contato): frio vira contatado, grava a data do 1º contato e o histórico do lead.
-- Só vale em campanha de celular: nas outras, quem marca é o envio de verdade.
create or replace function public.campanha_lead_chamado_celular(p_campanha_lead_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_nome text;
  v_cl record;
begin
  if v_user is null then raise exception 'authentication_required'; end if;

  select cl.id, cl.lead_id, cl.campanha_id, cl.status, cl.data_primeiro_contato, c.primeiro_contato
    into v_cl
    from campanha_leads cl join campanhas c on c.id = cl.campanha_id
   where cl.id = p_campanha_lead_id;
  if v_cl.id is null then raise exception 'lead_da_campanha_nao_encontrado'; end if;
  if v_cl.primeiro_contato <> 'celular' then raise exception 'campanha_nao_e_de_celular'; end if;

  -- Já contatado: não mexe (clique repetido não reescreve a data do 1º contato).
  if v_cl.data_primeiro_contato is not null then
    return jsonb_build_object('ok', true, 'ja_estava', true, 'status', v_cl.status);
  end if;

  update campanha_leads
     set status = case when status = 'frio' then 'contatado' else status end,
         data_primeiro_contato = now(),
         data_ultimo_contato = now(),
         updated_at = now()
   where id = v_cl.id;
  update leads set ultimo_disparo_em = now(), updated_at = now() where id = v_cl.lead_id;

  select nome_completo into v_nome from profiles where id = v_user;
  insert into lead_historico (lead_id, tipo_evento, descricao_resumida, metadados, usuario_id, usuario_nome)
  values (v_cl.lead_id, 'disparo_manual', '1º contato feito pelo celular da equipe (campanha)',
          jsonb_build_object('origem', 'celular_1o_contato', 'campanha_id', v_cl.campanha_id, 'campanha_lead_id', v_cl.id),
          v_user, v_nome);

  return jsonb_build_object('ok', true, 'ja_estava', false, 'status', case when v_cl.status = 'frio' then 'contatado' else v_cl.status end);
end;
$function$;

revoke all on function public.campanha_lead_chamado_celular(uuid) from public, anon;
grant execute on function public.campanha_lead_chamado_celular(uuid) to authenticated, service_role;
