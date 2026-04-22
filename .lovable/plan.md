

## Tornar chip obrigatório + marcar lead como "contactado em massa" ao enviar

Três ajustes pequenos e focados:

### 1. Chip / Instância obrigatório no `DisparosNovoDialog`

Em `src/components/disparos/DisparosNovoDialog.tsx`:
- Mudar label "Chip / Instância (opcional)" → **"Chip / Instância *"**.
- Adicionar `<span className="text-destructive">*</span>`.
- Atualizar `podeEnviar`: incluir `&& !!chipId`.
- Mensagem de erro/placeholder mais clara ("Selecione o chip que enviará as mensagens").
- Remover linha de ajuda atual e substituir por: "O chip selecionado define a instância usada pelo n8n. Status (1-ENVIAR…06-BLOQUEADOR) e fallback continuam iguais."

### 2. Lista de contatos do disparo: já está correto

Conferido — `gerar_disparo_zap` já usa `vw_lead_status_por_proposta` filtrando `status_proposta = 'a_contactar'`. Leads já contactados manualmente em qualquer raia (whatsapp/email/etc.) ficam fora automaticamente. **Sem mudanças necessárias.**

O endpoint `disparos-zap-pendentes` também já respeita o limite global de **120 leads/dia por instância** e filtra apenas status `1-ENVIAR` / `2-REENVIAR`. **Sem mudanças.**

### 3. Marcar lead como "contactado por envio em massa" no callback `4-ENVIADO`

Em `supabase/functions/disparos-callback/index.ts`, dentro do bloco `if (status === '4-ENVIADO')` (após resolver `leadId` por fallback de telefone, igual ao que já existe):

Buscar a `campanha_proposta_id` do `disparos_contatos` e registrar atendimento na raia WhatsApp da proposta — mesmo efeito de quando alguém clica "marcar como contactado" manualmente na aba WhatsApp do dossiê.

Implementação:
- Ler `campanha_proposta_id` junto com `lead_id` e `telefone_e164` do `disparos_contatos`.
- Se houver `leadId` + `campanha_proposta_id`, fazer `upsert` em `lead_raia_status` (ou tabela equivalente usada pela `vw_lead_status_por_proposta`) com:
  - `lead_id`, `campanha_proposta_id`, `raia = 'whatsapp'`
  - `status = 'contactado'`
  - `origem = 'envio_em_massa'` (ou flag `automatico = true`)
  - `data_contato = now()`
- Garantir idempotência (`onConflict` no par `lead_id, campanha_proposta_id, raia`).
- Manter **toda** a lógica atual: `Acompanhamento`, `lead_historico`, vínculo SigZap, `has_whatsapp = true`.
- Adicionar uma entrada extra em `lead_historico`: `tipo_evento: 'contactado_envio_massa'`.

Antes de implementar, verifico (no modo default) qual é a tabela exata que registra o "contatado" por raia (`lead_raia_status` / `proposta_lead_status` / equivalente) lendo a definição da `vw_lead_status_por_proposta`, e uso a mesma mecânica que o botão manual de "marcar como contactado" usa hoje. Isso garante que o lead saia de `a_contactar` na próxima rodada do `gerar_disparo_zap` e não seja redisparado.

### Resultado

- **Chip obrigatório** ao criar disparo Zap.
- Lista alimentada apenas com leads `a_contactar` (já era o caso) → sem reenvios para quem foi contactado manualmente.
- GET continua entregando até 120 leads/dia/instância para o n8n.
- Após `sendMessage` → callback `4-ENVIADO` → lead marcado como **contactado por envio em massa** na raia WhatsApp da proposta + status `Acompanhamento` + histórico, exatamente como acontece num contato manual.

