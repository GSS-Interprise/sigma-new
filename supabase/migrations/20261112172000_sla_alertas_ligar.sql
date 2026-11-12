-- Liga/desliga os avisos automáticos ao médico pela aba Escala de plantão (Wagner, Brenda, admin).
-- config_lista_items só é editável por admin; esta função abre só esta chave para quem opera o SLA.
create or replace function public.sla_alertas_ligar(p_ativo boolean) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not sla_pode_operar(auth.uid()) then raise exception 'sem_permissao'; end if;
  update config_lista_items set valor = case when p_ativo then 'true' else 'false' end where campo_nome = 'sla_alertas_ativo';
  if not found then
    insert into config_lista_items (campo_nome, valor) values ('sla_alertas_ativo', case when p_ativo then 'true' else 'false' end);
  end if;
  return p_ativo;
end;
$$;
revoke all on function public.sla_alertas_ligar(boolean) from public, anon;
grant execute on function public.sla_alertas_ligar(boolean) to authenticated;
