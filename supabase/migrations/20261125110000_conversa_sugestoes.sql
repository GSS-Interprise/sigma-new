-- "Sugerir resposta" na tela Conversas (pedido do Heron, reunião 24/11/2026): a IA lê a conversa e deixa o texto
-- pronto na caixa; a pessoa revisa e envia pelo Sigma. Edge: supabase/functions/conversa-sugerir-resposta.

-- 1) Portão de LGPD: em quais tipos de número (whatsapp_chakra_connections.uso) a IA pode ler a conversa.
-- Começa só em prospecção, porque essas conversas já são lidas pela IA da campanha. Escalas, clientes, financeiro e
-- pessoal esperam o ok de LGPD da GSS. Valor = array JSON em texto (padrão chave/valor de supabase_config).
insert into public.supabase_config (chave, valor)
select 'sugestao_resposta_usos', '["prospeccao"]'
where not exists (select 1 from public.supabase_config where chave = 'sugestao_resposta_usos');

-- 2) Medição: quantas sugestões viram mensagem e quantas saem sem edição ("o Danilo só dá um enter").
create table if not exists public.conversa_sugestoes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sigzap_conversations(id) on delete cascade,
  user_id uuid not null,
  tipo text not null default 'texto' check (tipo in ('texto', 'modelo')),
  texto_sugerido text not null,
  template_id uuid,
  modelo_ia text,
  texto_enviado text,
  enviado_sem_edicao boolean,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists conversa_sugestoes_conversa_idx on public.conversa_sugestoes (conversation_id, created_at desc);
create index if not exists conversa_sugestoes_user_idx on public.conversa_sugestoes (user_id, created_at desc);

-- Tabela criada por SQL não ganha GRANT padrão: sem isto a edge e a tela quebram com 42501 (incidente 18/05).
grant select on public.conversa_sugestoes to authenticated;
-- A tela só registra o envio (o que foi mandado e se saiu igual); a sugestão em si quem grava é a edge.
grant update (texto_enviado, enviado_sem_edicao, sent_at) on public.conversa_sugestoes to authenticated;
grant all on public.conversa_sugestoes to service_role;

alter table public.conversa_sugestoes enable row level security;

drop policy if exists conversa_sugestoes_ler on public.conversa_sugestoes;
create policy conversa_sugestoes_ler on public.conversa_sugestoes for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()));

-- Só a própria pessoa marca o envio, e uma vez só (sent_at nulo): a medição não pode ser reescrita depois.
drop policy if exists conversa_sugestoes_marcar_envio on public.conversa_sugestoes;
create policy conversa_sugestoes_marcar_envio on public.conversa_sugestoes for update to authenticated
  using (user_id = auth.uid() and sent_at is null)
  with check (user_id = auth.uid());

-- 3) Motor: primeiro o Claude da GSS (Hermes na VPS, rotina ia_claude_sugerir_resposta), Gemini de reserva
-- (Raul, 25/11; docs/arquitetura/motor-ia-hermes-claude.md). Guarda qual dos dois respondeu cada sugestão.
alter table public.conversa_sugestoes add column if not exists motor text check (motor in ('claude', 'gemini'));

-- rotina_pedir aceita o tipo novo. O resto é igual ao de 20261117160000.
create or replace function public.rotina_pedir(p_tipo text, p_payload jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'authentication_required';
  end if;
  if p_tipo not in ('ping', 'lifeshub_lista', 'drescala_escalas',
                    'ia_claude_situacao', 'ia_claude_login', 'ia_claude_codigo', 'ia_claude_teste', 'ia_claude_sair',
                    'ia_claude_assistente_campanha', 'ia_claude_sugerir_resposta') then
    raise exception 'rotina_desconhecida: %', p_tipo;
  end if;
  if p_tipo like 'ia\_claude\_%' and auth.uid() is not null and not public.is_admin(auth.uid()) then
    raise exception 'so_administrador';
  end if;
  insert into rotina_pedidos (tipo, payload) values (p_tipo, coalesce(p_payload, '{}'::jsonb)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.rotina_pedir(text, jsonb) from public, anon;
grant execute on function public.rotina_pedir(text, jsonb) to authenticated, service_role;

-- O pedido da sugestão leva a conversa com o médico (LGPD). A fila rotina_pedidos é legível por qualquer usuário
-- logado, então: (a) esse tipo some da leitura da tela (só a edge, com service_role, lê); (b) o payload é apagado
-- quando o worker conclui, como já acontecia com o código do login. A edge também limpa o resultado depois de ler.
create or replace function public.rotina_concluir(p_id uuid, p_ok boolean, p_resultado jsonb, p_erro text)
returns void
language sql
security definer
set search_path = public
as $$
  update rotina_pedidos
     set status = case when p_ok then 'feito' else 'erro' end,
         resultado = p_resultado, erro = left(p_erro, 2000), concluido_em = now(),
         payload = case when tipo in ('ia_claude_codigo', 'ia_claude_sugerir_resposta') then '{}'::jsonb else payload end
   where id = p_id and status = 'executando';
$$;

drop policy if exists rotina_pedidos_ler on public.rotina_pedidos;
create policy rotina_pedidos_ler on public.rotina_pedidos for select to authenticated
  using (tipo <> 'ia_claude_sugerir_resposta');
