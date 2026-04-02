

## Reestruturação da Navegação do BI — Plano

### Situação Atual
A página `/bi` possui 11 abas horizontais em uma `TabsList` com scroll. Os componentes são: AbaLicitacoes, AbaInteligenciaCompetitiva, AbaContratos, AbaAges, AbaMedicos, AbaRelacionamento, AbaFinanceiro, AbaDisparos, AbaEscalas, AbaDrEscala, AbaTI.

### Proposta de Navegação

Substituir as abas horizontais por uma **barra de categorias com dropdowns**. Cada categoria é um botão que abre um popover/dropdown com os módulos internos.

```text
┌──────────────────────────────────────────────────────────┐
│  [Comercial ▾]  [Operacional ▾]  [Pessoas ▾]  [Financeiro ▾]  [TI]  │
└──────────────────────────────────────────────────────────┘

Comercial ▾         Operacional ▾      Pessoas ▾        Financeiro ▾
├─ Licitações       ├─ Escalas          ├─ Médicos        ├─ Financeiro
├─ Competitiva      └─ AGES             └─ Relacionamento └─ Contratos
└─ Disparos

TI (sem dropdown — link direto)
```

O módulo selecionado fica destacado na barra e o conteúdo renderiza abaixo.

### Mudanças por Arquivo

**1. `src/pages/BI.tsx`** (refatoração principal)
- Remover `Tabs/TabsList/TabsTrigger` do shadcn
- Criar estado `activeModule` (string) controlado por URL param `tab`
- Renderizar novo componente `<BINavigation>` no topo
- Renderizar o componente do módulo ativo condicionalmente
- Remover import/referência de `AbaDrEscala`

**2. Novo: `src/components/bi/BINavigation.tsx`**
- Barra horizontal com botões por categoria
- Cada botão com `Popover` (já existe no projeto) que lista os módulos do grupo
- Ao clicar num módulo, chama `onSelect(moduleKey)`
- Módulo ativo fica visualmente destacado (botão da categoria + item do dropdown)
- Categorias com apenas 1 módulo (TI) funcionam como link direto sem dropdown
- Estrutura de dados dos grupos:
  ```
  Comercial: licitacoes, competitiva, disparos
  Operacional: escalas, ages
  Pessoas: medicos, relacionamento
  Financeiro: financeiro, contratos
  TI: ti
  ```

**3. `src/components/bi/AbaEscalas.tsx`** (integrar Dr. Escala)
- Adicionar filtro "Fonte de Dados" com opções: "Todas", "Dr. Escala", "Manual"
- Quando "Dr. Escala" selecionado, exibir dados/visualizações do hook `useDrEscalaBI` dentro da mesma tela de Escalas
- Reutilizar a lógica existente de `AbaDrEscala.tsx`

**4. `src/components/bi/AbaDrEscala.tsx`**
- Manter o arquivo mas não será mais referenciado como aba independente
- Extrair a lógica de visualização para um sub-componente reutilizável `DrEscalaView` que será importado por `AbaEscalas`

### Detalhes Técnicos

- **URL params**: mantém `?tab=licitacoes` etc. para deep linking
- **Escalabilidade**: adicionar um novo módulo = adicionar entrada no array de categorias
- **Popover**: usa o `Popover` + `PopoverContent` já existente no projeto
- **Responsivo**: em mobile, os grupos viram um menu hambúrguer ou grid 2x2
- **Sem breaking changes**: todos os componentes `Aba*` continuam funcionando internamente

### Ordem de Implementação
1. Criar `BINavigation.tsx` com a estrutura de categorias e dropdowns
2. Refatorar `BI.tsx` para usar a nova navegação
3. Integrar dados de Dr. Escala dentro de `AbaEscalas.tsx` como filtro "Fonte de Dados"
4. Testar navegação e deep links

