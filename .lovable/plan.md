

## Agrupamento visual das abas em Fases — com header destacado

Reorganizar a `TabsList` do `CampanhaPropostaModal` aplicando o **mesmo padrão visual da imagem de referência** (header verde "FASE 1") para os dois grupos.

### Layout proposto

```text
┌──────────┐  ┌─[ FASE 1 ]──────────────┐  ┌─[ FASE 2 ]──────────────────────────────┐
│ Cascata  │  │ WhatsApp │ Tráfego Pago │  │ Email │ Instagram │ Ligação │ LinkedIn │ TikTok │
└──────────┘  └─────────────────────────┘  └─────────────────────────────────────────┘
```

### Estilo dos blocos de fase (igual à imagem)

Cada grupo de fase é um container com:
- **Header**: faixa superior em `bg-primary` (verde), `text-primary-foreground`, label centralizado em maiúsculas (`FASE 1`, `FASE 2`), pequeno (`text-xs font-bold tracking-wider`), padding `px-4 py-1`, cantos arredondados só no topo (`rounded-t-md`).
- **Corpo**: `border-2 border-primary` (mesma cor do header), `rounded-b-md`, `bg-background`, padding interno `p-2`, contendo os triggers das abas em `flex gap-1`.
- A "moldura" inteira (header + corpo) forma um bloco coeso, exatamente como o destaque verde em volta de "WhatsApp" / "Tráfego Pago" na imagem.

A aba **Cascata** fica num bloco separado **sem header de fase** (é visão geral), apenas com borda sutil `border border-border rounded-md p-2`.

### Estilo dos triggers

- **Inativo**: fundo transparente, ícone `text-muted-foreground`, label `text-sm`.
- **Ativo**: `bg-primary/10`, `ring-2 ring-primary`, ícone na cor do canal (verde para WhatsApp, etc.), label em `font-semibold text-foreground`, leve `shadow-sm`.
- Largura mínima `min-w-[88px]` para evitar "pulo" ao trocar.

### Mudanças no código

`src/components/disparos/CampanhaPropostaModal.tsx`:
- Definir array de grupos:
  ```tsx
  const GRUPOS = [
    { fase: null,     abas: ["cascata"] },
    { fase: "FASE 1", abas: ["whatsapp", "trafego_pago"] },
    { fase: "FASE 2", abas: ["email", "instagram", "ligacao", "linkedin", "tiktok"] },
  ];
  ```
- Substituir o `TabsList` único por um wrapper `flex flex-wrap gap-3 items-stretch` contendo um `<TabsList>` com `className` neutro (`bg-transparent p-0 h-auto flex flex-wrap gap-3`) — Radix continua funcionando porque os triggers permanecem como filhos de um único `TabsList`.
- Renderizar cada grupo:
  - Se `fase` existe → wrapper com header verde + corpo bordado.
  - Se não → wrapper simples para a Cascata.
- Cada `TabsTrigger` recebe className com os estados `data-[state=active]:bg-primary/10 data-[state=active]:ring-2 data-[state=active]:ring-primary data-[state=active]:shadow-sm`.

Sem mudanças em `tabs.tsx` — toda customização via `className` no consumidor.

### Resultado

- Identifica-se à primeira vista que **WhatsApp + Tráfego Pago = Fase 1** e que os outros canais formam a **Fase 2**, ambos com a mesma moldura verde com header (consistente com o destaque mostrado na imagem).
- Aba ativa fica nitidamente marcada com anel verde + fundo suave.
- Cascata permanece como visão geral, separada mas no mesmo nível visual.

