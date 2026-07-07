---
name: mobile-responsivo
description: Convenções de responsividade mobile do SigmaGSS. Use SEMPRE ao criar ou editar qualquer tela, página, dialog, tabela, header ou componente do front (React + Vite + Tailwind + shadcn), e ao corrigir bugs de layout no celular. O app é usado no navegador mobile (iPhone Safari / Android Chrome), então tudo precisa funcionar bem em telas a partir de 360px.
---

# Mobile-responsivo — SigmaGSS

O SigmaGSS é acessado no **navegador do celular** (não é app nativo). O breakpoint mobile é **768px** (`useIsMobile`, `src/hooks/use-mobile.tsx`). Toda tela precisa funcionar bem a partir de **360px**. Estas são as convenções já validadas no projeto — siga-as ao construir ou corrigir.

## Regras de ouro (memorize)

1. **Nunca `100vh` / `h-screen` sozinho.** No iOS Safari, `100vh` inclui a área atrás da toolbar → conteúdo do rodapé (barras de digitação, botões) some. Use **`h-[100dvh]`** (dynamic viewport). O `AppLayout` já usa `h-screen h-[100dvh]`.

2. **Header nunca com altura fixa que corta.** O header do `AppLayout` é `min-h-16` (não `h-16`) e empilha no mobile. Ao passar `headerActions` numa página, use o padrão:
   ```tsx
   <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 w-full">
     <div className="min-w-0">
       <h1 className="text-lg sm:text-2xl font-bold truncate">Título</h1>
       <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">Subtítulo</p>
     </div>
     <div className="flex items-center gap-2 flex-wrap">{/* botões */}</div>
   </div>
   ```
   Subtítulo `hidden sm:block`. Botões grandes: considere `size="sm"` e ícone-only no mobile (`<span className="hidden xs:inline">Texto</span>`).

3. **Abas (`TabsList`) com muitos triggers → scroll horizontal**, nunca `grid-cols-N` fixo:
   ```tsx
   <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
     <TabsList className="w-max sm:w-full">{/* triggers */}</TabsList>
   </div>
   ```

4. **Tabelas largas** sempre dentro de `<div className="overflow-x-auto">` (o wrapper do shadcn `Table` já faz, mas confira em tabelas custom).

5. **Layouts de 2 colunas / sidebars fixas (`w-80` etc.)** não cabem no mobile. Padrão: no mobile vira **lista → detalhe** (uma coisa por vez, com botão "voltar"). Ex.: `src/pages/Comunicacao.tsx` (lista de canais → conversa). Use `useIsMobile` + classes condicionais (`isMobile ? (selecionado ? "flex" : "hidden") : "flex"`).

6. **Grids com altura fixa (`h-[calc(100vh-Nrem)]`) só no desktop:** `h-auto md:h-[calc(...)]` e `md:h-full` no grid interno. No mobile deixe empilhar com altura natural.

7. **Alvos de toque ≥ 44px** (botões/ícones clicáveis). `size="icon"` do shadcn (h-10 w-10) está ok; evite botões menores que h-9 pra ações principais.

8. **`grid-cols` sempre responsivo:** `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, nunca `grid-cols-4` fixo.

9. **Breakpoint `xs` = 480px** existe no `tailwind.config.ts` (`extend.screens.xs`). Use pra decidir quando mostrar rótulos de botão/aba no mobile.

## Navegação mobile

- A sidebar vira **drawer** no mobile. O `AppLayout` tem o `<SidebarTrigger>` (☰) no header (`md:hidden`) que abre o drawer + um atalho de Comunicação. Não remova.

## Checklist antes de fechar uma tela

- [ ] Abre em 360px sem scroll horizontal (nada mais largo que a viewport).
- [ ] Header não sobrepõe (título/botões empilham; nada em cima do sino).
- [ ] Barras/botões de rodapé visíveis (sem `100vh`).
- [ ] Abas com muitos itens rolam, não espremem.
- [ ] Tabela larga rola horizontalmente dentro do card.
- [ ] Sidebar/2-colunas viram lista→detalhe.
- [ ] Alvos de toque confortáveis.

## Como verificar (ver o mobile de verdade)

1. **DevTools device mode** (rápido, no PC): F12 → Ctrl+Shift+M → escolher "iPhone 12/15".
2. **Playwright MCP** (se configurado no `.mcp.json`): emula iPhone e tira screenshot pra auto-verificação. Perfil persistente em `./.pw-profile` (logar uma vez).
3. Complementar: rodar `/impeccable adapt <tela>` e `/impeccable audit <tela>` (responsividade + a11y).

## Anti-alucinação

- Não invente breakpoints além de `xs sm md lg xl 2xl`.
- `100vh` no iOS é bug garantido — sempre `100dvh`.
- Se não conseguir ver o mobile renderizado, os bugs de responsividade ainda são determinísticos no código (largura fixa, falta de prefixo responsivo, `100vh`, `grid-cols` fixo). Corrija por análise + confirme com screenshot (usuário ou Playwright).
