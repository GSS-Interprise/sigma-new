## Melhorias no módulo Demandas

### 1. Controle de quem pode finalizar a demanda

**Hoje:** qualquer responsável ou mencionado pode marcar como concluída.
**Novo comportamento:** apenas o **criador** e os usuários escolhidos como **finalizadores** podem mudar o status para "concluída". Os demais envolvidos (mencionados) continuam podendo comentar, anexar, marcar checklist, etc.

**Banco**
- Nova tabela `worklist_tarefa_finalizadores (tarefa_id, user_id)` com GRANTs + RLS (leitura para envolvidos, escrita para criador/admin).
- Função `pode_finalizar_demanda(tarefa_id, user_id)` (SECURITY DEFINER) → true se for `created_by`, admin, ou estiver em `worklist_tarefa_finalizadores`. Por padrão o `responsavel_id` é incluído automaticamente como finalizador.
- Trigger `BEFORE UPDATE` em `worklist_tarefas` que bloqueia mudança de `status` para `concluida` quando o usuário corrente não pode finalizar.

**UI**
- `NovaDemandaDialog`: novo campo "Quem pode finalizar?" (multi-select com base no responsável + mencionados). O criador é sempre incluído implícito.
- `CardActionsMenu` / botão Concluir: só aparece se `pode_finalizar` true.

### 2. Pendências do setor por setor do usuário + filtro

- `ColunaPendenciasSetor` hoje já passa o `setorId` do usuário. Reforçar: **não-admin sempre é filtrado pelo seu próprio setor**, sem possibilidade de trocar.
- **Admins:** novo `<Select>` no topo da coluna com opções "Todos os setores" (padrão) + lista de setores. O filtro é aplicado client-side no `usePendenciasSetor`.
- Atualizar `usePendenciasSetor` para aceitar `setorIdOverride` opcional (usado só por admin).

### 3. Alertas e notificações

**a) In-app (alertas mais agressivos)**
- Cards de demandas em atraso na `ColunaMinhasTarefas`, `ColunaAgenda` e `KanbanTarefas` ganham:
  - borda esquerda vermelha pulsante
  - badge "ATRASADA" vermelho
  - data em vermelho-escuro com ícone de alerta
- Sino de notificações: criar uma notif persistente por dia para cada demanda atrasada do usuário (sem duplicar).

**b) E-mail automático (digest, não 1 por demanda)**
- Nova Edge Function `demandas-deadline-alerter` (cron diário 8h).
- Lógica:
  - Busca todas as demandas não concluídas com `data_limite` ∈ [hoje, hoje+2 dias] **OU** `data_limite < hoje` (atrasadas).
  - Para cada usuário envolvido (criador, responsável, finalizadores, mencionados) agrupa as demandas dele.
  - Envia **1 único e-mail por usuário** listando todas as demandas, separando "Vence hoje", "Vence em 1 dia", "Vence em 2 dias" e "Atrasadas".
- Idempotência: tabela `demanda_alert_log (user_id, data, tipo)` com unique constraint para garantir 1 envio por usuário por dia.
- Usar Lovable Emails (já configurado no projeto, se existir) com template novo `demandas-prazo-digest.tsx`. Se o domínio de email ainda não estiver configurado, peço para configurar primeiro.
- Cron via `pg_cron` chamando a edge function todo dia às 8h America/Sao_Paulo.

### 4. Destaque visual para demandas onde sou finalizador

- Cards em `TarefaCard`, `ColunaMinhasTarefas`, `KanbanTarefas`:
  - Quando o usuário corrente é finalizador → fundo levemente avermelhado / borda mais forte + badge "Você finaliza".
- Calendário (`ColunaAgenda`): dia com demandas onde sou finalizador ganha bullet/realce vermelho mais intenso; dia atrasado fica vermelho saturado.

### Detalhes técnicos
- Reaproveitar `system_notifications` para alertas in-app.
- Reaproveitar `setores` para o select de admin.
- Garantir que o trigger SQL retorne mensagem clara ("Apenas o criador e finalizadores podem concluir") para o toast da UI mapear.
- Backfill: para demandas existentes, `responsavel_id` (quando existir) entra como finalizador único; sem responsável, só o criador finaliza.

### Pontos de confirmação antes de implementar
1. Ok confirmar que o **criador sempre pode finalizar** (sem checkbox)?
2. O e-mail digest deve ir para **todos os envolvidos** (criador + responsável + finalizadores + mencionados) ou só para **criador + finalizadores**?
3. Pode usar Lovable Emails como provedor? (Se já houver domínio configurado, plug-and-play; senão preciso pedir para configurar.)
