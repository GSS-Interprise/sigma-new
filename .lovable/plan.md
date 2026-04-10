

## Plano: Alterar regra do campo "Responsável" em Licitações

### Situação atual
O hook `useLicitacoesProfiles` filtra por `setor_id` (setores Licitações e AGES). Isso é frágil — depende do setor do perfil, não da role do usuário.

### Nova regra
Mostrar no select de "Responsável" qualquer usuário que tenha a role **`gestor_ages`** e/ou **`gestor_contratos`** na tabela `user_roles`.

### Alteração

**Arquivo: `src/hooks/useLicitacoesProfiles.ts`**

Trocar a query atual (filtro por `setor_id`) por um join com `user_roles`:

1. Buscar todos os `user_id` da tabela `user_roles` onde `role` é `gestor_ages` ou `gestor_contratos`
2. Buscar os profiles correspondentes (id, nome_completo) ordenados por nome

Como o Supabase client não suporta join direto entre `user_roles` e `profiles`, faremos duas queries sequenciais:
- Query 1: `SELECT DISTINCT user_id FROM user_roles WHERE role IN ('gestor_ages', 'gestor_contratos')`
- Query 2: `SELECT id, nome_completo FROM profiles WHERE id IN (...userIds) ORDER BY nome_completo`

Nenhuma alteração de banco de dados necessária — apenas mudança no frontend.

