-- T4 do plano licitacoes-contratos-gss.md (14/10): comentário editável pelo autor, sem prazo
-- (pedido da Bianca na reunião de 07/10: hoje errar uma palavra obriga a apagar e escrever de novo).
--
-- A tabela não tinha política de UPDATE nenhuma; por isso o "Marcar como respondido" também não
-- gravava (o RLS barrava sem erro, zero linhas). A política abre a linha para o autor, para quem
-- deve responder e para o admin; o gatilho garante que o TEXTO só muda pela mão do autor (ou admin).
alter table public.licitacoes_atividades add column if not exists editado_em timestamptz;

drop policy if exists "Autor, responsável e admin atualizam atividade" on public.licitacoes_atividades;
create policy "Autor, responsável e admin atualizam atividade" on public.licitacoes_atividades
  for update to authenticated
  using (auth.uid() = user_id or auth.uid() = responsavel_resposta_id or is_admin(auth.uid()))
  with check (auth.uid() = user_id or auth.uid() = responsavel_resposta_id or is_admin(auth.uid()));

create or replace function public.licitacao_atividade_edicao_trg()
returns trigger language plpgsql as $$
begin
  if new.descricao is distinct from old.descricao then
    if old.tipo <> 'comentario' then
      raise exception 'Só comentário pode ser editado';
    end if;
    -- service role (auth.uid() nulo) passa; pela tela, só o autor ou o admin
    if auth.uid() is not null and auth.uid() is distinct from old.user_id and not is_admin(auth.uid()) then
      raise exception 'Só quem escreveu o comentário pode editá-lo';
    end if;
    new.editado_em := now();
  end if;
  -- autoria e data não mudam
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.licitacao_id := old.licitacao_id;
  return new;
end $$;

drop trigger if exists trg_licitacao_atividade_edicao on public.licitacoes_atividades;
create trigger trg_licitacao_atividade_edicao before update on public.licitacoes_atividades
  for each row execute function public.licitacao_atividade_edicao_trg();

grant update on public.licitacoes_atividades to authenticated;
