-- Celulares da equipe atrelados à campanha de 1º contato pelo celular (Raul, 17/11/2026).
-- Na criação, o Vinicius escolhe quem da equipe vai chamar ([{nome, fone}], fone só dígitos com 55). Cada "Chamei"
-- grava em campanha_leads.celular_contato de qual celular saiu: é o que permite medir contatos e respostas por telefone
-- (do mesmo jeito que official_sender_ids mede as campanhas que saem pelo Sigma).

alter table public.campanhas add column if not exists celulares_equipe jsonb not null default '[]'::jsonb;
comment on column public.campanhas.celulares_equipe is
  'Campanha de celular: [{nome, fone}] da equipe que chama os médicos. fone = dígitos com 55.';

alter table public.campanha_leads add column if not exists celular_contato text;
comment on column public.campanha_leads.celular_contato is
  'Campanha de celular: de qual celular da equipe saiu o 1º contato (dígitos com 55). Base da métrica por telefone.';

-- Normaliza [{nome, fone}] como o aviso da campanha: 55 na frente de DDD+número e só celular/fixo válido.
create or replace function public.campanha_normalizar_fones(p jsonb)
 returns jsonb
 language sql
 immutable
 set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(distinct jsonb_build_object('nome', left(coalesce(x.nome, ''), 60), 'fone', x.fone)), '[]'::jsonb)
    from (select e ->> 'nome' as nome,
                 case when length(d) in (10, 11) then '55' || d else d end as fone
            from jsonb_array_elements(coalesce(p, '[]')) e,
                 lateral (select regexp_replace(coalesce(e ->> 'fone', ''), '\D', '', 'g') as d) n) x
   -- Mesma regra de _shared/alertas.ts (foneValido): celular 9+8 dígitos ou fixo 2-5+7, DDD 11-99.
   where x.fone ~ '^55[1-9][1-9](9[0-9]{8}|[2-5][0-9]{7})$';
$function$;

-- Grava os celulares na criação: o assistente chama campanha_assistente_criar e, na campanha de celular, logo depois
-- esta função (fica separada para não reescrever de novo o RPC grande da criação).
create or replace function public.campanha_definir_celulares(p_campanha_id uuid, p_celulares jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v jsonb := campanha_normalizar_fones(p_celulares);
begin
  if auth.uid() is null then raise exception 'authentication_required'; end if;
  if not exists (select 1 from campanhas where id = p_campanha_id and primeiro_contato = 'celular') then
    raise exception 'campanha_nao_e_de_celular';
  end if;
  update campanhas set celulares_equipe = v, updated_at = now() where id = p_campanha_id;
  return v;
end;
$function$;

revoke all on function public.campanha_definir_celulares(uuid, jsonb) from public, anon;
grant execute on function public.campanha_definir_celulares(uuid, jsonb) to authenticated, service_role;

-- "Chamei": agora com o celular de onde saiu. A versão de 1 argumento sai (ninguém usa ainda: nasceu hoje).
drop function if exists public.campanha_lead_chamado_celular(uuid);

create or replace function public.campanha_lead_chamado_celular(p_campanha_lead_id uuid, p_fone text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_user uuid := auth.uid();
  v_nome text;
  v_cl record;
  v_fone text := regexp_replace(coalesce(p_fone, ''), '\D', '', 'g');
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if length(v_fone) in (10, 11) then v_fone := '55' || v_fone; end if;

  select cl.id, cl.lead_id, cl.campanha_id, cl.status, cl.data_primeiro_contato, c.primeiro_contato, c.celulares_equipe
    into v_cl
    from campanha_leads cl join campanhas c on c.id = cl.campanha_id
   where cl.id = p_campanha_lead_id;
  if v_cl.id is null then raise exception 'lead_da_campanha_nao_encontrado'; end if;
  if v_cl.primeiro_contato <> 'celular' then raise exception 'campanha_nao_e_de_celular'; end if;
  -- O celular precisa ser um dos da campanha: é o que mantém a métrica por telefone honesta.
  if not exists (select 1 from jsonb_array_elements(v_cl.celulares_equipe) e where e ->> 'fone' = v_fone) then
    raise exception 'celular_fora_da_campanha';
  end if;

  -- Já contatado: não mexe (clique repetido não reescreve a data nem o celular do 1º contato).
  if v_cl.data_primeiro_contato is not null then
    return jsonb_build_object('ok', true, 'ja_estava', true, 'status', v_cl.status);
  end if;

  update campanha_leads
     set status = case when status = 'frio' then 'contatado' else status end,
         data_primeiro_contato = now(),
         data_ultimo_contato = now(),
         celular_contato = v_fone,
         updated_at = now()
   where id = v_cl.id;
  update leads set ultimo_disparo_em = now(), updated_at = now() where id = v_cl.lead_id;

  select nome_completo into v_nome from profiles where id = v_user;
  insert into lead_historico (lead_id, tipo_evento, descricao_resumida, metadados, usuario_id, usuario_nome)
  values (v_cl.lead_id, 'disparo_manual', '1º contato feito pelo celular da equipe (campanha)',
          jsonb_build_object('origem', 'celular_1o_contato', 'campanha_id', v_cl.campanha_id,
                             'campanha_lead_id', v_cl.id, 'celular', v_fone),
          v_user, v_nome);

  return jsonb_build_object('ok', true, 'ja_estava', false, 'status', case when v_cl.status = 'frio' then 'contatado' else v_cl.status end);
end;
$function$;

revoke all on function public.campanha_lead_chamado_celular(uuid, text) from public, anon;
grant execute on function public.campanha_lead_chamado_celular(uuid, text) to authenticated, service_role;
