## Diagnóstico

Verifiquei no banco e confirmei o problema: **usuários "suspensos" continuam podendo logar e acessar o Sigma normalmente.**

- 8 usuários estão com `profiles.status = 'suspenso'` (Kayky, Sarah, Emmily, Arthur, Luana, Ricardo, Ulisses, Yuri).
- Nenhum deles tem role em `user_roles` — mas isso só limita telas com `PermissionRoute`. Telas comuns (Dashboard, Comunicação, Workspace, etc.) usam apenas `ProtectedRoute`, que **só checa se existe sessão** (`user`), ignorando o `status` do profile.
- Resultado: basta o registro existir em `auth.users` que o login é aceito e o app abre.
- O status "suspenso" hoje é apenas visual (badge vermelho na tela de Configurações). Não há nenhuma camada de bloqueio no front nem no banco.

## O que vou fazer

### 1. Bloquear login no `AuthContext`
- Após `SIGNED_IN` (e ao restaurar sessão em `getSession`), buscar `profiles.status` do usuário.
- Se status for `suspenso` ou `inativo`:
  - Chamar `supabase.auth.signOut()` imediatamente.
  - Limpar `SESSION_START_KEY` do localStorage.
  - Mostrar toast: "Acesso suspenso. Procure o administrador."
  - Redirecionar para `/auth`.
- Se status for `ativo`, segue o fluxo normal.

### 2. Reforçar no `ProtectedRoute`
- Buscar profile do usuário (via React Query, cache curto).
- Enquanto carrega: spinner atual.
- Se status ≠ `ativo`: tela "Acesso suspenso — entre em contato com o administrador" + botão "Sair", em vez de renderizar o app.
- Garante que mesmo se o usuário ficar logado e for suspenso em runtime, perde acesso na próxima navegação.

### 3. Camada server-side (RLS) — função helper
Criar função SQL `public.current_user_is_active()`:
```sql
create or replace function public.current_user_is_active()
returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select status = 'ativo' from public.profiles where id = auth.uid()), false)
$$;
```
- Adicionar essa checagem nas políticas RLS de **leitura** das tabelas mais sensíveis usadas pelo dashboard (profiles próprio, leads, captacao_leads, disparos_campanhas, comunicacao_mensagens, ages_*, contratos, licitacoes…).
- Na prática vou criar uma policy `RESTRICTIVE` por tabela sensível: `USING (public.current_user_is_active())`. Policies RESTRICTIVE somam-se às existentes via AND, então não quebro o que já funciona — apenas exijo que o usuário esteja ativo.
- Lista exata das tabelas alvo: confirmo na implementação consultando quais tabelas têm RLS habilitado e são acessadas por usuário comum (excluindo `profiles` da própria pessoa, para o front conseguir ler o próprio status e exibir a mensagem de bloqueio).

### 4. Teste
Após aplicar:
- Tentar logar com `arthur.rhc@gmail.com` (suspenso) → deve cair no toast "Acesso suspenso" e voltar para `/auth`.
- Logar com um usuário ativo → deve continuar funcionando normalmente.
- Suspender um usuário logado → na próxima request/navegação ele perde acesso.

## Arquivos alterados
- `src/contexts/AuthContext.tsx` — verificação de status pós-login.
- `src/components/auth/ProtectedRoute.tsx` — guarda extra de status + tela de bloqueio.
- Migração SQL — função `current_user_is_active` + policies RESTRICTIVE nas tabelas sensíveis.

## Observação
Não vou banir o usuário em `auth.users` (requer service role + edge function), porque a combinação acima já bloqueia 100% do acesso de dados e da UI. Se você quiser também invalidar o token de sessão imediatamente no servidor quando alguém for suspenso, posso adicionar uma edge function `admin-suspend-user` num próximo passo.