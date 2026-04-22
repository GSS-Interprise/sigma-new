

## Problema

No dossiê da proposta, leads que já foram contactados (têm raia aberta, mensagem enviada, etc.) aparecem como **"A contactar"** — quando deveriam aparecer como **"Contactado"**.

A confusão é que existem dois conceitos diferentes que estavam misturados:

- **Contactado** = situação do lead (já recebeu mensagem, foi chamado). É o que aparece na coluna "Status".
- **Em aberto / Aberto na raia** = situação operacional (precisa fechar ou mandar para próxima fase). É o que controla os botões de ação.

Hoje a view `vw_lead_status_por_proposta` está retornando `'em_aberto'` quando o lead tem raia aberta, e o frontend trata isso como categoria separada de "Contactado". Resultado: o operador vê "A contactar" em alguém que já recebeu mensagem.

## Regra correta

Um lead com raia aberta É um lead contactado. "Aberto" é só o estado operacional (tem ação pendente). O status de relacionamento é sempre **Contactado** assim que houve qualquer envio/raia.

| Situação                                    | Status mostrado | Ações disponíveis        |
|---------------------------------------------|-----------------|--------------------------|
| Sem raia, sem envio                         | A contactar     | (enviar mensagem)        |
| Tem raia aberta OU mensagem enviada         | **Contactado**  | Encerrar, Próxima fase   |
| Raia fechada como `encerrado`/`movido` etc  | Fechado         | (nenhuma)                |

## O que muda

### 1. Banco — corrigir `vw_lead_status_por_proposta`

Recriar a view para que o `CASE` retorne:
- `'fechado_proposta'` se todas as raias estão fechadas com status final
- `'contactado'` se há raia aberta OU houve mensagem outbound registrada
- `'a_contactar'` apenas quando não há raia nem envio

Ou seja, eliminar o estado intermediário `'em_aberto'` da view — ele vira `'contactado'`.

### 2. Frontend — `useLeadStatusProposta.ts`

Remover `'em_aberto'` do tipo `StatusProposta`. Manter só:
- `'a_contactar'`
- `'contactado'`
- `'fechado_proposta'`

### 3. Frontend — `CampanhaLeadsList.tsx`

**a) Coluna Status**: vai mostrar "Contactado" automaticamente para qualquer lead com raia aberta (a fonte é a view corrigida).

**b) Lógica das ações** (botões Encerrar / Próxima fase): continua baseada em `tem raia aberta` (campo separado da view, ex: `bloqueado_*` ou nova flag `tem_raia_aberta`). Status visual e disponibilidade de ação ficam desacoplados.

**c) Otimização visual da lista** (pedido anterior reforçado):
- Reduzir altura da linha: `py-2` em vez de `py-4`, fonte do nome 14px, telefone/email 13px.
- Status badge menor: remover quebra de linha "A / contactar", usar `whitespace-nowrap` + `text-xs`.
- Botões de ação com ícone-only em telas <1280px (tooltip no hover) e label visível em telas maiores.
- Coluna "#" com largura fixa estreita (40px).
- Selecionar (checkbox) com largura fixa 32px.
- Diminuir padding lateral das células de `px-4` para `px-3`.
- Resultado: cabe ~50% mais leads na mesma altura de tela.

### 4. Filtros de topo

A pílula "Em aberto" vira **"Contactados em aberto"** (subset de Contactado com raia aberta) — ou some se preferir simplificar. Decisão: manter como subfiltro visual, contagem usando flag `tem_raia_aberta` da view, mas o badge de status na linha sempre diz "Contactado".

## Arquivos alterados

- nova migration SQL — recriar `vw_lead_status_por_proposta` com `tem_raia_aberta` como coluna separada e status consolidando "contactado"
- `src/hooks/useLeadStatusProposta.ts` — atualizar tipo `StatusProposta` e expor `tem_raia_aberta`
- `src/components/disparos/CampanhaLeadsList.tsx` — coluna Status usa novo valor; layout compactado; lógica de filtros ajustada
- `src/integrations/supabase/types.ts` — regenerado automaticamente

## Resultado

- Lead que recebeu mensagem aparece como **Contactado** em todo lugar (dossiê, kanban, métricas).
- Botões "Encerrar" e "Próxima fase" continuam aparecendo só quando tem raia aberta.
- Lista mais compacta e visual, foco em ação rápida.

