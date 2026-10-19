-- Telefone do médico e do lead sincronizados (Mavi, 19/10). O pedido de nota fiscal lê medicos.telefone,
-- mas a ficha do médico na tela de Médicos grava leads.phone_e164: a equipe corrigiu o WhatsApp do Alex
-- na ficha e o pedido continuou indo para o número antigo. Agora, mudou num, muda no outro.
-- Também completa o 9 do celular digitado sem ele (47 8406-5262 virou 47 98406-5262): a aba Notas
-- fiscais aceitava o número de 10 dígitos e o pedido saía para um número que não é WhatsApp.
-- Os 159 médicos que já tinham número diferente do lead em 19/10 NÃO foram sobrescritos: não há como
-- saber qual dos dois está certo; corrigem-se na próxima edição de qualquer lado.

-- Número brasileiro no padrão do cadastro (+55DDDnúmero) ou null se não der para entender.
create or replace function public.telefone_br_e164(p text)
returns text language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
begin
  d := regexp_replace(d, '^0+', '');
  if length(d) in (10, 11) then d := '55' || d; end if;
  -- celular antigo sem o 9 (55 + DDD + 8 dígitos começando em 6-9): completa
  if length(d) = 12 and substr(d, 5, 1) ~ '[6-9]' then d := substr(d, 1, 4) || '9' || substr(d, 5); end if;
  if d !~ '^55\d{10,11}$' then return null; end if;
  return '+' || d;
end;
$$;

-- lead -> médico
create or replace function public.trg_telefone_lead_para_medico()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v text := public.telefone_br_e164(new.phone_e164);
begin
  -- só a alteração feita pela pessoa: a cópia para o outro lado não volta (evita ida e volta)
  if pg_trigger_depth() > 1 or v is null then return new; end if;
  update medicos set telefone = v, updated_at = now()
   where lead_id = new.id and public.telefone_br_e164(telefone) is distinct from v;
  return new;
end;
$$;

drop trigger if exists trg_leads_telefone_para_medico on public.leads;
create trigger trg_leads_telefone_para_medico
  after update of phone_e164 on public.leads
  for each row when (old.phone_e164 is distinct from new.phone_e164)
  execute function public.trg_telefone_lead_para_medico();

-- médico -> lead
create or replace function public.trg_telefone_medico_para_lead()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v text := public.telefone_br_e164(new.telefone);
begin
  if pg_trigger_depth() > 1 or v is null or new.lead_id is null then return new; end if;
  begin
    update leads set phone_e164 = v
     where id = new.lead_id and public.telefone_br_e164(phone_e164) is distinct from v;
  exception when others then
    -- o lead nunca pode impedir a correção do médico (ex.: número já usado por outro lead)
    raise warning 'telefone do lead % não sincronizado: %', new.lead_id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_medicos_telefone_para_lead on public.medicos;
create trigger trg_medicos_telefone_para_lead
  after update of telefone on public.medicos
  for each row when (old.telefone is distinct from new.telefone)
  execute function public.trg_telefone_medico_para_lead();

-- o cadastro do médico grava no padrão +55DDDnúmero, com o 9 (como já era na aba Notas fiscais);
-- o que não der para entender fica como foi digitado
create or replace function public.trg_medicos_telefone_padrao()
returns trigger language plpgsql as $$
begin
  new.telefone := coalesce(public.telefone_br_e164(new.telefone), new.telefone);
  return new;
end;
$$;

drop trigger if exists trg_medicos_telefone_padrao on public.medicos;
create trigger trg_medicos_telefone_padrao
  before insert or update of telefone on public.medicos
  for each row execute function public.trg_medicos_telefone_padrao();

-- aba Notas fiscais: mesmo padrão (completa o 9)
create or replace function public.financeiro_atualizar_contato_medico(
  p_medico_id uuid, p_telefone text default null, p_email text default null
) returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_fone text := public.telefone_br_e164(p_telefone);
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not exists (select 1 from user_roles r where r.user_id = auth.uid()
                  and r.role::text in ('admin', 'gestor_financeiro', 'diretoria')) then
    raise exception 'sem_permissao';
  end if;

  if p_telefone is not null then
    if v_fone is null then raise exception 'telefone_invalido'; end if;
    update medicos set telefone = v_fone, updated_at = now() where id = p_medico_id;
  end if;

  if p_email is not null then
    if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'email_invalido'; end if;
    update medicos set email = v_email, updated_at = now() where id = p_medico_id;
  end if;

  return (select jsonb_build_object('telefone', telefone, 'email', email) from medicos where id = p_medico_id);
end;
$$;

revoke all on function public.financeiro_atualizar_contato_medico(uuid, text, text) from public, anon;
grant execute on function public.financeiro_atualizar_contato_medico(uuid, text, text) to authenticated, service_role;
grant execute on function public.telefone_br_e164(text) to authenticated, service_role;

-- Alex Szepilowski (19/10): a ficha já tinha o número certo, com o 9
update medicos set telefone = '+5547984065262', updated_at = now()
 where id = '5e46cf04-4c75-4363-b261-7bbe3e17a69c' and telefone = '+554784065262';
