-- Contar e enfileirar o público do e-mail direto no banco (27/09).
-- Pela API, o RPC email_publico_campanha volta no máximo 1000 linhas (max_rows do
-- PostgREST): uma campanha de 30 mil médicos estimaria "1000" e só 1000 entrariam na fila.

create or replace function public.email_publico_total(p_campanha_id uuid)
returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from email_publico_campanha(p_campanha_id);
$$;

-- Coloca na fila quem ainda não está (reenviar a campanha não duplica ninguém).
create or replace function public.email_enfileirar_campanha(p_campanha_id uuid)
returns bigint
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  insert into email_envios (campanha_id, lead_id, email, nome)
  select p_campanha_id, p.lead_id, p.email, p.nome
    from email_publico_campanha(p_campanha_id) p
  on conflict (campanha_id, email) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.email_publico_total(uuid) from public, anon;
revoke all on function public.email_enfileirar_campanha(uuid) from public, anon, authenticated;
grant execute on function public.email_publico_total(uuid) to authenticated, service_role;
grant execute on function public.email_enfileirar_campanha(uuid) to service_role;
