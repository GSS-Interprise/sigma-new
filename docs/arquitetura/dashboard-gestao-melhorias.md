---
tags: [arquitetura, sigma-gss, dashboard, gestao, spec-driven]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-07
status: MAPEAMENTO (pronto pra priorizar e executar)
repo: GSS-Interprise/sigma-new
componente: src/components/campanhas/DashboardCampanhas.tsx
---

# Dashboard de Gestão — Mapeamento de Melhorias

> **Quem usa:** Dr. Michael (diretor) e Ramone (decisão/metas) · Bruna (líder de prospecção, acompanha o time) · operadoras. O dashboard precisa dar **noção do trabalho** e **progresso vs metas** num relance.

## 0. Estado atual (o que JÁ existe — não duplicar)
- Aba **Dashboard** em `/prospeccao` (`DashboardCampanhas.tsx`), fonte `vw_campanhas_dashboard` (1 linha/campanha).
- **KPIs topo:** cobertura % · em conversa % · quentes >24h · convertidos %.
- **Cards secundários:** campanhas ativas · disparos 24h · disparos 7d · tempo médio quente · médicos sem WhatsApp.
- **Card IA × Manual** (add 07/06): disparos/quentes/campanhas por tipo.
- **Alerta** de leads quentes atrasados (>24h) + **Performance por campanha** (tabela) + **Atividade da equipe** (gráfico/tabela).
- **Filtros:** campanha · estado · especialidade. **Export** PDF/Excel.
- ❌ **NÃO tem:** filtro de **data/período**, **metas** (700/dia, 20 chips), **séries temporais** (por dia), **comparação** período-a-período.

---

## 1. Melhorias mapeadas

### 🔴 P0 — Período + Metas (pedido direto do Raul)

**1.1 Filtro de período com atalhos**
- Botões: **Hoje · Esta semana · Este mês · Personalizado** (date range). Default: Hoje.
- **Todos** os números do dashboard passam a respeitar o período (hoje só há "24h"/"7d" fixos, sem escolha).
- Persistir na URL (`?periodo=hoje`) p/ compartilhar/voltar.

**1.2 Meta de disparos — 700/dia**
- Card **"Disparos hoje: X / 700"** com barra de progresso + % + cor (🟢≥100% · 🟡 50-99% · 🔴<50%).
- **Gráfico de barras: disparos por dia** no período, com **linha tracejada da meta (700)**.
- **Projeção do dia:** "no ritmo atual (até agora às HH:mm), fecha o dia em ~X" — ajuda a agir antes das 17h.

**1.3 Capacidade de chips — meta 20 rodando**
- Card **"Chips em campanha: X / 20"** + quebra **online vs offline** (quantos reconectar).
- **Capacidade teórica** = `chips_online_em_campanha × 35` → "dá pra ~Y disparos/dia". Compara com a meta 700 e com o realizado.
- Mensagem acionável: "faltam Z chips online pra bater 700/dia".

### 🟡 P1 — Visão de gestão (noção do trabalho)

**1.4 Funil visual** — Base → Contatado → Em conversa → Quente → Convertido, com **% de passagem** entre etapas (onde está vazando).

**1.5 Comparação período-a-período** — esta semana vs semana passada (▲▼ %): disparos, contatados, quentes, convertidos. Dá sensação de evolução pro Dr. Michael.

**1.6 IA × Manual expandido** — além do volume (já tem): **taxa de conversão** IA vs manual, **tempo médio de resposta**, quentes gerados. Mostra o ROI da automação.

**1.7 Produtividade da equipe** — por operadora: leads assumidos · respondidos · convertidos · tempo médio de 1ª resposta. (Hoje há "atividade da equipe" genérica — segmentar por pessoa.)

### 🟢 P2 — Operacional / executivo

**1.8 Saúde operacional** — quentes esperando >24h (com lista clicável) · **tempo médio quente** (hoje **503h** = altíssimo, destacar em vermelho) · médicos sem WhatsApp.

**1.9 Snapshot/relatório visual** ("selfie" que a Bruna pediu na reunião 03/06): botão que gera **1 imagem/PDF resumo** (metas + funil + período) pronta pra mandar no WhatsApp pro Dr. Michael.

**1.10 Tendência de conversão** ao longo do tempo (linha) — a máquina está melhorando?

---

## 2. Dados necessários (o que falta no banco)
| Melhoria | Precisa de | Existe? |
|---|---|---|
| Filtro de período + gráfico por dia + comparação (1.1/1.2/1.5/1.10) | **série temporal de disparos por dia** | ❌ — view só tem snapshots (hoje/24h/7d). Criar **`vw_disparos_diarios`** (data, campanha, tipo_envio, n_disparos) agregando `sigzap_messages` (from_me + 1º contato) ou `campanha_lead_tasks` por data |
| Capacidade de chips (1.3) | chips online por categoria + em campanha | 🟡 `vw_chip_health` tem conexão; falta cruzar com `campanhas.chip_ids` → RPC/view |
| Funil (1.4) | etapas agregadas | ✅ já no `vw_campanhas_dashboard` (pool/contatado/em_conversa/quentes/convertidos) |
| IA×manual conversão/tempo (1.6) | tempo de resposta por mensagem | 🟡 derivável de `sigzap_messages` (gap entre received e from_me) |
| Produtividade equipe (1.7) | ações por usuário | 🟡 já há base na "atividade da equipe"; segmentar |

**Peça-chave:** a maioria das melhorias P0/P1 depende de **1 nova view de série temporal de disparos por dia**. Construída ela, o resto é UI.

---

## 3. Layout sugerido (ordem na tela)
1. **Barra de filtros** — período (atalhos) + campanha/estado/especialidade
2. **Linha de METAS** — Disparos hoje X/700 · Chips X/20 · Capacidade Y/dia
3. **Funil** + comparação com período anterior
4. **Gráfico disparos/dia vs meta 700**
5. **IA × Manual** (expandido)
6. **Performance por campanha** + **Produtividade da equipe**
7. **Saúde operacional** + alertas
8. **Exportar / Snapshot**

---

## 4. Fases de execução sugeridas
- **Fase 1 (P0 — maior valor p/ gestão):** view `vw_disparos_diarios` + filtro de período + meta 700/dia + capacidade de chips. *Entrega a "noção de progresso vs meta" que o Raul pediu.*
- **Fase 2 (P1):** funil visual + comparação período + IA×manual expandido + produtividade equipe.
- **Fase 3 (P2):** saúde operacional + snapshot/relatório visual + tendência.

## 5. Referências
- `src/components/campanhas/DashboardCampanhas.tsx` · view `vw_campanhas_dashboard` (`20260512170000`)
- `vw_chip_health` (capacidade de chips) · `sigzap_messages` (série temporal)
- Meta: **700 disparos/dia = 20 chips × 35/chip/dia** (anti-ban WS2). Reunião Bruna 03/06.
- Plano-mestre `plano-mestre-maquina-prospeccao.md` §1.5.
