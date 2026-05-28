---
tags: [arquitetura, sigma-gss, refator]
projeto: SigmaGSS
autor: Raul
data: 2026-05-27
status: rascunho
operador: Raul
repo: GSS-Interprise/sigma-new
---

# Arquitetura de Solução — Bloco T: reorganização de rotas /prospeccao/{sub}

> **O que é:** o hub legado `/disparos` deixa de ser uma página de menu pra virar uma URL escondida. Todos os sub-módulos hoje aninhados em `/disparos/*` (Chips & Instâncias, Captadores, BI-Prospec, Banco de Interesse, Residentes, Email, Campanhas) migram pra `/prospeccao/{sub}` — onde a equipe efetivamente trabalha. Operador navega numa árvore só.
>
> **Como usar:** ver `Como-Pulse-Opera.md` no Vault.

## 1. O que precisa funcionar (a capacidade)

A equipe acessa **Chips & Instâncias, Captadores, BI-Prospec, Banco de Interesse, Residentes e Disparos Email** a partir de sub-rotas de `/prospeccao`, com sidebar agrupada. O item "Disparos & Chips" some da sidebar (foi um hack temporário do incidente de 25/05). Deep links antigos (`/disparos/sigzap`, `/disparos/config`, etc.) continuam vivos com redirect 301 pra nova URL.

## 2. Estado atual

**Hoje (commit `5f5c277`):**
- `src/components/layout/Sidebar.tsx` tem 17 itens chapados, incluindo o hack "Disparos & Chips" → `/disparos`
- `src/pages/Disparos.tsx` é uma página-menu com 13 cards lincando pra `/disparos/zap`, `/disparos/email`, `/disparos/acompanhamento`, `/disparos/leads`, `/disparos/contratos`, `/disparos/blacklist`, `/disparos/regiao-interesse`, `/disparos/sigzap`, `/disparos/config`, `/disparos/captadores`, `/disparos/monitor`, `/disparos/residentes`, `/disparos/bi-prospec`
- `src/App.tsx` linhas 73-95 declaram as rotas individuais — cada uma renderiza um `Page` separado (DisparosZap, DisparosEmail, DisparosAcompanhamento, DisparosLeads, DisparosBlackList, DisparosSigZap, DisparosConfig, DisparosContratos, Captadores, DisparosRegiaoInteresse, DisparosMonitor, DisparosResidentes, DisparosTrafegoPago, DisparosCampanhas, DisparosCampanhaPropostas, DisparosBIProspec)
- `/prospeccao` hoje só serve `CampanhasProspeccao` com 3 tabs internas (Campanhas/Quentes IA/Dashboard)
- O `useCaptacaoPermissions` filtra acesso por permission flag — esse esquema continua

## 3. A solução desenhada

### Nova árvore de rotas

```
/prospeccao                         → CampanhasProspeccao (mantém)
  /prospeccao?view=campanhas          (tab interna)
  /prospeccao?view=acompanhamento     (tab interna)
  /prospeccao?view=dashboard          (tab interna)

/prospeccao/chips                   → DisparosConfig          (ex-/disparos/config)
/prospeccao/captadores              → Captadores              (ex-/disparos/captadores)
/prospeccao/bi                      → DisparosBIProspec       (ex-/disparos/bi-prospec)
/prospeccao/banco-interesse         → DisparosRegiaoInteresse (ex-/disparos/regiao-interesse)
/prospeccao/residentes              → DisparosResidentes      (ex-/disparos/residentes)
/prospeccao/email                   → DisparosEmail           (ex-/disparos/email)
/prospeccao/monitor                 → DisparosMonitor         (ex-/disparos/monitor)  [admin]

/disparos/sigzap                    → mantém (já foi exposto como /conversas via Sidebar)
/leads                              → mantém (já é rota top-level)
/disparos/*                         → redirect 301 pra equivalente em /prospeccao
```

### Sidebar resultante (combinando com a Sidebar Agrupada — ver `sidebar-agrupada-dominio.md`)

```
SIGMA
─ Home
─ Licitações

PROSPECÇÃO
  Prospecção (âncora)
    · Campanhas (link pra /prospeccao?view=campanhas)
    · Acompanhamento (link pra /prospeccao?view=acompanhamento)
    · Dashboard (link pra /prospeccao?view=dashboard)
    · Leads
    · Conversas
    · Chips & Instâncias       ← /prospeccao/chips
    · Banco de Interesse       ← /prospeccao/banco-interesse
    · Residentes               ← /prospeccao/residentes
    · Captadores               ← /prospeccao/captadores
    · BI Prospec               ← /prospeccao/bi
    · Email Marketing          ← /prospeccao/email
```

Item "Disparos & Chips" desaparece. `Disparos.tsx` (a página-menu) também — fica órfã.

### Redirect 301 (`src/App.tsx`)

```tsx
<Route path="/disparos/config" element={<Navigate to="/prospeccao/chips" replace />} />
<Route path="/disparos/captadores" element={<Navigate to="/prospeccao/captadores" replace />} />
<Route path="/disparos/bi-prospec" element={<Navigate to="/prospeccao/bi" replace />} />
<Route path="/disparos/regiao-interesse" element={<Navigate to="/prospeccao/banco-interesse" replace />} />
<Route path="/disparos/residentes" element={<Navigate to="/prospeccao/residentes" replace />} />
<Route path="/disparos/email" element={<Navigate to="/prospeccao/email" replace />} />
<Route path="/disparos/monitor" element={<Navigate to="/prospeccao/monitor" replace />} />
{/* /disparos (sem sub) → /prospeccao */}
<Route path="/disparos" element={<Navigate to="/prospeccao" replace />} />
```

### Permissões

`useCaptacaoPermissions` continua determinando quem vê o item. A Sidebar agrupada (`sidebar-agrupada-dominio.md`) já leva em conta isso — operadora externa não vê BI, etc.

## 4. Fora de escopo

- **Renomear telas internas** — ex: `DisparosConfig.tsx` continua se chamando assim, só muda a rota. Refator de nome de arquivo é outra capacidade
- **Mudar comportamento das telas** — Captadores, BI-Prospec, Banco Interesse continuam idênticos por dentro
- **Mexer em `/disparos/sigzap`** — continua exatamente como está (já exposto como Conversas)
- **Migrar Tarefas (`/disparos/tarefas`) e Campanhas legadas (`/disparos/campanhas`)** — essas rotas ficam vivas e ocultas; quem precisar acessa via URL direta. Não entram na Sidebar
- **Tráfego pago (`/disparos/tp`)** — continua oculto, deep link

## 5. Riscos / pegadinhas / dependências

- **Dependência forte de `sidebar-agrupada-dominio.md`** — implementar Bloco T sem a Sidebar agrupada deixa a Sidebar ainda mais chapada (12+ itens em Prospecção sem agrupamento visual). Recomendado: fazer Sidebar agrupada PRIMEIRO, e depois rodar Bloco T preenchendo os sub-itens da âncora Prospecção
- **Quebra de bookmarks/links externos** — se algum cliente, partner ou doc externa tem `/disparos/config` salvo, vai funcionar pelo redirect. Mas se tiver `/disparos` raiz salvo, cai em `/prospeccao` (pode estranhar). Vale comunicar na sprint review
- **`Disparos.tsx` órfã** — quando rota `/disparos` virar redirect, o componente fica sem rota. Decidir: deletar o arquivo, ou manter como página-menu acessível por URL `/disparos/menu` pra retrocompatibilidade temporária
- **`DisparosCampanhaPropostas`, `DisparosTrafegoPago`** — não estão na sidebar nem na proposta, mas têm rotas vivas. Mantém ou deleta? Confirmar com Maikon antes de decidir
- **Permission map em `Sidebar.tsx`** — o `moduleMap` linhas 102-120 precisa ganhar as rotas novas. Errar isso esconde Chips & Instâncias pra admin (já aconteceu antes)
- **Lovable auto-rebuild** — toda mudança em `src/App.tsx` força rebuild. Cada tarefa deve ser pequena e mergeada uma a uma pra evitar bundle break

## 6. Plano de Execução — as tarefas

- [ ] **T1 — Adicionar as 7 rotas novas em `src/App.tsx`** apontando pros mesmos componentes (DisparosConfig em `/prospeccao/chips`, etc.). Build verde. **NÃO** remover ainda as rotas antigas. **NÃO** mexer em Sidebar.
- [ ] **T2 — Adicionar redirects 301** das 7 rotas legadas em `src/App.tsx` (`<Navigate replace>`). Validar `/disparos/config` → `/prospeccao/chips` no browser
- [ ] **T3 — Atualizar `Sidebar.tsx` moduleMap** com as 7 rotas novas (mapear pra permissão `disparos`). Verificar que `usePermissions` continua filtrando corretamente
- [ ] **T4 — Decidir destino de `Disparos.tsx`** (deletar ou virar `/prospeccao/hub-legado`?). Documentar em comentário no App.tsx
- [ ] **T5 — Decidir destino de rotas órfãs** (`/disparos/tarefas`, `/disparos/campanhas`, `/disparos/contratos`, `/disparos/tp`, `/disparos/zap`, `/disparos/blacklist`, `/disparos/acompanhamento`, `/disparos/leads`): manter como deep-link sem redirect, ou redirect pra `/prospeccao`? Aplicar decisão
- [ ] **T6 — Remover o item "Disparos & Chips"** da Sidebar (linha 49-55 do commit `5f5c277`). Esse item só existia como mitigation enquanto Bloco T não saía
- [ ] **T7 — Smoke test no browser:** logar como admin (Raul), operadora (Bruna), e externo (se disponível). Confirmar que cada role vê os itens corretos em Prospecção, e que cliques chegam nas telas corretas
- [ ] **T8 — Limpar imports não usados** em `App.tsx` se algum Page deixou de ser referenciado. Build verde

## 7. Critério de pronto

- [ ] Build verde + type-check sem erros
- [ ] Item "Disparos & Chips" não aparece mais na Sidebar
- [ ] Item "Prospecção" da Sidebar tem sub-itens funcionais pra Chips, Captadores, BI, Banco de Interesse, Residentes, Email
- [ ] Acessar `https://sigma-gss.lovable.app/disparos/config` redireciona pra `/prospeccao/chips` (3 sub-rotas testadas no mínimo)
- [ ] Smoke test em 2 roles diferentes (admin, operadora) sem regressão visível
- [ ] PR aberto e mergeado por tarefa (T1 a T8)

## 8. Autonomia e direitos de decisão

- **Operador decide sozinho:** ordem fina de T4 e T5 (decisões sobre rotas órfãs); como nomear sub-rotas
- **Volta pro Raul só em:** mudança no escopo (ex: descobrir que Conversas precisa migrar também); decisão de deletar componente que tem código relevante
- **Mergeia:** Raul, ao revisar cada PR (portão de qualidade)
