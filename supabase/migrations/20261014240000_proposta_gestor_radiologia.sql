-- Danilo e Brenda (gestores de radiologia, 13–14/10) não conseguiam "Vincular proposta existente" ao
-- cadastrar médico: vincular clona a proposta para o lead (insert em proposta e proposta_itens) e o
-- RLS só deixava admin, captação e contratos. Libera só a CRIAÇÃO para gestor_radiologia; editar e
-- apagar proposta continuam com quem já podia.
drop policy if exists "Gestor de radiologia cria proposta" on public.proposta;
create policy "Gestor de radiologia cria proposta" on public.proposta for insert to authenticated
  with check (has_role(auth.uid(), 'gestor_radiologia'::app_role));
drop policy if exists "Gestor de radiologia cria itens de proposta" on public.proposta_itens;
create policy "Gestor de radiologia cria itens de proposta" on public.proposta_itens for insert to authenticated
  with check (has_role(auth.uid(), 'gestor_radiologia'::app_role));
