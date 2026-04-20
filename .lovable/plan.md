

## Status do lead: filtros globais + por proposta + ação "Liberar lead"

### Princípio
Substituir o status global por uma combinação clara:
1. **Filtros globais de elegibilidade** (sempre aplicados, independente da proposta): blacklist + bloqueio temporário + janela de 7 dias.
2. **Status local por proposta**: derivado da cascata (`campanha_proposta_lead_canais`).
3. **Ação manual "Liberar lead"**: quando um lead foi fechado em outra proposta vinculada à mesma campanha e o captador quer reativá-lo nesta proposta.

### Filtros globais (não dependem da proposta)
| Filtro | Fonte | Bloqueia? |
|---|---|---|
| Blacklist | `blacklist.phone_e164` | Sim, hard block (não aparece) |
| Bloqueio temporário (proibido / VIP / desinteresse / opt-out / temporário) | `leads_bloqueio_temporario` (active = `removed_at IS NULL`) | Sim, hard block |
| Janela 7 dias | `disparos_historico_contatos.ultimo_disparo >= now() - 7d` | Soft: aparece marcado mas precisa "Liberar" pra disparar |

A view `vw_lead_status_por_proposta` ganha 3 colunas extras: `bloqueado_blacklist`, `bloqueado_temp`, `bloqueado_janela_7d`.

### Status por proposta (derivado da cascata)
Igual ao plano anterior:
- `a_contactar`: nenhuma linha em `campanha_proposta_lead_canais`.
- `em_aberto`: tem ≥1 linha `aberto`.
- `contactado`: tem `transferido` mas nenhum aberto.
- `fechado_proposta`: tem `respondeu/convertido/descartado/fechado` e nenhum aberto **nesta proposta**.

Importante: `leads.status` global **deixa de ser usado** em `CampanhaLeadsList` para colorir/filtrar.

### Liberação manual (novo)
Quando um lead aparece como `fechado_proposta` (nesta ou em outra proposta da mesma campanha) ou `bloqueado_janela_7d`, fica disponível o botão **"Liberar lead"** na coluna de ação.

Comportamento:
- Abre `LiberarLeadDialog` com:
  - Mostra o motivo do bloqueio (ex: "Fechado em proposta R$50/h em 12/04 — motivo: 'sem interesse no valor'", ou "Recebeu disparo há 3 dias").
  - Textarea **"Justificativa da liberação"** (obrigatório).
  - Botão Confirmar.
- Ao confirmar:
  - Insere registro em nova tabela `lead_liberacoes` (`lead_id`, `campanha_proposta_id`, `motivo_anterior`, `justificativa`, `liberado_por`, `created_at`).
  - Reabre o canal Fase 1 chamando `seed_fase1_lead_canais` para o lead naquela proposta (cria nova passagem em `whatsapp` + `trafego_pago`).
  - Registra evento em `lead_historico` (`tipo = 'lead_liberado'`).
- Próxima leitura da view considera o lead `em_aberto` novamente nesta proposta.

A view `vw_lead_status_por_proposta` ignora bloqueios (janela/fechado em outra proposta) quando existe `lead_liberacoes` posterior à última decisão de fechamento.

### Mudanças concretas

**Migração SQL**
1. View `vw_lead_status_por_proposta` (status local + flags globais).
2. Tabela `lead_liberacoes` + RLS (mesmo padrão de `leads_bloqueio_temporario`).
3. Função `liberar_lead_proposta(p_lead_id, p_campanha_proposta_id, p_justificativa)`: insere liberação + chama seed Fase 1 + grava em `lead_historico`.

**Hooks**
- `useLeadStatusProposta(campanhaPropostaId)` — retorna `Map<lead_id, { status_proposta, bloqueado_blacklist, bloqueado_temp, bloqueado_janela_7d, ultimo_motivo, ultima_decisao_em }>`.
- `useLiberarLead()` — mutation chamando RPC.

**UI — `CampanhaLeadsList.tsx`**
- Refatorar `bucketize` pra ler do mapa do hook (sem `leads.status`).
- Coluna "Status": badge proposta + ícones para `blacklist` / `bloq_temp` / `7d` com tooltip do motivo.
- Linhas com `bloqueado_blacklist` ou `bloqueado_temp` ficam acinzentadas e sem ações.
- Linhas com `fechado_proposta` ou `bloqueado_janela_7d` mostram botão **"Liberar lead"** (substitui "Fechar lead" nesses casos).
- Botão "Fechar lead" vira "Encerrar nesta proposta" → `fechar_lead_canal`.

**UI — `LiberarLeadDialog.tsx` (novo)**
- Resumo do motivo do bloqueio.
- Justificativa obrigatória.
- Confirmar → `useLiberarLead`.

### Fora desta etapa
- Backfill retroativo de `leads.status` antigos pra `lead_liberacoes`.
- Filtro de disponibilidade por dia da semana (radio livre sexta).
- Bloco consolidado no prontuário do lead.

### Arquivos
- `supabase/migrations/...sql` — view + tabela `lead_liberacoes` + função `liberar_lead_proposta`
- `src/integrations/supabase/types.ts` — auto
- `src/hooks/useLeadStatusProposta.ts` — novo
- `src/hooks/useLiberarLead.ts` — novo
- `src/components/disparos/LiberarLeadDialog.tsx` — novo
- `src/components/disparos/CampanhaLeadsList.tsx` — refatorar status, coluna, ações

