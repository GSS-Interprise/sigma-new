-- O Chakra entrega o mesmo evento por dois webhooks (pass-through e Chakra) quase ao mesmo
-- tempo. As duas chamadas passavam pela checagem do inbox antes de qualquer uma gravar e o
-- médico recebia "Nota fiscal recebida" duas vezes (Amni, 27/10). A primeira que gravar aqui
-- processa; a outra é ignorada.
create table if not exists public.financeiro_nf_inbound_claims (
  mensagem_id text primary key,
  criado_em timestamptz not null default now()
);

alter table public.financeiro_nf_inbound_claims enable row level security;

grant all on public.financeiro_nf_inbound_claims to service_role;
