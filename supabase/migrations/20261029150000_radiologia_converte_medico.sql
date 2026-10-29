-- Gestor de radiologia (ex.: Wagner) converte lead de radiologista em médico pelo prontuário.
-- Antes só admin, captação e contratos podiam gravar em medicos e medico_kanban_cards, e a
-- conversão parava com "new row violates row-level security policy for table medicos" (29/10).
-- Libera criar e vincular, sem apagar: as políticas de ALL das outras áreas continuam como estão.

create policy "Gestor radiologia cria medicos" on public.medicos
  for insert to authenticated
  with check (has_role(auth.uid(), 'gestor_radiologia'::app_role));

create policy "Gestor radiologia atualiza medicos" on public.medicos
  for update to authenticated
  using (has_role(auth.uid(), 'gestor_radiologia'::app_role))
  with check (has_role(auth.uid(), 'gestor_radiologia'::app_role));

-- a conversão consulta o card antes de criar; sem leitura criaria card duplicado
create policy "Gestor radiologia ve cards de medicos" on public.medico_kanban_cards
  for select to authenticated
  using (has_role(auth.uid(), 'gestor_radiologia'::app_role));

create policy "Gestor radiologia cria cards de medicos" on public.medico_kanban_cards
  for insert to authenticated
  with check (has_role(auth.uid(), 'gestor_radiologia'::app_role));
