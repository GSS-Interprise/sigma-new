

## Auditoria do BI – Prospec vs. Perguntas Solicitadas

### Status atual de cobertura

| # | Pergunta | Cobertura hoje | Observação |
|---|---|---|---|
| **GERAL** | | | |
| 1 | Nº de disparos | ✅ Sim (KPI "Total disparos" + gráfico Evolução mensal) | Soma manual + massa + tráfego |
| 2 | Disparos × Responderam | ⚠️ Parcial | Só mostra respostas de **tráfego pago**, não há respostas de WhatsApp/sigzap nem email |
| 3 | Disparos × Responderam × Convertidos | ⚠️ Parcial | Mesma limitação (só tráfego pago) |
| **POR ESPECIALIDADE** | | | |
| 4 | Disparos por especialidade | ❌ Não | Nada agrupado por especialidade |
| 5 | Disparos × Responderam por especialidade | ❌ Não | — |
| 6 | Disparos × Responderam × Convertidos por especialidade | ❌ Não | — |
| 7 | Motivos da não conversão | ❌ Não | Existe `campanha_proposta_lead_canais.motivo_saida` mas não é exibido |
| 8 | Convertidos por colaborador | ❌ Não | `leads.convertido_por` existe mas não usado |
| **ORIGEM** | | | |
| 9 | Disparos por email | ❌ Não | `email_interacoes` / `sigma_email_log` não consultados |
| 10 | Disparos sigzap (WhatsApp) | ⚠️ Parcial | Conta `disparos_contatos`, mas não separa do "manual" |
| 11 | Retorno tráfego pago | ✅ Sim | Aba "Tráfego pago" responde |
| 12 | Prospecção por Instagram | ❌ Não | Existe canal `instagram` em `campanha_proposta_lead_canais` mas não exibido |
| 13 | Nº de ocorrências | ❌ Não | Não há tabela "ocorrências" definida — precisa esclarecimento |

### O que será adicionado

**1. Nova aba "Por Especialidade"**
- Tabela e gráfico de barras agrupando: Disparos × Responderam × Convertidos por especialidade
- Fonte: `disparos_contatos` + `email_interacoes` + `campanha_proposta_lead_canais` ↔ `leads.especialidade`

**2. Nova aba "Conversão"**
- **Convertidos por colaborador**: agrupa `leads` por `convertido_por` (join com `profiles.nome_completo`), filtrando por `data_conversao` no período
- **Motivos de não conversão**: distribuição dos `motivo_saida` em `campanha_proposta_lead_canais` onde `status_final IN ('descartado','fechado','proposta_encerrada')` — gráfico de pizza + tabela

**3. Aba "Canais" expandida (substitui a atual)**
KPIs separados por canal de origem:
- **WhatsApp/SigZap**: count `disparos_contatos` (status `4-ENVIADO`) + `disparo_manual_envios` (tipo `whatsapp`)
- **Email**: count `email_interacoes` (direcao=`enviado`) + `disparo_manual_envios` (tipo `email`)
- **Tráfego pago**: já existe (vw_trafego_pago_funil)
- **Instagram**: count `campanha_proposta_lead_canais` (canal=`instagram`)
- Cada canal mostra: enviados / responderam / convertidos

**4. Visão Geral – aprimoramento**
- KPI "Responderam" passa a somar respostas de **todos** os canais (tráfego + email_interacoes inbound + raias com `saiu_em` e `status_final='respondeu'`)
- Mesmo para "Convertidos"

### Pendência – pergunta 13 "Ocorrências"

Não existe tabela com esse nome. Antes de implementar, preciso confirmar o que conta como ocorrência:
- Falhas de disparo (`disparos_contatos.status` em `5-NOZAP`, `7-BLACKLIST`, etc.)?
- Tickets de suporte (`suporte_tickets`)?
- Outro conceito específico?

### Detalhes técnicos

- Todas as novas queries usam `fetchAllChunks` (paginação 1000) já implementado
- Filtro de período (`dataInicio`/`dataFim`) aplicado em `created_at` de cada fonte
- Mantém o estilo dark-neon (paleta NEON, `PanelCard`, `KPI`)
- Joins client-side via Map (Supabase JS não permite join direto entre views)
- Para "Por especialidade": fetch dos leads do período (id + especialidade) e cruza com cada origem de disparo via `lead_id`

### Plano de execução

1. Adicionar queries: `email_interacoes`, `leads` (especialidade/convertido_por), `campanha_proposta_lead_canais` agregado por motivo
2. Criar componente `KpiCanal` reutilizável
3. Adicionar abas: "Por Especialidade", "Conversão" e refazer "Canais"
4. Atualizar KPIs da Visão Geral para somar respostas/conversões de todos os canais
5. Ajustar `Mix por tipo` (donut) para incluir Email e Instagram

**Aguardo definição sobre "Nº de ocorrências" antes de iniciar.**

