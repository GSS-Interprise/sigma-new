---
tags: [arquitetura, sigma-gss, bi, auditoria, ramone]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-13
status: auditoria concluída — execução em andamento
repo: GSS-Interprise/sigma-new
parent: plano-fechamento-contrato.md (Frente C)
---

# Auditoria do /bi — por que a Ramone reclama

> **Reclamação da diretora:** "/bi é difícil de ler, não sei o que está acontecendo."
> Auditoria profunda (13 abas + camada de dados) pra separar o que aproveita do que não.

## 1. Causa-raiz (por que confunde)
1. **Dois painéis de prospecção com números diferentes:** o `/bi` mostrava `AbaDisparos` (LEGADO, **60% dado fake** — `Math.random()` no tempo de resposta, taxa de resposta estimada em 30%, leads em 5%), enquanto o painel real (`AbaProspec`, RPC `get_bi_prospec_dashboard`) ficava **escondido** em `/disparos/bi-prospec`. Diretora via número falso e divergente.
2. **Prospecção real não aparecia no /bi** (aba não mapeada no shell).
3. **KPIs sem "e daí?"** — números soltos, sem meta, sem comparação com período anterior, sem semáforo de ação.
4. **Tabelas densas + jargão interno** ("pendência", "risco relacional", "SLA_DIAS") que diretora não decodifica.
5. **Navegação por popover sem "onde estou"** — sem breadcrumb, descoberta confusa.

## 2. Ação tomada (13/06) ✅
- **KILL** `AbaDisparos` + `useDisparosBI` (dado fake). Removidos.
- **Motor novo no /bi:** aba **"Prospecção"** agora roda `AbaProspec` (RPC real). Vira aba **default** do `/bi`.
- Resultado imediato: Ramone abre `/bi` e vê dado verdadeiro de prospecção, sem painel falso.

## 3. Veredito por aba (estado completo)

| Aba | Linhas | Dados | Veredito | Motivo |
|---|---|---|---|---|
| **AbaProspec** (Prospecção) | 795 | ✅ real (RPC) | **REBUILD visual** | dado certo, UI confusa (7 sub-abas, select "O que quer saber?", KPI sem meta) |
| ~~AbaDisparos~~ | ~~762~~ | ❌ fake | **KILLED** | 60% estimado/aleatório |
| ~~useDisparosBI~~ | ~~746~~ | ❌ fake | **KILLED** | hook do legado |
| AbaFinanceiro | 233 | ✅ real | **KEEP** | limpa, objetiva — **referência de design** |
| AbaClienteExterno | 53 | ✅ real | **KEEP** | simples |
| AbaDrEscala | 377 | ✅ real | **KEEP** | wrapper ok |
| AbaMedicos | 858 | ✅ real | FIX | densa, sem meta, jargão, 2 blocos KPI redundantes |
| AbaContratos | 797 | ✅ real | FIX | 8 KPIs sem hierarquia, listas sem sort |
| AbaRelacionamento | 627 | ✅ real | FIX | filtros escondidos, alertas no rodapé, jargão |
| AbaLicitacoes | 758 | ✅ real | FIX | KPIs sem meta, gráfico evolução confuso |
| AbaInteligenciaCompetitiva | 638 | ✅ real | FIX | tabela 8 colunas, falta recomendação tática |
| AbaTI | 527 | ✅ real | FIX | 7 KPIs em linha, gargalos não acionáveis |
| AbaAges | 430 | ✅ real | FIX | 10 KPIs sem agrupamento |
| AbaEscalas | 561 | ✅ real | REBUILD | info crítica escondida em sub-abas/expandable |
| **Shell** (BI.tsx + BINavigation) | — | — | FIX | popover sem breadcrump; "onde estou" |

**Importante:** nenhuma aba é mock — todas leem Supabase. O problema é **legibilidade**, não falta de dado (exceto o legado fake, já morto).

## 4. Escopo deste contrato vs futuro
- **AGORA (Frente C, fecha "Dashboard BI" do Bloco 4):** rebuild executivo da **AbaProspec** + shell fix leve. Só prospecção (decisão Raul).
- **CONTRATO FUTURO:** FIX/REBUILD das abas Médicos, Contratos, Relacionamento, Licitações, Competitiva, TI, Ages, Escalas. Mapeadas aqui pra proposta adicional.

## 5. Rebuild executivo da AbaProspec (plano)
Princípio: **diretora entende em 5 segundos, sem texto denso.** Modelo de referência = `AbaFinanceiro` (limpa).
1. **Sub-aba "Resumo" (nova, default):** 4-5 KPIs grandes com **meta + comparação período anterior** (seta ▲▼ verde/vermelho): disparos hoje X/700 · taxa resposta · em conversa · quentes · convertidos.
2. **Funil macro** enxuto (5 etapas, % de passagem) — não o funil de 7 colunas atual.
3. **Tendência** (linha) — plugar `vw_conversao_tendencia`.
4. **Produtividade do time** (barras) — plugar `vw_captadora_produtividade`.
5. **Saúde da máquina** — chips X/20, capacidade, quentes esperando >24h (semáforo).
6. **Remover** o select "O que você quer saber?" (é filtro disfarçado de navegação).
7. **Cores semânticas:** vermelho=abaixo da meta, amarelo=atenção, verde=ok (não paleta neon decorativa).
8. As sub-abas analíticas (Especialidade, Campanhas, Canais...) ficam, mas **atrás** do Resumo.

## 6. Critério de pronto (Frente C)
- [ ] `/bi` abre em Prospecção com dado real (✅ feito).
- [ ] Sub-aba Resumo executiva: KPIs com meta + comparação, semáforo, funil enxuto, tendência, produtividade, saúde.
- [ ] Select "O que quer saber?" removido; cores semânticas.
- [ ] Shell com indicação de "onde estou".
- [ ] Ramone valida "consigo ler num relance".
