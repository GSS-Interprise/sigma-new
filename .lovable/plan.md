## Objetivo
Criar dois novos perfis no sistema — **Licitador** e **Líder Licitação** — com acessos restritos ao fluxo de licitações.

## Matriz de acesso

| Recurso | Licitador | Líder Licitação |
|---|---|---|
| Home | ✅ | ✅ |
| Licitações (kanban + detalhe) | ✅ ler/criar/editar | ✅ ler/criar/editar |
| Botão "Gerenciar Status" (Kanban) | ❌ | ✅ ver/editar status existentes — **sem** criar novo status |
| Contratos → aba **Rascunhos (Licitações)** | ✅ somente leitura | ✅ somente leitura |
| Contratos → demais abas (Contratos, Dr. Escala, Dr. Oportunidade, Clientes) | ❌ | ❌ |
| BI → aba **Licitações** | ✅ | ✅ |
| BI → demais abas | ❌ | ❌ |
| Comunicação | ✅ | ✅ |
| Suporte (abrir ticket) | ✅ | ✅ |

## Mudanças

### 1. Banco (migration)
- `ALTER TYPE public.app_role ADD VALUE 'licitador'` e `'lider_licitacao'`.
- Inserir linhas em `public.permissoes` para os dois perfis nos módulos: `licitacoes` (visualizar/criar/editar para ambos), `contratos` (somente `visualizar`), `bi` (visualizar), `comunicacao` (visualizar/criar), `suporte` (visualizar/criar). Home não exige permissão.
- Revisar RLS de `licitacoes`, `licitacao_itens`, `licitacoes_anexos`, `licitacoes_atividades`, `licitacao_descartes`, `licitacao_resultados`, `contrato_rascunho`, `kanban_status_config` para incluir os dois novos roles onde fizer sentido (rascunho = SELECT-only; kanban_status_config = SELECT para ambos + UPDATE só para `lider_licitacao`/admin; INSERT/DELETE continua só admin).

### 2. Frontend — labels e tipos
- `src/lib/roleLabels.ts`: adicionar `licitador: "Licitador"` e `lider_licitacao: "Líder de Licitação"`.
- `src/hooks/usePermissions.ts`: nenhuma mudança no tipo `Modulo` (já cobre `licitacoes`, `contratos`, `bi`, `comunicacao`, `suporte`).

### 3. Sidebar (`src/components/layout/Sidebar.tsx`)
- Itens já são filtrados por `hasPermission(modulo, 'visualizar')`. Como inseriremos as permissões no banco, os dois roles passarão a ver apenas: Home, Licitações, Clientes e Contratos, BI, Comunicação, Suporte. Verificar item "Clientes e Contratos" — não deve aparecer para esses perfis. Solução: trocar o `modulo: "contratos"` do item por uma checagem extra `hideForRoles: ['licitador','lider_licitacao']`, ou criar um módulo novo `contratos_full` e usar `contratos` apenas para acesso à aba de rascunhos. Decisão: manter `modulo: "contratos"` (eles precisam navegar até lá) e esconder o item da sidebar via flag adicional `hideForRoles`. Sidebar mostrará apenas o necessário.

### 4. Página Contratos (`src/pages/Contratos.tsx`)
- Detectar `userRoles` em `usePermissions`. Para `licitador` / `lider_licitacao` (e que não sejam admin):
  - Renderizar apenas a `TabsTrigger` "Rascunhos (Licitações)" e respectivo `TabsContent`.
  - Forçar `activeTab = "rascunhos"`.
  - Esconder botão "Novo Contrato".
- Passar prop `readOnly` para `ContratosRascunhoTab` que desabilita ações de mutação (consolidar/vincular/excluir). Revisar `ContratosRascunhoTab` e componentes filhos para respeitar `readOnly`.

### 5. Página BI (`src/pages/BI.tsx`)
- Para `licitador`/`lider_licitacao` sem admin: renderizar somente a aba `licitacoes` (esconder demais `TabsTrigger` e fixar a aba inicial).

### 6. Kanban Status (`src/components/licitacoes/KanbanStatusManager.tsx` e `src/pages/Licitacoes.tsx`)
- Hoje o botão só aparece se `isAdmin`. Alterar para aparecer também se `isLiderLicitacao`.
- Dentro do `KanbanStatusManager`, em modo "lider_licitacao": esconder botão "Novo Status" e ação de excluir; permitir apenas edição de status existentes (nome, cor, ordem). RLS reforça no banco.

### 7. Permissões captação
- Garantir que `useCaptacaoPermissions`/`hasAnyCaptacaoAccess` retorne `false` para esses perfis (eles não devem ver "Prospecção"). Como nenhuma permissão captação será concedida, nada precisa mudar.

## Validação
- Logar com um usuário em cada novo perfil (via UI de gestão de usuários) e conferir: itens da sidebar, aba única em Contratos (read only), aba única em BI, presença/ausência do botão "Gerenciar Status" e da ação "Novo Status" no kanban.
