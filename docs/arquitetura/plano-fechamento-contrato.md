---
tags: [arquitetura, sigma-gss, plano-mestre, fechamento-contrato, spec-driven]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-13
status: EM EXECUÇÃO (fundação de dados)
repo: GSS-Interprise/sigma-new
contrato: 4 blocos · 23/03 → 20/06/2026 · R$16.000
---

# Plano de Fechamento do Contrato SigmaGSS

> **Objetivo:** fechar os 4 blocos do contrato + 2 capacidades novas (BI Diretoria, Banco de Notícias).
> Metodologia **Spec-Driven** (cada frente tem spec própria: problema → solução → fora de escopo → critério de pronto).

## 0.1 Progresso de execução (13/06)
- ✅ **Fundação:** `vw_captadora_produtividade` + `vw_conversao_tendencia` aplicadas.
- ✅ **D1 Banco de Notícias:** tabelas `hospitais`/`hospital_especialidades`/`hospital_noticias` + RLS + GRANT + trgm + Storage. Falta D2 (UI).
- ✅ **Auditoria /bi:** [[auditoria-bi]]. Legado fake (`AbaDisparos`+`useDisparosBI`) **morto**; motor real (`AbaProspec`) plugado no `/bi` como aba default "Prospecção".
- ✅ **BI executivo:** aba **Resumo** na Prospecção (KPIs com meta, ritmo vs 700/dia, funil, produtividade do time).
- ⏳ **Falta:** publish Lovable + Ramone validar · D2 (UI notícias) · B1 (resumo IA campanha) · A1/A2 (Bloco 3) · shell fix · B3 (apresentação). Abas BI Médicos/Contratos/etc = contrato futuro.

## 0. Status real (auditado 13/06 via DB + código)

| Bloco | Janela | Status | Falta |
|---|---|---|---|
| **1 — Máquina de Disparo** | 23/03–11/04 | ✅ **100%** | só validação formal |
| **2 — Pipeline Prospecção** | 14/04–02/05 | ✅ **100%** + prod | nada técnico |
| **3 — Perfil Inteligente** | 05/05–30/05 | 🟡 **~90%** | A1 filtro retroativo · A2 tag insights Kanban |
| **4 — Inteligência Campanha** | 02/06–20/06 | 🟡 **~55%** | B1 resumo IA campanha · B2 produtividade captadora · BI Diretoria · apresentação |

**Já entregue do Bloco 4 (não duplicar):** Dashboard operacional 3 fases (`DashboardCampanhas`), Modo Foco (`AcompanhamentoLeadPainel` side-by-side), Log de ações (`Auditoria.tsx` + `log_auditoria`), split IA×Manual, Status operacional ao vivo.

**Capacidades NOVAS (fora dos 4 blocos originais → escopo adicional):**
- **C — BI Diretoria (Ramone):** painel estratégico gated por role, por abas, 100% visual. **Fase 1 = só Prospecção** (essa fecha o "Dashboard BI" do Bloco 4). Abas Contratos/Financeiro/Escalas = **contrato futuro**.
- **D — Banco de Notícias:** catálogo de hospitais + notícias (calote/má reputação) pras captadoras usarem de argumento. Pedido Maikon/Ramone 10/06.

---

## 1. Fundamentos descobertos na auditoria (verdade do sistema)

### Auth/RBAC — MADURO, reusar
- `user_roles` (enum `app_role`: `admin`, `diretoria`, `gestor_captacao`, `gestor_contratos`, `coordenador_escalas`, `gestor_financeiro`).
- Matriz `permissoes` + RLS `has_role()` / `is_admin()`.
- Front: `<PermissionRoute adminOnly | adminOrLeader | modulo>`, hook `usePermissions()` (`isAdmin`, `isLeader`).
- **Gate do BI Diretoria = trivial:** Ramone com role `diretoria` (ou `admin`) + `<PermissionRoute adminOrLeader>`. Confirmar/criar `user_roles` da Ramone.

### Dados de BI — muita coisa pronta
- Views: `vw_disparos_diarios`, `vw_campanhas_dashboard`, `vw_leads_funil_stats`, `vw_campanha_ultimo_disparo`, `vw_chip_health`, `vw_sigzap_atividade_equipe`, `vw_produtividade_disparos`.
- Stack: **Recharts** (v2.15.4) + `src/components/ui/chart.tsx` (ChartContainer) + shadcn/Tailwind + Lucide.

### ⚠️ Pegadinha de atribuição (bloqueia "produtividade por captadora" de verdade)
- `campanha_leads.assumido_por` preenchido em **5 de 14.194 linhas**. View por captadora fica vazia até o write-path carimbar.
- **Fontes que JÁ enchem** (usar como base agora): `disparos_campanhas.responsavel_id`, `disparo_manual_envios.enviado_por`, `campanha_proposta_lead_canais.criado_por/movido_por`, `leads.convertido_por`, `lead_historico.usuario_id`.
- **Correção de write-path (B2.1):** ao responder/assumir lead manual (card), carimbar `assumido_por` + `assumido_em`. Sem isso, métricas de acompanhamento por pessoa não crescem.

---

## 2. Frentes de trabalho (work-streams)

### FRENTE A — Fechar Bloco 3 (Perfil Inteligente)
- **A1 · Filtro retroativo por perfil.** Busca cross-base sobre `banco_interesse_leads` (modalidade_preferida[], valor_minimo, UFs, cidades, especialidade). Hoje só existe `RegiaoInteresseModule` (escopo estreito, dentro de disparos). Entregar uma busca "Encontrar médicos por perfil" reaproveitável, que gera lista pra campanha. ~6h.
- **A2 · Tag insights no Kanban.** Badges derivados de `banco_interesse_leads` + `resumo_ia` nos cards do `AcompanhamentoCard` (ex: 💰 valor, 📍 UF preferida, 🏷️ modalidade). ~4h.

### FRENTE B — Fechar Bloco 4 (Inteligência de Campanha)
- **B1 · Resumo IA de campanha.** Edge `campanha-resumo-ia` (GPT-4o-mini) + tabela cache `campanha_resumos` + botão "Gerar resumo executivo" ao pausar/finalizar campanha. Reusa infra do `lead-perfil-extrator`. Resume: o que funcionou, perfil que mais respondeu, objeções recorrentes, ajuste sugerido. ~10h.
- **B2 · Produtividade por captadora.** View `vw_captadora_produtividade` (✅ migration desta sessão) + painel visual. Inclui **B2.1** write-path carimbar `assumido_por`. ~8h.
- **B3 · Apresentação final + manual + testes E2E.** Entrega de contrato (Bloco 4 fecha aqui). Deck de indicadores + plano de continuidade. ~8h.

### FRENTE C — BI Diretoria (Ramone) [novo · Fase 1 fecha "Dashboard BI" do Bloco 4]
- **C1 · Fundação de dados.** Views consolidadas de KPI estratégico (reusa as existentes + `vw_captadora_produtividade` + tendência de conversão). ~6h.
- **C2 · Shell da página.** Rota nova `/bi` (ou `/diretoria`) gated `adminOrLeader`/`diretoria`, layout por **abas** (Prospecção · Contratos · Financeiro · Escalas), 100% visual (cards + gráficos, zero listas de texto). ~6h.
- **C3 · Aba Prospecção (entrega agora).** KPIs estratégicos: funil macro, meta 700/dia + tendência, conversão IA×manual, top campanhas/especialidades, produtividade do time, saúde da máquina. ~12h.
- **C4 · Abas Contratos/Financeiro/Escalas.** Placeholders "Próximo escopo" agora; conteúdo = **contrato futuro**. ~2h (placeholders).

### FRENTE E — Sidebar agrupada por domínio [novo · UX, pedido Raul]
- **E1 · Agrupamento.** Trocar a lista chapada (17 itens) por grupos: **Prospecção** (1ª, Raul controla) · Operação Clínica · Gestão · Sistema. Labels não-clicáveis, esconde grupo vazio, **permissões idênticas** (só muda o visual — não mexe na autoridade dos outros domínios). Base: [[sidebar-agrupada-dominio]] (Variante A, nunca implementada).
- Princípios aplicados (skills ui-ux-pro-max + marketing-psychology): **anchoring** (Prospecção 1ª = referência), **activation energy** (operação mais usada no topo, menos cliques), **mental accounting** (agrupar como o usuário pensa), Miller 7±2, hierarquia visual.
- Prospecção (Raul controla 100%): Campanhas · Conversas · Leads · Disparos & Chips · **Notícias** (entra quando D2 sair). ~5h.

### FRENTE D — Banco de Notícias (catálogo hospitais) [novo · escopo adicional]
- **D1 · Modelagem.** Migration `hospitais` (nome, CNPJ?, UF, cidade, região, especialidades[], tipo_local) + `hospital_noticias` (FK, tipo, título, resumo, fonte_url, fonte_print, data_fato, gravidade, tags[], criado_por). **GRANT + RLS + índice trgm.** ~4h.
- **D2 · Catálogo + cadastro.** Página `/noticias` (ou dentro de Captação): listar/buscar hospitais, cadastrar local + notícias (link/print/resumo). ~8h.
- **D3 · Argumentos no atendimento (fase 2).** Buscar hospital por nome no card do lead → colar argumento. ~4h (opcional / pós-MVP).

> Specs detalhadas: [[bi-diretoria]] · [[banco-noticias-hospitais]]. A/B ficam neste doc (escopo menor).

---

## 3. Ordem de execução (fundação de dados primeiro — decisão Raul)

| Fase | Conteúdo | Frentes | Saída |
|---|---|---|---|
| **0 — Fundação (AGORA)** | views captadora + KPI diretoria + migration banco notícias + write-path atribuição | C1, B2(view), D1, B2.1 | dados prontos, zero UI |
| **1 — BI Diretoria** | shell por abas + aba Prospecção + painel produtividade | C2, C3, B2(UI), C4 | painel da Ramone no ar |
| **2 — Inteligência IA** | resumo IA campanha + gaps Bloco 3 | B1, A1, A2 | Bloco 3 e 4 fechados |
| **3 — Banco de Notícias** | catálogo + cadastro (+ argumentos) | D2, D3 | pedido Maikon entregue |
| **4 — Entrega** | testes E2E + manual + apresentação diretoria | B3 | contrato fechado |

**Estimativa total restante:** ~106h. Contrato (A+B+C-fase1) ~70h · Adicional (D + abas futuras C) ~36h.

---

## 4. Pipeline por frente (Spec-Driven)
spec (doc) → branch → implementação → revisão (bugs / segurança+anti-ban / regressão+UX) → critério de pronto → Raul revisa → push main → Lovable publica.

## 5. Riscos / pegadinhas globais
- **GRANT após CREATE TABLE** (banco notícias): toda tabela via SQL direto precisa `GRANT ... TO authenticated, service_role` senão edge crasha `42501`. [[feedback_grant_apos_create_table]]
- **Atribuição vazia:** produtividade só fica rica após B2.1 (write-path). Comunicar à Ramone que o painel "enche com o uso".
- **Role da Ramone:** confirmar `user_roles` antes de prometer acesso. Sem isso, `<PermissionRoute>` bloqueia.
- **Lovable rebuild:** mudança de componente força rebuild — manter build verde, publicar manual após push.
- **Abas futuras:** não prometer Contratos/Financeiro/Escalas neste contrato — são placeholders + escopo novo.

## 6. Referências
- Specs: [[bi-diretoria]] · [[banco-noticias-hospitais]]
- Dashboard atual: `src/components/campanhas/DashboardCampanhas.tsx` + `dashboard-gestao-melhorias.md`
- Auth: `src/hooks/usePermissions.ts` · `src/components/auth/PermissionRoute.tsx`
- Proposta: `Proposta_Contrato_GSS_SigmaGSS.pdf`
