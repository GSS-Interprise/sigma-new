---
tags: [arquitetura, sigma-gss, bi, diretoria, dashboard, spec-driven]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-13
status: spec (pronto pra executar)
repo: GSS-Interprise/sigma-new
parent: plano-fechamento-contrato.md (Frente C)
---

# BI Diretoria — Painel Estratégico (Ramone)

> **O que é (1 frase):** um painel **estratégico, por abas, 100% visual** (cards + gráficos, zero listas de texto) acessível **só pra diretoria/admin**, pra Ramone monitorar a operação e fazer gestão num relance.

## 1. Problema (por que nasceu)
- Dashboard atual (`DashboardCampanhas`) vive dentro de `/prospeccao`, é **operacional** (foco da Bruna/líder) e cheio de tabelas. A Ramone quer **gestão estratégica**: indicadores, tendência, comparação — sem texto, sem listão.
- Não há área gated por diretoria com visão executiva. A Ramone precisa "monitorar por abas".

## 2. Estado atual (mapeado)
- **RBAC pronto:** `<PermissionRoute adminOrLeader>` + role `diretoria`. Confirmar `user_roles` da Ramone.
- **Dados prontos:** `vw_disparos_diarios`, `vw_campanhas_dashboard`, `vw_leads_funil_stats`, `vw_chip_health`, `vw_produtividade_disparos`, `vw_captadora_produtividade` (novo). Falta tendência de conversão por dia.
- **Stack visual:** Recharts + `ui/chart.tsx` + shadcn. Padrões em `DashboardMetasFase1.tsx` (BarChart + ReferenceLine).
- **Decisão Raul:** painel desenhado pra **empresa inteira por abas**, mas **Fase 1 entrega só a aba Prospecção**. Demais abas = placeholders ("Próximo escopo"), conteúdo é contrato futuro.

## 3. Solução desenhada

### C1 — Fundação de dados
- Reusar views existentes. Criar o que falta:
  - `vw_captadora_produtividade` ✅ (migration desta sessão).
  - `vw_conversao_tendencia` — por dia/semana: disparados, quentes, convertidos + taxa (tendência "a máquina melhora?"). Deriva de `vw_disparos_diarios` + `campanha_leads`.
  - `vw_bi_kpi_diretoria` (opcional) — 1 linha com os números-topo do período (cobertura, conversão, quentes, capacidade), pra header carregar rápido.

### C2 — Shell da página (`/bi`)
- Rota nova `/bi` em `App.tsx`, `<PermissionRoute adminOrLeader><BiDiretoria/></PermissionRoute>`.
- Item no Sidebar (grupo GESTÃO & FINANÇAS) só pra `adminOrLeader`.
- Layout: header com **filtro de período** (Hoje · Semana · Mês · Personalizado) + **abas** (`Tabs` shadcn): **Prospecção** · Contratos · Financeiro · Escalas.
- Componente raiz: `src/pages/BiDiretoria.tsx` + `src/components/bi/`.

### C3 — Aba Prospecção (entrega agora — fecha "Dashboard BI" do Bloco 4)
Tudo visual, em blocos de cards/gráficos:
1. **Topo — números-chave** (4-5 cards grandes): médicos na base · em conversa · quentes · convertidos · taxa de conversão. Variação ▲▼ vs período anterior.
2. **Meta & ritmo** — gauge/barra "Disparos hoje X/700" + gráfico de barras disparos/dia vs linha meta 700 + projeção do dia.
3. **Funil macro** — funil visual Base→Contatado→Conversa→Quente→Convertido com % de passagem (onde vaza).
4. **IA × Manual** — donut/barras: volume, conversão e tempo médio. ROI da automação.
5. **Tendência de conversão** — linha no tempo (a máquina melhora?).
6. **Top campanhas / especialidades** — barras horizontais (melhor canal por especialidade).
7. **Produtividade do time** — barras por captadora (assumidos/convertidos/taxa) — `vw_captadora_produtividade`.
8. **Saúde da máquina** — chips online/meta 20, capacidade teórica, quentes esperando >24h (semáforo).

### C4 — Abas futuras
- Contratos · Financeiro · Escalas: cada uma renderiza um placeholder visual ("Em breve — próximo escopo") com ícone. Sem dados agora.

## 4. Fora de escopo (v1)
- Conteúdo real das abas Contratos/Financeiro/Escalas (contrato futuro).
- Edição/drill-down infinito — é painel de monitoramento, não ferramenta de edição.
- Export/agendamento de relatório por email (pode entrar no snapshot da Bruna, fora daqui).
- Permissão granular por aba (v1: a página inteira é `adminOrLeader`).

## 5. Riscos / pegadinhas
- **Role da Ramone ausente** → tela bloqueia. Confirmar/criar `user_roles` antes de demo.
- **Produtividade vazia** (assumido_por sparse) → o bloco 7 mostra pouco até B2.1. Mostrar também conversões via `convertido_por` (já preenchido) pra não ficar zerado.
- **Período inconsistente** entre views (algumas só têm "hoje/24h/7d"). `vw_disparos_diarios` é a base com data — ancorar tudo nela.
- **Performance** — header deve carregar <1s; preferir view agregada a N queries.
- **"Zero texto" é diretriz forte** — nada de tabela densa; se precisar listar, vira top-5 em barras.

## 6. Critério de pronto
- [ ] Rota `/bi` só abre pra `adminOrLeader`/`diretoria`; operadora é redirecionada.
- [ ] Ramone tem role e acessa.
- [ ] Aba Prospecção com os 8 blocos, todos visuais (cards/gráficos), respeitando o filtro de período.
- [ ] Abas Contratos/Financeiro/Escalas mostram placeholder "próximo escopo".
- [ ] Nenhum bloco fica em erro/branco quando não há dados (estado vazio tratado).
- [ ] Build/type-check verde. Revisão adversarial (bugs/segurança/UX) sem bloqueante.
- [ ] Raul revisa PR e mergeia; publica no Lovable.

## 7. Pipeline
spec (este doc) → branch `bi-diretoria` → Claude implementa C1→C2→C3→C4 → revisão multi-lente + PO confere §6 → Raul revisa → push main → publish.
