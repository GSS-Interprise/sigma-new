-- Motor automático do LinkedIn pela Unipile (Fase 9.4, docs/arquitetura/linkedin-instagram-campanha.md).
-- Começa DESLIGADO em toda conta: um administrador liga em Configurações › LinkedIn e Instagram, conta por conta.
-- Ritmo (edge unipile-motor): só dias úteis, 8h-18h de Brasília, um convite por vez com intervalo aleatório de 12 a 35 min,
-- 5 convites/dia na 1ª semana subindo 3 por semana até o teto da conta (padrão 20), no máximo convites_semana_max (80).
-- Erro de limite ou de restrição da conta pausa o motor sozinho (automatico = false, motivo gravado).

alter table public.linkedin_contas add column if not exists automatico boolean not null default false;
alter table public.linkedin_contas add column if not exists rampa_inicio date;
alter table public.linkedin_contas add column if not exists convites_dia_teto int not null default 20;
alter table public.linkedin_contas add column if not exists proximo_envio_em timestamptz;
alter table public.linkedin_contas add column if not exists motor_motivo text;

-- Quem enviou (conta) e para quem (id do membro no LinkedIn, para casar a resposta que chega pelo webhook).
alter table public.campanha_toques add column if not exists linkedin_conta_id uuid references public.linkedin_contas (id) on delete set null;
alter table public.campanha_toques add column if not exists destino_id text;
create index if not exists campanha_toques_destino on public.campanha_toques (destino_id) where destino_id is not null;

-- Liga/desliga o envio automático de uma conta. Só administrador. Ligar zera a rampa (volta para 5 por dia).
create or replace function public.linkedin_motor_ligar(p_conta_id uuid, p_ligar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_admin(auth.uid()) then raise exception 'so_administrador'; end if;
  update linkedin_contas
     set automatico = p_ligar,
         rampa_inicio = case when p_ligar then current_date else rampa_inicio end,
         proximo_envio_em = null,
         motor_motivo = case when p_ligar then null else 'desligado por ' || coalesce((select nome_completo from profiles where id = auth.uid()), 'administrador') end,
         atualizado_em = now()
   where id = p_conta_id and (not p_ligar or situacao = 'conectada');
  if not found then raise exception 'conta_nao_conectada'; end if;
end;
$$;
revoke all on function public.linkedin_motor_ligar(uuid, boolean) from public, anon;
grant execute on function public.linkedin_motor_ligar(uuid, boolean) to authenticated;

-- A cada 10 min em dias úteis, 8h-18h de Brasília (11-21 UTC). A edge decide se é hora de enviar.
select cron.unschedule(jobname) from cron.job where jobname = 'linkedin-motor';
select cron.schedule('linkedin-motor', '*/10 11-20 * * 1-5', $$
  select net.http_post(
    url := 'https://zupsbgtoeoixfokzkjro.supabase.co/functions/v1/unipile-motor',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'sigzap_outbox_worker_service_role' limit 1)),
    body := '{"action":"rodar"}'::jsonb, timeout_milliseconds := 60000);
$$);
