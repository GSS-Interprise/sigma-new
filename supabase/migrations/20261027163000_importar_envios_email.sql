-- E-mail nominal da campanha (reunião com Ramone e Vinicius, 27/10): a equipe manda ~2.500
-- e-mails por dia do próprio e-mail, a partir da lista que o Vinicius tira da campanha.
-- O Vinicius sobe a mesma planilha na campanha e o Sigma registra uma tarefa de e-mail feita
-- para cada médico da lista: vira indicador sem ninguém marcar um a um.
-- Fica fora de email_envios de propósito: lá são os envios do e-mail marketing (Resend), com
-- abertura e clique; misturar estragaria essas métricas.
-- O médico não muda de etapa no Kanban: o e-mail é um toque, e o primeiro contato que move
-- o card continua sendo o WhatsApp.
-- origem própria para a tarefa vinda da planilha (dá para separar no BI e desfazer se precisar)
alter table public.campanha_lead_tasks drop constraint if exists campanha_lead_tasks_origem_check;
alter table public.campanha_lead_tasks add constraint campanha_lead_tasks_origem_check
  check (origem = any (array['cadencia', 'manual', 'conversa', 'ia', 'parecer', 'sistema', 'importacao_email']));

create or replace function public.importar_envios_email(
  p_campanha_id uuid,
  p_emails text[],
  p_enviado_por uuid default null,
  p_enviado_em timestamptz default now()
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quem uuid := coalesce(p_enviado_por, auth.uid());
  v_emails text[];
  v_registrados int := 0;
  v_ja int := 0;
  v_achados int := 0;
  v_alvo uuid[];
begin
  if not (auth.uid() is null
          or public.is_admin(auth.uid())
          or public.has_role(auth.uid(), 'gestor_captacao'::app_role)
          or public.has_captacao_permission(auth.uid(), 'leads')
          or public.has_captacao_permission(auth.uid(), 'disparos_email')) then
    raise exception 'sem_permissao' using errcode = '42501';
  end if;

  select coalesce(array_agg(distinct lower(trim(e))), '{}') into v_emails
    from unnest(p_emails) e where trim(coalesce(e, '')) like '%@%';

  -- médicos da campanha com algum desses e-mails (principal ou adicional)
  select coalesce(array_agg(distinct cl.id), '{}') into v_alvo
    from campanha_leads cl join leads l on l.id = cl.lead_id
   where cl.campanha_id = p_campanha_id
     and (lower(trim(l.email)) = any(v_emails)
          or exists (select 1 from unnest(coalesce(l.emails_adicionais, '{}'::text[])) a
                      where lower(trim(a)) = any(v_emails)));
  -- e-mails da planilha que não pertencem a nenhum médico desta campanha
  select count(*) into v_achados from unnest(v_emails) e
   where exists (select 1 from campanha_leads cl join leads l on l.id = cl.lead_id
                  where cl.campanha_id = p_campanha_id
                    and (lower(trim(l.email)) = e
                         or e = any(select lower(trim(a)) from unnest(coalesce(l.emails_adicionais, '{}'::text[])) a)));

  -- mesma planilha subida duas vezes no mesmo dia não conta em dobro
  select count(*) into v_ja from unnest(v_alvo) as a(campanha_lead_id)
   where exists (select 1 from campanha_lead_tasks t
                  where t.campanha_lead_id = a.campanha_lead_id and t.tipo = 'email'
                    and t.origem = 'importacao_email'
                    and (t.feita_em at time zone 'America/Sao_Paulo')::date = (p_enviado_em at time zone 'America/Sao_Paulo')::date);

  insert into campanha_lead_tasks (campanha_lead_id, tipo, ordem, rotulo, status, prazo_at, feita_em, feita_por, origem, criada_por, responsavel_id)
  select a.campanha_lead_id, 'email',
         (select coalesce(max(t.ordem), 0) + 1 from campanha_lead_tasks t where t.campanha_lead_id = a.campanha_lead_id),
         'E-mail enviado', 'feita', p_enviado_em, p_enviado_em, v_quem, 'importacao_email', auth.uid(), v_quem
    from unnest(v_alvo) as a(campanha_lead_id)
   where not exists (select 1 from campanha_lead_tasks t
                      where t.campanha_lead_id = a.campanha_lead_id and t.tipo = 'email'
                        and t.origem = 'importacao_email'
                        and (t.feita_em at time zone 'America/Sao_Paulo')::date = (p_enviado_em at time zone 'America/Sao_Paulo')::date);
  get diagnostics v_registrados = row_count;

  return jsonb_build_object(
    'emails_na_planilha', coalesce(array_length(v_emails, 1), 0),
    'registrados', v_registrados,
    'ja_registrados_hoje', v_ja,
    'fora_da_campanha', greatest(coalesce(array_length(v_emails, 1), 0) - v_achados, 0)
  );
end;
$$;

revoke all on function public.importar_envios_email(uuid, text[], uuid, timestamptz) from public;
grant execute on function public.importar_envios_email(uuid, text[], uuid, timestamptz) to authenticated, service_role;
