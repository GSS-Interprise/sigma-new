

## Cascata manual com tracking de tempo por fase

Decisão do usuário: **sem automação por tempo**. Quem move o lead entre canais é o captador (manual). O sistema precisa **contar** quanto tempo o lead ficou em cada raia para análise futura.

### O que muda em relação ao plano anterior
- ❌ Sem cron, sem `cascata-canais-processor`, sem `janela_resposta_horas`, sem `expira_em`.
- ✅ Foco em **registrar transições** (entrou no canal X em T1, saiu em T2) e **expor tempos** na UI.
- ✅ Modal obrigatório com **motivo** ao transferir um lead pra próxima fase.
- ✅ Ações em massa: marcar todos (ou selecionados) e transferir/fechar de uma vez.

### Modelo de dados

**Nova tabela `campanha_proposta_lead_canais`** (uma linha por passagem do lead num canal):
| coluna | tipo | nota |
|---|---|---|
| `id` | uuid PK | |
| `campanha_proposta_id` | uuid FK | |
| `lead_id` | uuid FK | |
| `canal` | text | `whatsapp`, `trafego_pago`, `email`, `instagram`, `ligacao`, `linkedin`, `tiktok` |
| `entrou_em` | timestamptz | quando o lead entrou nessa raia |
| `saiu_em` | timestamptz null | preenchido ao transferir/fechar |
| `motivo_saida` | text null | obrigatório no transfer manual |
| `proximo_canal` | text null | pra onde foi |
| `status_final` | text | `transferido`, `respondeu`, `convertido`, `descartado`, `aberto` |
| `duracao_segundos` | int generated | `EXTRACT(EPOCH FROM saiu_em - entrou_em)` |
| `criado_por` | uuid | usuário que moveu |

Fase 1 (WhatsApp + Tráfego Pago) cria **2 linhas simultâneas** ao iniciar a campanha.

### Helpers SQL
- View `vw_lead_tempo_por_canal`: agrega `SUM(duracao_segundos)` por (lead, canal) → consumida no histórico do lead e em relatórios futuros (Chapecó, valores de proposta etc.).
- Função `transferir_lead_canal(lead_id, campanha_proposta_id, canal_atual, proximo_canal, motivo)`: fecha a linha atual + abre a próxima atomicamente.

### UI

**1. `CampanhaLeadsList` (em cada aba de canal):**
- Checkbox por linha + checkbox "selecionar todos / filtrados".
- Coluna nova **"Tempo nesta raia"** (ex.: "2d 4h").
- Botão flutuante quando há seleção: **"Transferir para próximo canal"** | **"Fechar leads"**.

**2. `TransferirCanalDialog` (novo)**:
- Mostra quantos leads estão sendo movidos.
- Select **"Canal destino"** (whatsapp, email, instagram, ligacao, linkedin, tiktok).
- Textarea **"Motivo da transferência"** (obrigatório).
- Confirmar → chama `transferir_lead_canal` em loop (ou RPC batch).

**3. Aba nova "Cascata" no `CampanhaPropostaModal`**:
- Tabela: lead | canal atual | tempo no canal | canais já passou (chips com tempo em cada) | última transferência (motivo).
- Permite ver de relance onde cada lead está e quanto demorou em cada raia.

**4. Linha do tempo no prontuário do lead** (`LeadTimelineSection`):
- Adicionar eventos `canal_iniciado` / `canal_encerrado` com canal, duração e motivo.
- Prepara terreno pro "bloco total do histórico do lead" (campanha, propostas vinculadas, valores, tempo por raia) que o usuário mencionou pra depois.

### Entrega desta etapa
1. Migração: tabela `campanha_proposta_lead_canais` + view + função `transferir_lead_canal` + seed das 2 linhas (WA + tráfego) ao vincular proposta.
2. Hook `useLeadCanais(campanhaPropostaId)` retornando linhas ativas + tempos.
3. `TransferirCanalDialog` com motivo obrigatório.
4. `CampanhaLeadsList`: seleção múltipla + coluna tempo + ações em massa.
5. Aba "Cascata" no modal com visão consolidada.
6. Eventos no `lead_historico` para alimentar o bloco futuro de relatório.

### Fora desta etapa (fica pro próximo passo)
- Bloco consolidado no prontuário ("Campanha Chapecó: proposta R$X, 3d em WA, 5d em Email…").
- Dashboards comparativos (tempo médio por canal por campanha).

