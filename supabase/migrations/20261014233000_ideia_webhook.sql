-- T11 do plano licitacoes-contratos-gss.md (14/10): assinatura do Ideia Signer chega ao Sigma.
-- A organização GSS no Ideia tem Integração → Webhooks (URL + autenticação, sem escolha de evento).
-- A edge ideia-webhook guarda TODO aviso recebido aqui (o formato do Ideia só é conhecido depois do
-- primeiro documento de teste), casa o signatário com o médico/lead por CPF ou e-mail e avisa quem
-- converteu. O gatilho que importa é o médico assinar (a GSS assina depois e pode cancelar).
create table if not exists public.ideia_eventos (
  id uuid primary key default gen_random_uuid(),
  recebido_em timestamptz not null default now(),
  evento text,
  documento text,
  signatario_nome text,
  signatario_email text,
  signatario_cpf text,
  assinatura_medico boolean not null default false,
  medico_id uuid references public.medicos(id) on delete set null,
  lead_id uuid,
  avisados uuid[] not null default '{}',
  payload jsonb,
  erro text
);
create index if not exists idx_ideia_eventos_recebido on public.ideia_eventos (recebido_em desc);
alter table public.ideia_eventos enable row level security;
drop policy if exists "Admin e contratos veem eventos do Ideia" on public.ideia_eventos;
create policy "Admin e contratos veem eventos do Ideia" on public.ideia_eventos for select to authenticated
  using (is_admin(auth.uid()) or has_role(auth.uid(), 'gestor_contratos'::app_role));
grant select on public.ideia_eventos to authenticated;
grant all on public.ideia_eventos to service_role;

-- chave do webhook: gerada aqui, guardada só na tabela de segredos (lida pelo servidor), nunca no código
insert into public.integracao_segredos (nome, valor, atualizado_em)
values ('ideia_webhook_key', encode(gen_random_bytes(24), 'hex'), now())
on conflict (nome) do nothing;
