

## Plano: Campanhas com Propostas Multi-Canal

### Modelo conceitual
```text
Campanha (1) ──< CampanhaProposta (N) ──> Proposta (1) ──> DisparoLista (1)
                       │
                       └──< segmentos (whatsapp | trafego_pago | email | instagram | ligacao | linkedin | tiktok)
```
Cada **Proposta vinculada à Campanha** carrega 1 lista de prospecção e abre um modal com 7 abas (uma por canal).

---

### 1. Banco de dados (migration)

**a) Nova tabela `campanha_propostas`** (vincula Proposta ↔ Campanha + lista de prospecção)
- `id`, `campanha_id` (FK `campanhas`), `proposta_id` (FK `proposta`), `lista_id` (FK `disparo_listas`)
- `status` text (`ativa` | `encerrada`), `created_by`, `created_at`
- `webhook_trafego_enviado_at` timestamptz (idempotência)
- UNIQUE (campanha_id, proposta_id)

**b) Nova tabela `campanha_proposta_canais`** (estado por canal/segmento)
- `id`, `campanha_proposta_id` (FK), `canal` text (`whatsapp|trafego_pago|email|instagram|ligacao|linkedin|tiktok`)
- `status` text (`pendente|em_andamento|concluido`)
- `metadados` jsonb (resposta webhook, instância, etc.)
- UNIQUE (campanha_proposta_id, canal)

**c) Nova tabela `tarefas_captacao`** (leads abertos / não contatados)
- `id`, `lead_id` (FK leads), `campanha_proposta_id` (FK), `canal` text
- `tipo` text (`lead_aberto|follow_up|tentativa_canal`)
- `status` text (`aberta|em_andamento|concluida|cancelada`)
- `responsavel_id` (FK profiles, nullable), `prazo` timestamptz
- `titulo`, `descricao`, `created_at`, `updated_at`, `concluida_em`

**d) Trigger `auto_send_trafego_pago_on_link`** em `campanha_propostas` (AFTER INSERT)
- Chama edge function `trafego-pago-auto-dispatch` via `pg_net`
- Atualiza `webhook_trafego_enviado_at`

**e) Função `pode_encerrar_campanha(_user_id)`** (SECURITY DEFINER)
- Retorna `is_admin(_user_id) OR is_captacao_leader(_user_id)`

**f) RLS**: select para `has_captacao_permission(uid,'leads')`; insert/update conforme regras; encerramento exige `pode_encerrar_campanha`.

---

### 2. Edge Function: `trafego-pago-auto-dispatch`

- Recebe `{ campanha_proposta_id }`
- Resolve contatos via lógica equivalente a `resolverContatosDaLista`
- Busca webhook de tráfego pago em `config_lista_items` (chave `trafego_pago_webhook_url`)
- POST com payload (campanha, proposta, lista, contatos)
- Faz POST paralelo na Evolution API padrão (instância configurada)
- Atualiza `campanha_proposta_canais` (canal `trafego_pago`) com response/success
- Para leads não atingidos por nenhum canal → cria registro em `tarefas_captacao` (`tipo='lead_aberto'`)

---

### 3. Frontend

**a) `DisparosCampanhasTab.tsx`** — adicionar:
- Botão **"Vincular Proposta"** (abre `VincularPropostaCampanhaDialog`)
- Lista de propostas vinculadas (cards) com badge de status + contador de canais ativos

**b) Novos componentes em `src/components/disparos/`:**
- `VincularPropostaCampanhaDialog.tsx` — seleciona Proposta + DisparoLista (ou cria nova lista inline)
- `CampanhaPropostaModal.tsx` — modal grande com `Tabs` (7 segmentos)
- `segments/` — uma sub-componente por canal:
  - `SegmentoWhatsApp.tsx` (reutiliza `DisparosContatosPanel`)
  - `SegmentoTrafegoPago.tsx` (status do envio automático + botão reenviar)
  - `SegmentoEmail.tsx` (integra com `EmailCampanhasTab`)
  - `SegmentoInstagram.tsx`, `SegmentoLigacao.tsx`, `SegmentoLinkedin.tsx`, `SegmentoTiktok.tsx` (registro manual + checklist por lead + criação de tarefa)
- `EncerrarCampanhaButton.tsx` — visível só para admin/líder; valida que todos leads estão em status fechado

**c) Hooks em `src/hooks/`:**
- `useCampanhaPropostas.ts` (CRUD vínculos)
- `useCampanhaPropostaCanais.ts` (estado por canal)
- `useTarefasCaptacao.ts` (lista, conclui, cria)

**d) Nova página `src/pages/DisparosTarefas.tsx`** + rota `/disparos/tarefas`
- Lista de leads abertos / tarefas pendentes por campanha
- Filtros: canal, responsável, prazo, status
- Card no hub `Disparos.tsx` ("Tarefas e Solicitações")

**e) Permissões:**
- Acesso geral: `disparos_zap` ou `leads`
- Encerrar campanha: usar `usePermissions().isAdmin || useCaptacaoPermissions().isCaptacaoLeader`

---

### 4. Configuração necessária

- Adicionar entrada em `config_lista_items`: `trafego_pago_webhook_url` (UI já tem `WebhookDisparosTab` — adicionar campo equivalente em uma seção "Tráfego Pago")
- Instância Evolution padrão: configurável via `config_lista_items` chave `trafego_pago_evolution_instance`

---

### 5. Fluxo end-to-end

1. Admin cria **Campanha** (já existe).
2. Clica **"Vincular Proposta"** → escolhe Proposta + Lista → salva.
3. Trigger dispara edge function → tráfego pago + Evolution recebem a lista.
4. Modal da Proposta abre com 7 abas; cada aba mostra status/ações do canal.
5. Leads não atingidos viram **tarefas abertas** em `/disparos/tarefas`.
6. Quando todos leads da campanha estão em status fechado (`Convertido|Descartado|Desinteresse|Bloqueado`), o botão **"Encerrar Campanha"** é habilitado para admin/líder.

---

### Arquivos a criar/editar

**Criar (10):**
- Migration SQL
- `supabase/functions/trafego-pago-auto-dispatch/index.ts`
- `src/components/disparos/VincularPropostaCampanhaDialog.tsx`
- `src/components/disparos/CampanhaPropostaModal.tsx`
- `src/components/disparos/segments/Segmento{WhatsApp,TrafegoPago,Email,Instagram,Ligacao,Linkedin,Tiktok}.tsx`
- `src/components/disparos/EncerrarCampanhaButton.tsx`
- `src/hooks/useCampanhaPropostas.ts`
- `src/hooks/useCampanhaPropostaCanais.ts`
- `src/hooks/useTarefasCaptacao.ts`
- `src/pages/DisparosTarefas.tsx`

**Editar (3):**
- `src/components/disparos/DisparosCampanhasTab.tsx` (botão + lista de propostas vinculadas)
- `src/pages/Disparos.tsx` (novo card "Tarefas")
- `src/App.tsx` (rota `/disparos/tarefas`)

