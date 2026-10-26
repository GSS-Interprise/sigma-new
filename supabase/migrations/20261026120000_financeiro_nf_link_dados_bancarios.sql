-- Link público da nota para o lançamento no Conta Azul e dados bancários lidos da nota (26/10/2026).
-- A API do Conta Azul não aceita anexo: a observação do lançamento leva um link que abre só a nota daquele
-- pagamento, sem login, para a contabilidade baixar. O token é longo e aleatório; o link resolve a nota
-- vigente na hora do acesso, então serve também para lançamento feito SEM NF.
-- nf_dados_bancarios: banco, agência, conta e Pix que o médico escreveu na nota (lidos pela IA).
alter table public.financeiro_pagamentos
  add column if not exists nf_link_token text,
  add column if not exists nf_dados_bancarios jsonb;
create unique index if not exists financeiro_pagamentos_nf_link_token_key
  on public.financeiro_pagamentos (nf_link_token) where nf_link_token is not null;
