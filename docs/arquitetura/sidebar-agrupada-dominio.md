---
tags: [arquitetura, sigma-gss, ux, refator]
projeto: SigmaGSS
autor: Raul
data: 2026-05-27
status: rascunho
operador: Raul
repo: GSS-Interprise/sigma-new
---

# Arquitetura de Solução — Sidebar agrupada por Domínio (Variante A)

> **O que é:** transformar a Sidebar atual (17 itens chapados, lista vertical igual) numa estrutura agrupada por domínio funcional: **Captação · Operação Clínica · Gestão · Sistema**. Cada grupo tem um **item-âncora destacado** (negrito, ícone grande) e **sub-itens** indentados (fonte menor, cor mais clara).
>
> Implementação da Variante A da proposta visual em `plan/proposta-sidebar-agrupada.html`.

## 1. O que precisa funcionar (a capacidade)

A Sidebar do Sigma deixa de ser uma lista plana de 17 itens e passa a mostrar 4-5 grupos visualmente coerentes. Operadora (Bruna/Letícia/Amanda) abre o app e identifica imediatamente seu "território" (Captação). Maikon olha Gestão. Cada role vê só os grupos relevantes pelas permissões — mas a estrutura visual é a mesma. Resultado: menos scan time, hierarquia clara, alinhado com Nielsen #4 (consistência) e Lei de Miller (7±2 chunks).

## 2. Estado atual

**Hoje (commit `f88c9f0`):**

- `src/components/layout/Sidebar.tsx` (220 linhas) — 2 arrays: `navigationTop[]` (15 itens) e `navigationBottom[]` (4 itens: Comunicação, Suporte, Auditoria, Configurações)
- Estrutura: cada item é `<SidebarMenuButton>` igual, distinguido só por ícone + texto + `isActive`
- Permissões filtram cada item via `usePermissions` (`hasPermission(modulo, 'visualizar')` + `useCaptacaoPermissions` pro módulo disparos)
- `useSidebar()` do shadcn controla `open` (expanded 64px) vs collapsed (16px com ícone só)
- Proposta visual standalone: `plan/proposta-sidebar-agrupada.html` (3 variantes — Variante A é a aprovada)

## 3. A solução desenhada

### Nova estrutura de dados

Trocar `navigationTop[]` plano por `navigationGroups[]` aninhado:

```tsx
type SidebarItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  permission?: { modulo: string; acao?: 'visualizar' | 'admin' };
  isAnchor?: boolean;  // se true, renderiza maior (âncora do grupo)
};

type SidebarGroup = {
  label: string;        // "CAPTAÇÃO DE MÉDICOS"
  items: SidebarItem[]; // primeiro é âncora, resto sub-itens
};

const navigationGroups: SidebarGroup[] = [
  {
    label: "Captação de médicos",
    items: [
      { name: "Prospecção", href: "/prospeccao", icon: Rocket, isAnchor: true, permission: { modulo: "disparos" } },
      { name: "Campanhas", href: "/prospeccao?view=campanhas", icon: Send, permission: { modulo: "disparos" } },
      { name: "Leads", href: "/leads", icon: UserSearch, permission: { modulo: "disparos" } },
      { name: "Conversas", href: "/disparos/sigzap", icon: MessageCircle, permission: { modulo: "disparos" } },
      // [após Bloco T] Chips & Instâncias, Banco de Interesse, Residentes
    ],
  },
  {
    label: "Operação clínica",
    items: [
      { name: "Médicos", href: "/medicos", icon: Users, isAnchor: true, permission: { modulo: "medicos" } },
      { name: "Relacionamento", href: "/relacionamento-medico", icon: Activity, permission: { modulo: "relacionamento" } },
      { name: "Escalas", href: "/escalas", icon: Calendar, permission: { modulo: "escalas" } },
      { name: "Clientes & Contratos", href: "/contratos", icon: FileText, isAnchor: true, permission: { modulo: "contratos" } },
      { name: "Licitações", href: "/licitacoes", icon: Gavel, permission: { modulo: "licitacoes" } },
      { name: "AGES", href: "/ages", icon: Building2, permission: { modulo: "ages" } },
      { name: "Radiologia", href: "/radiologia", icon: Stethoscope, permission: { modulo: "radiologia" } },
    ],
  },
  {
    label: "Gestão & finanças",
    items: [
      { name: "BI", href: "/bi", icon: BarChart3, isAnchor: true, permission: { modulo: "bi" } },
      { name: "Financeiro", href: "/financeiro", icon: DollarSign, permission: { modulo: "financeiro" } },
      { name: "Patrimônio", href: "/patrimonio", icon: Package, permission: { modulo: "patrimonio" } },
      { name: "Marketing", href: "/marketing", icon: Megaphone, permission: { modulo: "marketing" } },
    ],
  },
  {
    label: "Sistema",
    items: [
      { name: "Comunicação", href: "/comunicacao", icon: MessageSquare },
      { name: "Suporte", href: "/suporte", icon: Headset },
      { name: "Auditoria", href: "/auditoria", icon: Shield, permission: { modulo: "auditoria", acao: "admin" } },
      { name: "Configurações", href: "/configuracoes", icon: Settings, permission: { modulo: "configuracoes", acao: "admin" } },
    ],
  },
];
```

### Renderização

- **Label do grupo**: `<div class="text-[10px] uppercase tracking-wide opacity-50 px-3">{label}</div>` — NÃO clicável
- **Item âncora**: fonte 14.5px, font-weight 600, ícone 18px, opacity 1.0
- **Sub-item**: fonte 13px, padding-left 38px (indentação), opacity 0.7 (0.55 quando inativo)
- **Espaço entre grupos**: `mt-4` (16px)
- **Permissões**: filtra item via `usePermissions(item.permission?.modulo, item.permission?.acao)`. Se grupo fica vazio (todos filtrados), esconder o grupo inteiro

### Modo collapsed

- Só ícones (sem labels nem grupos)
- Labels de grupo viram divisores horizontais finos (`<hr class="opacity-20">`)
- Hover mostra tooltip com nome

### Diff visual aproximado

```
ANTES (chapado):              DEPOIS (agrupado):
  Home                          Home
  Licitações                    Licitações
  Prospecção                    
  Leads                         CAPTAÇÃO DE MÉDICOS
  Conversas                       Prospecção (âncora)
  Marketing                       · Campanhas
  Clientes e Contratos            · Leads
  Relacionamento Médico           · Conversas
  Médicos                       
  Escalas                       OPERAÇÃO CLÍNICA
  Financeiro                      Médicos (âncora)
  Patrimônio                      · Relacionamento
  Radiologia                      · Escalas
  BI                              Clientes & Contratos (âncora)
  AGES                            · Licitações
                                  · AGES
                                  · Radiologia
                                
                                GESTÃO & FINANÇAS
                                  BI (âncora)
                                  · Financeiro
                                  · Patrimônio
                                  · Marketing
                                
                                SISTEMA
                                  Comunicação
                                  Suporte
                                  Auditoria
                                  Configurações
```

## 4. Fora de escopo

- **Mexer nas páginas em si** — só refatora a Sidebar
- **Adicionar novos itens** — usa exatamente os 17 itens atuais. Bloco T (sub-rotas de prospecção) é arquitetura separada (`bloco-t-rotas-prospeccao.md`)
- **Reorganizar permissões** — `usePermissions` e `useCaptacaoPermissions` continuam idênticos. Só muda a leitura
- **Mobile drawer** — se já existe comportamento mobile, mantém. Não cria UX nova
- **Animação de expand/collapse de grupos** — versão 1 é grupos sempre visíveis. Toggle expansível fica pra V2
- **Salvar estado de qual grupo está aberto** — não tem estado expandido por grupo, todos sempre abertos

## 5. Riscos / pegadinhas / dependências

- **Permissão "operadora" tem que continuar igual** — se Sidebar agrupada esconder algo que a operadora tinha acesso (ex: Conversas), quebra fluxo. Validar com 2 logins reais (admin Raul + operadora teste)
- **Grupo vazio** — se uma operadora não tem nenhuma permissão de Operação Clínica, o label "OPERAÇÃO CLÍNICA" não pode aparecer sozinho. Filtrar grupo inteiro quando `items.filter(visible).length === 0`
- **Item ativo dentro de grupo** — só o item ativo destaca, não o grupo todo
- **Collapsed mode** — labels de grupo precisam virar separadores visuais ou sumir, senão ocupam espaço quando ícone é pequeno
- **Combinação com Bloco T** — quando rotas migrarem pra `/prospeccao/{sub}`, os sub-itens "Chips", "BI Prospec", "Banco Interesse", "Residentes", "Captadores", "Email" entram no grupo Captação. **Idealmente faça Sidebar agrupada PRIMEIRO** (essa é mais isolada), depois Bloco T preenche os sub-itens
- **Item "Disparos & Chips"** — está hoje (commit `5f5c277`) na sidebar como hack. Vai sair (não está no design da Variante A)

## 6. Plano de Execução — as tarefas

- [ ] **T1 — Criar tipos** `SidebarGroup` e `SidebarItem` em `src/components/layout/Sidebar.tsx` (ou em arquivo separado `Sidebar.types.ts`). Substituir as 2 constantes planas (`navigationTop`, `navigationBottom`) por uma constante `navigationGroups: SidebarGroup[]` única
- [ ] **T2 — Renderizar grupos sem permissions ainda** — componente que itera `navigationGroups`, renderiza label cinza + items. Visual já bonito. Permissão filtra tudo ou nada (sem filtro item-a-item nesta tarefa)
- [ ] **T3 — Adicionar filtro de permissão por item** dentro do grupo, usando `usePermissions` (e `useCaptacaoPermissions` pra módulo disparos). Esconder item se sem permissão
- [ ] **T4 — Esconder grupo inteiro quando todos os items filtrados** — se `visibleItems.length === 0`, não renderizar o label nem nada
- [ ] **T5 — Estilizar âncora vs sub-item** — fonte, peso, opacity, padding-left. Comparar com mockup em `plan/proposta-sidebar-agrupada.html` Variante A
- [ ] **T6 — Modo collapsed** — labels viram `<hr>` finos quando `open === false`. Items continuam ícone-only com tooltip
- [ ] **T7 — Remover item "Disparos & Chips"** do array (era hack do commit `5f5c277`)
- [ ] **T8 — Smoke test** — logar como admin (Raul) e operadora. Confirmar visibilidade e cliques. Tirar screenshot pra comparar com proposta

## 7. Critério de pronto

- [ ] Build verde, type-check sem erro
- [ ] Sidebar renderiza 4-5 grupos com labels em caixa alta cinza
- [ ] Cada âncora visualmente maior que sub-itens (size + weight + opacity diferentes)
- [ ] Operadora teste loga e vê APENAS o grupo "Captação de Médicos" (e Sistema se tiver Comunicação/Suporte)
- [ ] Admin vê todos os 4-5 grupos completos
- [ ] Comparativo visual lado-a-lado com `plan/proposta-sidebar-agrupada.html` (screenshot do app vs mockup)
- [ ] PR mergeado por tarefa (T1 a T8)

## 8. Autonomia e direitos de decisão

- **Operador decide sozinho:** detalhes de styling (cores exatas, padding em px); ordem fina das tarefas; se vai extrair `SidebarGroup` em arquivo separado ou não
- **Volta pro Raul só em:** se descobrir que uma permissão atual tá quebrada ou diferente do esperado; se a Variante A não couber em alguma resolução de tela
- **Mergeia:** Raul, ao revisar cada PR
