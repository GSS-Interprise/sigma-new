-- Correção da análise de edital pela equipe (Gustavo, licitações GSS, 18/11): a IA leu errado dados de uma
-- licitação (DL 10146950) e a equipe quer corrigir o texto da análise, com o que ela escreveu grifado.
-- O texto original da IA fica em `html` (auditoria e "ver original"); a versão corrigida vai em `html_editado`,
-- com os trechos escritos pela equipe dentro de <mark class="edicao-equipe">.
alter table public.licitacao_analises add column if not exists html_editado text;
alter table public.licitacao_analises add column if not exists editado_por uuid references auth.users(id);
alter table public.licitacao_analises add column if not exists editado_em timestamptz;

-- A tabela só tem política de leitura (a IA grava pelo service_role). A correção passa por esta função, que
-- grava só as três colunas da edição e quem editou; null volta para o texto da IA.
create or replace function public.licitacao_analise_salvar_edicao(p_analise_id uuid, p_html text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'sem_login';
  end if;
  update public.licitacao_analises
     set html_editado = nullif(btrim(p_html), ''),
         editado_por = case when nullif(btrim(p_html), '') is null then null else auth.uid() end,
         editado_em = case when nullif(btrim(p_html), '') is null then null else now() end
   where id = p_analise_id and status = 'pronta';
  if not found then
    raise exception 'analise_nao_encontrada';
  end if;
end;
$$;

revoke all on function public.licitacao_analise_salvar_edicao(uuid, text) from public, anon;
grant execute on function public.licitacao_analise_salvar_edicao(uuid, text) to authenticated, service_role;
