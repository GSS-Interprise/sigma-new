-- Wagner (gestor de radiologia, 30/10) abria "Editar Proposta" e via "Este contrato não possui itens
-- cadastrados": a radiologia não lia contrato_itens. Em 14/10 ela ganhou só criar proposta; ao salvar
-- uma edição, o update da proposta e o delete dos itens antigos passavam sem efeito (RLS filtra sem
-- erro) e os itens novos se somavam aos antigos. Libera ler itens do contrato e editar a proposta e
-- seus itens. Apagar a proposta inteira continua só com admin, captação e contratos.

drop policy if exists "Gestor de radiologia ve itens do contrato" on public.contrato_itens;
create policy "Gestor de radiologia ve itens do contrato" on public.contrato_itens for select to authenticated
  using (has_role(auth.uid(), 'gestor_radiologia'::app_role));

drop policy if exists "Gestor de radiologia edita proposta" on public.proposta;
create policy "Gestor de radiologia edita proposta" on public.proposta for update to authenticated
  using (has_role(auth.uid(), 'gestor_radiologia'::app_role))
  with check (has_role(auth.uid(), 'gestor_radiologia'::app_role));

drop policy if exists "Gestor de radiologia edita itens de proposta" on public.proposta_itens;
create policy "Gestor de radiologia edita itens de proposta" on public.proposta_itens for update to authenticated
  using (has_role(auth.uid(), 'gestor_radiologia'::app_role))
  with check (has_role(auth.uid(), 'gestor_radiologia'::app_role));

-- a edição troca os itens: apaga os antigos e grava os novos
drop policy if exists "Gestor de radiologia troca itens de proposta" on public.proposta_itens;
create policy "Gestor de radiologia troca itens de proposta" on public.proposta_itens for delete to authenticated
  using (has_role(auth.uid(), 'gestor_radiologia'::app_role));
