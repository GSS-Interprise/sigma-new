-- Pré-requisito do Módulo Financeiro (07/07): a escrita em financeiro_pagamentos
-- era admin-only (policy "Admins can manage pagamentos"), então a Mavi (gestor_
-- financeiro) e os sócios (diretoria) não conseguiam conferir/atualizar. Adiciona
-- policy por papel. Leitura já é liberada a qualquer autenticado.
drop policy if exists "Financeiro roles can manage pagamentos" on public.financeiro_pagamentos;
create policy "Financeiro roles can manage pagamentos"
on public.financeiro_pagamentos
for all
to authenticated
using (
  public.has_role(auth.uid(), 'gestor_financeiro'::app_role)
  or public.has_role(auth.uid(), 'diretoria'::app_role)
)
with check (
  public.has_role(auth.uid(), 'gestor_financeiro'::app_role)
  or public.has_role(auth.uid(), 'diretoria'::app_role)
);
