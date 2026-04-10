

## Plano: Restringir visualização de "quem viu" a admins/líderes

### Resumo
- O **badge de notificação** na aba Histórico continua funcionando para **todos** os usuários
- O **"quem visualizou" (read receipts com CheckCheck)** nos cards só aparece para **admins e líderes**
- A lógica de marcar como visto após 2s e limpar badge permanece igual para todos

### Alterações

#### 1. Migração SQL — Restringir SELECT da tabela `lead_historico_visualizacoes`
Trocar a policy atual (todos authenticated podem ler tudo) por uma que permita:
- Cada usuário ler **seus próprios** registros (necessário para o cálculo do badge)
- Admins e líderes lerem **todos** os registros (necessário para ver quem visualizou)

```sql
DROP POLICY "Authenticated users can view visualizacoes" ON public.lead_historico_visualizacoes;

CREATE POLICY "Users read own or admin/leader reads all"
ON public.lead_historico_visualizacoes
FOR SELECT TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_admin(auth.uid())
  OR public.is_leader(auth.uid())
);
```

#### 2. UI — Condicionar exibição dos read receipts
No `LeadHistoricoAnotacoesSection.tsx`:
- Importar `usePermissions`
- Extrair `isAdmin` e `isLeader`
- Envolver o bloco de read receipts (linhas ~918-938) em `if (isAdmin || isLeader)`
- O fetch de `visualizacoes` completo só precisa rodar para admin/líder; para outros usuários, pular a query (pois o RLS já filtra, mas evita request desnecessário)

#### 3. Escopo
- 1 migração SQL (drop + create policy)
- 1 arquivo editado (`LeadHistoricoAnotacoesSection.tsx`)
- Hook `useLeadHistoricoUnreadCount` não muda (já lê só os próprios registros do usuário)

