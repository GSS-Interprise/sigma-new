## Objetivo

Quando uma campanha disparar para um lead e essa campanha tiver proposta vinculada, além de clonar a proposta (já feito), gravar um evento `proposta_enviada` em `public.lead_historico`. Assim aparece automaticamente na timeline do médico (via `vw_lead_timeline`).

## O que muda

### 1. Trigger de clonagem (estender, sem quebrar)
Atualizar a função `clonar_proposta_para_lead` (ou a função-trigger em `disparos_contatos`) para, depois de criar a proposta personalizada, inserir uma linha em `lead_historico`:

- `lead_id` = lead destino
- `tipo_evento` = `'proposta_enviada'`
- `proposta_id` = id da proposta personalizada recém-criada
- `disparo_log_id` = id do disparo (se vier no contexto da trigger)
- `descricao_resumida` = `'Proposta enviada via campanha "<nome_campanha>"'`
- `metadados` = `{ origem: 'campanha', campanha_id, campanha_proposta_id, proposta_origem_id, telefone, canal: 'whatsapp' }`
- `usuario_id` = NULL (operador = sistema na timeline)

Idempotência: antes de inserir, verificar se já existe `lead_historico` com `tipo_evento='proposta_enviada'` e `proposta_id = nova_proposta_id`. Se existir, pula.

### 2. Backfill
Para os ~2.238 leads que já tiveram proposta clonada pela migration anterior:
- Inserir um `lead_historico` `proposta_enviada` por proposta personalizada existente cuja `descricao` contenha o marcador `origem_proposta:[ID]` e ainda não tenha histórico correspondente.
- Usar `criado_em` = data do disparo (`disparos_contatos.created_at`) para a timeline ficar cronologicamente correta.

### 3. Frontend
Nada a alterar. `LeadTimelineUnificadoSection` já lê `vw_lead_timeline`, que já inclui `lead_historico`. O evento aparecerá com tipo `proposta_enviada`, operador `sistema`, automaticamente.

Opcional (pequeno polish): em `LeadTimelineUnificadoSection`, garantir ícone/label amigável para `proposta_enviada` (hoje `LeadTimelineSection` já tem; conferir o unificado).

## Resultado esperado

- Cada novo disparo de campanha com proposta gera 2 efeitos: proposta personalizada na aba "Propostas" + linha "Proposta enviada via campanha X" no histórico/timeline do médico.
- Backfill: os 2.238 médicos já disparados passam a mostrar o evento histórico imediatamente.

## Detalhes técnicos

- Migração SQL única: `CREATE OR REPLACE FUNCTION` da função de clonagem + bloco `INSERT INTO lead_historico ... SELECT ... WHERE NOT EXISTS (...)` para o backfill.
- Sem alteração de schema (nenhuma coluna nova; `proposta_enviada` já existe no enum `tipo_evento`).
- Sem mudança em RLS — `lead_historico` já está em uso pela timeline.
