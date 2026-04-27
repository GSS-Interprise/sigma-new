# Hub de Demandas e Tarefas por Setor

Reformular a página `/demandas` em uma central moderna de 4 colunas, com **isolamento estrito por setor** e suporte a anexos, prints, e marcação de leads / licitações / contratos / conversas SigZap.

## Visão Geral

Layout em 4 colunas paralelas, header com seletor de escopo (Meu Setor / Geral) e busca rápida.

```text
┌─────────────────────────────────────────────────────────────────────┐
│  Demandas — [Setor: Licitações]   [+ Nova]   busca…   filtros       │
├─────────────┬─────────────┬─────────────┬───────────────────────────┤
│ 1) Agenda   │ 2) Demandas │ 3) Para Mim │ 4) Pendências do Setor    │
│  Calendário │  Enviadas   │  Atribuídas │  (auto, por módulo)       │
│  c/ prazos  │  a outros   │  a mim      │  Leads abertos, contratos │
│  vencidos   │  setores    │             │  vencendo, licitações…    │
│  em vermelho│             │             │                           │
└─────────────┴─────────────┴─────────────┴───────────────────────────┘
```

## Regras de Isolamento por Setor

- Cada usuário só vê tarefas onde `setor_destino = seu_setor` **OU** `escopo = 'geral'` **OU** é o `created_by` / `responsavel_id`.
- Ao anexar referência (licitação, contrato, conversa SigZap, lead), a tarefa carrega o `setor_destino`. Se o destinatário não pertence ao setor que tem acesso àquele recurso, o anexo **não é renderizado** para ele (e o autocomplete nem oferece esse tipo de referência ao criar a demanda para outro setor sem permissão).
- Mapeamento setor → módulos visíveis (referências permitidas):
  - Licitações → licitações, leads
  - Contratos → contratos, leads
  - Prospecção e Captação → leads, conversas SigZap, campanhas
  - Radiologia → contratos, escalas
  - Escalas → escalas, contratos
  - Financeiro → contratos
  - Marketing → campanhas, SigZap, leads
  - Direção / TI / AGES → todos
- Admin sempre vê tudo.

## Coluna 1 — Agenda (Calendário)

- Mini calendário mensal + lista do dia selecionado.
- Cria tarefa com data/hora limite.
- Dias com tarefas atrasadas → ponto vermelho; entregues no prazo → verde.
- Drag para mover entre datas.

## Coluna 2 — Demandas Enviadas

- Lista das tarefas que **eu criei para outros setores ou pessoas**.
- Form de "Nova Demanda":
  - Setor destino (obrigatório) + pessoas marcadas (opcional, multi-select)
  - Tipo: arquivo, esclarecimento, tarefa
  - Urgência: baixa / média / alta / crítica (chips coloridos)
  - Anexos: upload de arquivos, **paste de print** direto (Ctrl+V no textarea)
  - Referências (autocomplete filtrado por permissão do destinatário): Licitação, Contrato, Lead, Conversa SigZap
- Status visíveis: aberta / em andamento / aguardando / concluída.

## Coluna 3 — Atribuídas a Mim

- Tarefas onde `responsavel_id = auth.uid()` ou estou marcado em `mencionados[]`.
- Ações rápidas: aceitar, marcar concluída, comentar, reatribuir.
- Badge de urgência + tempo aberto.

## Coluna 4 — Pendências do Setor (automáticas)

Cards gerados dinamicamente por views, **não** são tarefas reais. Por setor:

- **Prospecção**: leads em aberto há > N dias sem follow-up.
- **Contratos**: contratos vencendo nos próximos 90 dias.
- **Licitações**: licitações com prazo de envio < 7 dias sem responsável.
- **Radiologia**: ajustes de laudo pendentes.
- **Financeiro**: contas a pagar atrasadas.
- **Escalas**: escalas em aberto da próxima semana.

Clique no card → abre o registro original em nova aba.

## Apelo Visual

- Cards com glass effect sutil, bordas em accent por urgência.
- Header sticky com chips de filtro (Hoje, Atrasadas, Alta urgência).
- Avatares empilhados para mencionados.
- Animação suave de drag entre colunas/datas.
- Cores semânticas: vermelho (atrasado), âmbar (urgente), verde (ok).

## Detalhes Técnicos

### Banco

Migração para estender `worklist_tarefas` e criar tabelas auxiliares:

```sql
ALTER TABLE worklist_tarefas
  ADD COLUMN setor_destino_id uuid REFERENCES setores(id),
  ADD COLUMN setor_origem_id uuid REFERENCES setores(id),
  ADD COLUMN escopo text NOT NULL DEFAULT 'setor', -- 'setor' | 'geral'
  ADD COLUMN urgencia text NOT NULL DEFAULT 'media',
  ADD COLUMN tipo text NOT NULL DEFAULT 'tarefa', -- tarefa|arquivo|esclarecimento
  ADD COLUMN concluida_em timestamptz,
  ADD COLUMN lead_id uuid,
  ADD COLUMN sigzap_conversation_id uuid;

CREATE TABLE worklist_tarefa_mencionados (
  tarefa_id uuid REFERENCES worklist_tarefas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  PRIMARY KEY (tarefa_id, user_id)
);

CREATE TABLE worklist_tarefa_anexos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid REFERENCES worklist_tarefas(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text,
  nome text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE worklist_tarefa_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id uuid REFERENCES worklist_tarefas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  conteudo text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

Bucket de storage `worklist-anexos` (privado) com RLS por tarefa.

### RLS (substituir policies atuais)

- SELECT: `created_by = auth.uid()` OR `responsavel_id = auth.uid()` OR está em `worklist_tarefa_mencionados` OR (`setor_destino_id = user_setor()` AND escopo='setor') OR escopo='geral' OR `is_admin()`.
- Função `user_setor(uuid)` SECURITY DEFINER já implícita via `profiles.setor_id`.

### Pendências (Coluna 4)

View `vw_worklist_pendencias_setor` unindo:
- `captacao_leads` (status aberto, idade)
- `contratos` (data_fim entre now e now+90d)
- `licitacoes` (prazo próximo)
- etc.
Coluna `setor_id` para filtrar.

### Frontend

- `src/pages/Demandas.tsx` — layout 4 colunas, header com filtros.
- `src/components/demandas/ColunaAgenda.tsx` — calendário (shadcn Calendar) + lista.
- `src/components/demandas/ColunaEnviadas.tsx`
- `src/components/demandas/ColunaParaMim.tsx`
- `src/components/demandas/ColunaPendenciasSetor.tsx`
- `src/components/demandas/NovaDemandaDialog.tsx` — form com paste de print, anexos, autocomplete de referências filtrado por setor destino.
- `src/components/demandas/TarefaCard.tsx` — card unificado com badges de urgência, referências, mencionados, anexos.
- `src/components/demandas/ReferenciaPicker.tsx` — combobox que consulta licitações/contratos/leads/conversas conforme permissão do setor destino.
- `src/hooks/useDemandas.ts`, `useDemandaPendencias.ts`, `useSetorAccess.ts`.
- Reusa `useUserSetor`, `usePermissions`.

### Paste de Print

Listener `onPaste` no textarea do diálogo capturando `clipboardData.items` com `type` começando em `image/`, fazendo upload para `worklist-anexos` e adicionando como anexo.

### Notificações

Trigger `AFTER INSERT` em `worklist_tarefas` e em `worklist_tarefa_mencionados` cria registro em `notificacoes` para cada destinatário (responsável + mencionados), aproveitando `useNotificationSystem`.

## Entregáveis

1. Migração SQL (schema + RLS + view de pendências + bucket).
2. Página Demandas reescrita com 4 colunas.
3. Componentes de coluna, dialog, card, picker.
4. Hooks e isolamento por setor.
5. Integração com sino de notificações existente.
