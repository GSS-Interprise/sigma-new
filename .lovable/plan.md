## Objetivo

1. Permitir que usuários do setor **TI** transformem uma demanda em um ticket de suporte.
2. Suportar **múltiplos solicitantes** no ticket (espelhando os envolvidos da demanda).
3. Trazer os **comentários da demanda como histórico de comunicação** dentro do ticket.
4. Mudar regra de email: **não enviar a cada mensagem**. Enviar apenas quando o ticket entra em **"Aguardando confirmação"** e quando é **"Encerrado/Concluído"**.

---

## 1. Botão "Transformar em ticket" na demanda

- Adicionar item **"Transformar em ticket"** no menu de 3 pontinhos (`src/components/demandas/CardActionsMenu.tsx`) e no detalhe da demanda.
- O item só aparece para usuários cujo `setor` é TI/Tecnologia (mesma regra já usada em `TicketDetailDialog.tsx` para listar analistas: nome do setor `inclui "tecnologia"` ou é `"ti"`). Para os demais usuários a opção fica oculta.
- Como só TI vê a opção, o ticket é sempre **interno** (sem fornecedor externo).

## 2. Modal "Novo ticket" pré-preenchido

- Ao clicar em "Transformar em ticket", abrir o modal de novo ticket (reaproveitar `NovoTicketForm`) em modo "a partir de demanda".
- Pré-preencher:
  - `descricao` = **título** da demanda + quebra de linha + **conteúdo/descrição** da demanda.
  - `destino` = `interno` (travado).
  - `tipo` = padrão `software` (editável).
  - `solicitantes` (multi) = criador da demanda + finalizadores + mencionados + setor_destino (deduplicado), editável.
- Campos que o usuário TI precisa preencher no modal antes de criar:
  - **Nível de urgência** (`nivel_urgencia` já existe na tabela).
  - **Tipo de impacto** (`tipo_impacto` já existe).
  - **Tipo** (software/hardware).
  - Lista de solicitantes (chips removíveis + busca para adicionar).
- Ao confirmar:
  - Criar o `suporte_tickets` (solicitante principal = criador da demanda, demais vão para a nova tabela de solicitantes).
  - Copiar todos os comentários da demanda (`worklist_tarefa_comentarios`) para `suporte_comentarios` com `autor_id/nome` originais, prefixo `[Histórico da demanda]` na mensagem, mantendo a ordem cronológica.
  - Registrar no `historico` do ticket a origem (`demanda_id`, número/título).
  - Marcar a demanda com referência ao ticket criado (campo `tags` JSON: `{ ticket_id, ticket_numero }`) e mostrar no card da demanda um badge "Virou ticket #NNN" que abre o ticket.
  - Disparar email **somente** se o status inicial cair nas regras da seção 4 (no fluxo normal, o ticket nasce em `aberto` → **nenhum email** é enviado na criação).

## 3. Multi-solicitante no ticket

- Nova tabela `suporte_ticket_solicitantes` com `ticket_id`, `user_id`, `nome`, `email`, `is_principal`, timestamps.
- Migrar leitura/escrita:
  - `TicketDetailDialog`/`TicketCard`/`AbaEmails` passam a mostrar todos os solicitantes (chips). O "solicitante_nome/id" do ticket continua sendo o principal por compatibilidade.
  - Permissões: cada solicitante listado pode ver o ticket (ajuste nas policies de leitura de `suporte_tickets` e `suporte_comentarios`).
  - No modal de novo ticket, adicionar UI de seleção múltipla (autocomplete de profiles, chips removíveis).

## 4. Nova regra de emails

- Remover envios automáticos de email:
  - Na criação do ticket (remover `supabase.functions.invoke("send-support-email")` do `NovoTicketForm`).
  - A cada novo comentário (remover invocação de `notify-ticket-comment` em `TicketDetailDialog`).
- Centralizar o envio em um único trigger no front (e/ou hook server-side), disparando email **apenas** quando:
  - O status muda para **`aguardando_confirmacao`** → email "Seu ticket aguarda sua confirmação" para todos os solicitantes.
  - O status muda para **`concluido`** (encerrado) → email "Seu ticket foi encerrado" para todos os solicitantes.
- Reescrever templates da função `send-support-email` (ou criar `send-ticket-status-email`) com dois layouts: "aguardando confirmação" e "encerrado", listando todos os solicitantes no destinatário (To + CC) e incluindo número, título, descrição e link.
- O botão "Reenviar email" (`ResendEmailButton`) passa a reenviar o último email de status (não cria email novo por comentário).

---

## Detalhes técnicos

### Migration (Supabase)

```sql
-- multi solicitantes
CREATE TABLE public.suporte_ticket_solicitantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.suporte_tickets(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nome text,
  email text,
  is_principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suporte_ticket_solicitantes TO authenticated;
GRANT ALL ON public.suporte_ticket_solicitantes TO service_role;
ALTER TABLE public.suporte_ticket_solicitantes ENABLE ROW LEVEL SECURITY;

-- policies: solicitantes podem ler o seu próprio vínculo; TI e admins podem tudo
CREATE POLICY "Solicitante vê seu vínculo"
  ON public.suporte_ticket_solicitantes FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "TI/admin gerencia"
  ON public.suporte_ticket_solicitantes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
```

- Ajustar a policy de SELECT em `suporte_tickets` e `suporte_comentarios` para aceitar também `EXISTS (SELECT 1 FROM suporte_ticket_solicitantes s WHERE s.ticket_id = id AND s.user_id = auth.uid())`.
- Backfill: para tickets existentes inserir uma linha com `is_principal=true` para o `solicitante_id`.

### Arquivos a tocar

- `src/components/demandas/CardActionsMenu.tsx` — novo item de menu (visível só para TI).
- `src/components/demandas/TarefaCard.tsx` — badge "Virou ticket #NNN".
- `src/components/suporte/NovoTicketForm.tsx` — modo "a partir de demanda", multi-solicitante, novos campos urgência/impacto, remoção do envio de email na criação, cópia dos comentários da demanda.
- `src/components/suporte/TicketDetailDialog.tsx` — exibir lista de solicitantes; remover envio de email no comentário; disparar email só em transições de status (aguardando_confirmacao / concluido).
- `src/components/suporte/TicketCard.tsx` / `AbaEmails.tsx` — exibir múltiplos solicitantes.
- `supabase/functions/send-support-email/index.ts` — refatorar para dois templates (aguardando confirmação e encerrado) e suportar lista de destinatários.
- Remover/limpar `notify-ticket-comment` do fluxo do front (manter função deployada para compatibilidade ou marcar como obsoleta).
- Hook utilitário `useTransformDemandaEmTicket` para encapsular: criar ticket, inserir solicitantes, copiar comentários, atualizar tags da demanda.

### Fluxo de email final

| Transição de status                  | Email enviado | Para                          |
|--------------------------------------|---------------|-------------------------------|
| criar / aberto / em_analise / em_validacao | não           | —                             |
| → aguardando_confirmacao             | sim           | todos os solicitantes do ticket |
| → concluido (encerrado)              | sim           | todos os solicitantes do ticket |
| novo comentário                      | não           | —                             |

---

## Perguntas em aberto (posso assumir os defaults se não responder)

1. Solicitantes default ao transformar: **criador + finalizadores + mencionados** (assumir sim).
2. Quem além de TI pode transformar? Assumir apenas TI + admin.
3. Manter `notify-ticket-comment` para notificação **in-app** (sino) mesmo sem email? Assumir sim — só o email some.