---
tags: [arquitetura, sigma-gss, ws1, chip-ui]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-06
status: em execução (piloto multi-agente)
repo: GSS-Interprise/sigma-new
parent: plano-mestre-maquina-prospeccao.md (WS1)
---

# WS1 — UI de Chip: classificação na criação + avisos de reconexão/reclassificação

> **O que é (1 frase):** a equipe consegue **classificar a instância na hora de criar** (nenhum chip nasce sem categoria) e **ver direto na lista quais precisam reconectar (QR) ou reclassificar** — sem depender do Raul.

## 1. Problema (por que nasceu)
- `EvolutionInstanceDialog` cria a instância **sem `categoria_uso`** → chip nasce `NULL` → quebra a lógica por objetivo (35/dia só pra `prospeccao_ia`, healthcheck por categoria). Hoje 8 chips nasceram sem categoria e foram classificados na mão.
- `InstanciaConfigTab` (lista) **não mostra categoria** nem destaca **"precisa reconectar"** quando o chip está `close`. A equipe não sabe o que fazer sozinha.

## 2. Estado atual (mapeado)
- **`EvolutionInstanceDialog.tsx`** — form de criação (tipo/nome/número/cor) → insert/update em `chips`. NÃO pede categoria. (linha 144-221 = payload; 383-443 = form)
- **`ChipsTab.tsx`** — JÁ tem `CATEGORIAS_USO` (5 opções) + Select de referência (linha 18-24, 274-305). **Reusar.**
- **`InstanciaConfigTab.tsx`** — lista com `.select("*")` (já traz `categoria_uso`); tabela com colunas Instância/Número/Engine/Conexão/Status/Ações (linha 541-657). Tipo `ChipInstance` (linha 38-58) sem `categoria_uso`.
- Valores válidos (`chips_categoria_uso_check`): `prospeccao_ia`, `manual`, `pessoal_restrito`, `suporte`, `inbound`.

## 3. Solução desenhada
### T1 — Categoria na criação (`EvolutionInstanceDialog`)
- Select de `categoria_uso` no form (reusar CATEGORIAS_USO do ChipsTab).
- Default inteligente por tipo: `trafego_pago` → `inbound`; `disparos` → `prospeccao_ia` (editável).
- **Obrigatório** (valida antes de criar) → nenhum chip nasce NULL.
- Incluir `categoria_uso` no INSERT e no UPDATE de `chips`.

### T2 — Coluna + avisos na lista (`InstanciaConfigTab`)
- Adicionar `categoria_uso: string | null` ao tipo `ChipInstance`.
- Nova coluna **"Categoria"**: badge com o label; se `null` → badge 🟡 **"Reclassificar"**.
- Quando `connection_state !== 'open'` → badge 🔴 **"Reconectar WhatsApp"** em destaque (além do botão QR que já existe).
- Busca passa a considerar categoria (opcional).

## 4. Fora de escopo (v1)
- Timeout/countdown visual do QR (fica pra depois).
- Unificar `InstanciaConfigTab` × `ChipsTab` (duas telas) — refator separado.
- Dashboard de health_score/fase (`chip_state`) — é WS7.
- Migrar/limpar instâncias duplicadas por número (decisão do Raul, via UI).

## 5. Riscos / pegadinhas
- **`categoria_uso` no `behavior_config`?** Não — é coluna própria de `chips`. Inserir no nível raiz do insert.
- **Default por tipo:** ao trocar `tipo_instancia`, atualizar o default de categoria sem sobrescrever escolha manual do usuário.
- **Constraint:** só os 5 valores válidos. Não inventar 'outro'.
- **Lovable rebuild:** mudança em componente força rebuild — manter build verde.
- **Realtime:** a lista tem subscription; categoria nova aparece sozinha.

## 6. Critério de pronto
- [ ] Criar instância exige escolher categoria (não dá pra criar sem) → chip nasce classificado.
- [ ] Lista mostra coluna Categoria; chip sem categoria → badge "Reclassificar".
- [ ] Chip `close`/`connecting` → badge "Reconectar WhatsApp" visível.
- [ ] Build/type-check verde.
- [ ] Revisão adversarial (3 lentes) sem bug bloqueante + PO confirma que bate com este critério.
- [ ] Raul revisa o PR e mergeia.

## 7. Pipeline do piloto (multi-agente)
spec (este doc) → Claude implementa na branch `ws1-chip-ui` → Workflow de revisão (bugs / anti-ban+segurança / regressão+UX) + PO (confere contra §6) → Claude corrige → PR pro Raul.
