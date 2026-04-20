

## Disparo Manual — fluxo de 3 colunas por proposta

### Princípio
Reaproveitar a estrutura visual de 3 colunas do SIG Zap, mas trocar o conteúdo quando o usuário entrar em **modo Disparo Manual**. O envio é one-shot (fora de cascata automática), porém **rastreado**: cria/conecta a `sigzap_conversation`, vincula o `lead`, e marca origem `disparo_manual` para BI futuro.

### UX — fluxo

**1. Topo do header**
- Botão "Disparo Manual" (já existe) passa a alternar um modo: `manual` ↔ `inbox`.
- Quando ativo: header mostra dois selects encadeados — **Campanha** → **Proposta** (filtra `campanha_propostas` da campanha escolhida, status `ativa`).
- Botão "Voltar ao Inbox" para sair do modo.

**2. Coluna 1 — Leads "A contactar"**
- Lista os leads da `disparo_lista` da proposta selecionada cujo `status_proposta = 'a_contactar'` (usa view `vw_lead_status_por_proposta` já existente).
- Card por lead: nome + especialidade + UF.
- Busca por nome no topo. Contador total.
- Selecionar um lead → carrega coluna 2.

**3. Coluna 2 — Detalhe do lead + Ação**
Dividida em 3 blocos verticais:

a) **Números do lead** (de `phone_e164` + `telefones_adicionais`)
   - Cada número com ícone WhatsApp e botão "Inativar (não é o médico)" — marca prefixo `INATIVO:` no array (mesmo padrão de `PhoneEmailArrayFields`).
   - Radio para escolher **qual número** vai receber a mensagem.

b) **Botões de ação rápida**
   - **Blacklist** → insere em `lead_blacklist` (motivo "disparo manual").
   - **Banco de interesse** → muda `leads.status` para `interesse_futuro` (ou tabela equivalente já existente).
   - **Liberar lead** → reusa `LiberarLeadDialog`.

c) **Envio**
   - Seletor de **instância única** (radio, derivado das `chips` conectadas — só 1 permitido).
   - `Textarea` com mensagem (suporta spintax).
   - Botão "Enviar" (desabilitado sem instância + número + mensagem).

**4. Coluna 3 — Chat**
- Reusa `SigZapChatColumn` do conversaId resultante.
- Antes do envio: vazia / placeholder "Selecione um lead e envie a primeira mensagem".
- Após o envio: carrega a conversa criada/encontrada e segue conversa normal.

### Lógica de envio (server-side)

Nova edge function **`send-disparo-manual`**:
1. Recebe `{ campanha_proposta_id, lead_id, phone_e164, instance_id, mensagem }`.
2. Resolve spintax no texto.
3. **Upsert `sigzap_contacts`** pelo número normalizado (instance + jid).
4. **Upsert `sigzap_conversations`** (instance_id + contact_id) com `lead_id` setado → garante mapeamento universal.
5. Chama `send-sigzap-message` internamente (ou Evolution direto) e salva mensagem em `mensagens`/tabela equivalente.
6. Insere registro em `disparo_manual_envios` (nova tabela) com:
   `campanha_proposta_id, lead_id, phone_e164, instance_id, conversation_id, mensagem, enviado_por, created_at, status, erro`.
7. Marca `lead_status_proposta` como `contactado` (mesmo efeito da cascata) e dispara evento `tipo_evento_lead = 'disparo_manual'` no histórico do lead.

### Schema (migration)

```sql
-- Nova tabela de auditoria/origem do disparo manual
create table public.disparo_manual_envios (
  id uuid primary key default gen_random_uuid(),
  campanha_proposta_id uuid not null references campanha_propostas(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  phone_e164 text not null,
  instance_id uuid not null references chips(id),
  conversation_id uuid references sigzap_conversations(id),
  mensagem text not null,
  status text not null default 'enviado',  -- enviado | falhou
  erro text,
  enviado_por uuid references auth.users(id),
  created_at timestamptz default now()
);

alter table public.disparo_manual_envios enable row level security;
-- Política: usuário pode ver/inserir o que ele mesmo criou (ou tem permissão captação)

-- Adicionar valor ao enum tipo_evento_lead
alter type tipo_evento_lead add value if not exists 'disparo_manual';
```

### Arquivos

**Novos**
- `supabase/migrations/...sql` — tabela `disparo_manual_envios` + enum.
- `supabase/functions/send-disparo-manual/index.ts` — orquestração do envio.
- `src/components/sigzap/manual/DisparoManualHeader.tsx` — selects Campanha → Proposta + botão voltar.
- `src/components/sigzap/manual/DisparoManualLeadsColumn.tsx` — coluna 1 (lista de "a contactar").
- `src/components/sigzap/manual/DisparoManualLeadPanel.tsx` — coluna 2 (números + ações + envio).
- `src/hooks/useLeadsAContactar.ts` — query da view filtrando por `campanha_proposta_id` e `status='a_contactar'`.
- `src/hooks/useDisparoManual.ts` — mutation que invoca a edge function.

**Editados**
- `src/pages/DisparosSigZap.tsx` — adiciona `mode: 'inbox' | 'manual'`. Em modo manual, troca header e renderiza as 3 novas colunas (mantendo a coluna 3 = `SigZapChatColumn`).

### Fora desta etapa
- Templates de mensagem / mídia anexa (texto puro nesta v1).
- Disparo manual em lote (1 lead por vez).
- Edição de números do lead além do toggle "inativo".

