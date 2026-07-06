-- T01 Módulo Financeiro (05/07): liga o pagamento ao médico real (FK) e adiciona os
-- campos do novo fluxo (conferência → NF → aprovação → comprovante). Tabela está
-- vazia hoje, então não há backfill — o casamento por CRM acontece no import (T02).
alter table public.financeiro_pagamentos
  add column if not exists medico_id uuid references public.medicos(id) on delete set null,
  add column if not exists conferido_por uuid,
  add column if not exists conferido_em timestamptz,
  add column if not exists nf_status text not null default 'nao_solicitada',   -- nao_solicitada | solicitada | recebida
  add column if not exists nf_solicitada_em timestamptz,
  add column if not exists aprovado_por uuid,
  add column if not exists aprovado_em timestamptz,
  add column if not exists comprovante_status text not null default 'pendente'; -- pendente | enviado

create index if not exists idx_fin_pag_medico on public.financeiro_pagamentos (medico_id);
create index if not exists idx_fin_pag_competencia on public.financeiro_pagamentos (ano_referencia, mes_referencia);

grant select, insert, update, delete on public.financeiro_pagamentos to authenticated, service_role;

comment on column public.financeiro_pagamentos.medico_id is 'FK real ao medico (medicos.id); casado por CRM no import. Fallback: profissional_crm.';
comment on column public.financeiro_pagamentos.nf_status is 'nao_solicitada | solicitada | recebida';
comment on column public.financeiro_pagamentos.comprovante_status is 'pendente | enviado';
