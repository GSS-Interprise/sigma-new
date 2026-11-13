-- Dois modos de campanha e aviso por campanha (decisão do Raul, 13/11):
--   tipo_envio 'ia'     -> 1º contato pela API oficial e a IA conversa (persona do Maikon).
--   tipo_envio 'manual' -> 1º contato pela API oficial e a EQUIPE conversa pelo Sigma (IA desligada). Antes (09/06) a
--                          manual não disparava nada e o 1º contato era à mão pelo Evolution, desligado desde 08/11.
-- alerta_destinos: quem recebe o aviso no WhatsApp desta campanha ([{nome, fone}]). Vazio = destinos gerais
-- (config alertas_equipe_destinos). Avisos: 'ia' -> médico quer fechar; 'manual' -> médico respondeu (a equipe responde).

alter table public.campanhas add column if not exists alerta_destinos jsonb not null default '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.campanha_assistente_criar(p jsonb)
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
  -- 'ia': a IA conversa depois do 1º contato; 'manual': o 1º contato sai pela API e a equipe conversa pelo Sigma.
  v_tipo_envio text := case when p ->> 'tipo_envio' = 'manual' then 'manual' else 'ia' end;
  v_destinos jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;

  select array_agg(x::uuid) into v_senders from jsonb_array_elements_text(coalesce(p -> 'sender_ids', '[]')) x;
  select array_agg(x::uuid) into v_esp from jsonb_array_elements_text(coalesce(p -> 'especialidade_ids', '[]')) x;
  select array_agg(x) into v_ufs from jsonb_array_elements_text(coalesce(p -> 'ufs', '[]')) x;
  select array_agg(x) into v_cidades from jsonb_array_elements_text(coalesce(p -> 'cidades', '[]')) x;

  if coalesce(cardinality(v_senders), 0) = 0 then raise exception 'escolha_ao_menos_um_numero'; end if;
  if v_template_name is null then raise exception 'escolha_um_modelo'; end if;
  if v_lista is null and coalesce(cardinality(v_esp), 0) = 0 then raise exception 'escolha_especialidade_ou_lista'; end if;

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

  select nome_completo into v_nome_user from profiles where id = v_user;

  insert into campanhas (
    nome, canal, status, tipo_campanha, tipo_envio,
    especialidade_ids, especialidade_id, regiao_estados, regiao_estado, regiao_cidades,
    whatsapp_provider, official_sender_ids, official_sender_id, official_template_name, official_template_id,
    official_template_variables, limite_diario_campanha,
    horario_inteligente_ativo, horario_inicio_brt, horario_fim_brt, dias_semana,
    briefing_ia, cadencia_ativa, responsavel_id, nome_remetente,
    criada_via, aprovado_por, aprovado_em, criado_por, created_by, created_by_name, alerta_destinos
  ) values (
    coalesce(nullif(p ->> 'nome', ''), 'Campanha ' || to_char(now(), 'DD/MM')),
    'whatsapp'::canal_campanha, v_status::status_campanha, 'prospeccao', v_tipo_envio,
    v_esp, v_esp[1], v_ufs, v_ufs[1], v_cidades,
    'chakra', v_senders, v_senders[1], v_template_name, v_template_id,
    coalesce(p -> 'template_variables', '{}'::jsonb), v_por_numero * cardinality(v_senders),
    true, 7, 17, array[1, 2, 3, 4, 5]::smallint[],
    coalesce(p -> 'briefing', '{}'::jsonb), true, v_user, 'Equipe GSS',
    'assistente', v_user, now(), v_user, v_user, v_nome_user, v_destinos
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
