---
tags: [arquitetura, sigma-gss, insights, conversas, ia, bi, spec-driven]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-14
status: PLANO (aguarda decisões §6 antes de executar)
repo: GSS-Interprise/sigma-new
---

# Insights de Conversas — conversa vira dado pra GSS decidir

> **O que é (1 frase):** toda conversa com médico vira **dado estruturado e agregável** (forma de pagamento preferida, valor, região, objeções, temas emergentes) que aparece no **BI** pra GSS tomar decisão — não fica enterrado no texto da conversa.

## 1. Problema (por que nasceu)
Pedido Raul (entrega crucial do contrato): "as conversas precisam gerar insights — médico diz que prefere pagar por pessoa atendida, outro por plantão, e uma infinidade de coisas". Hoje isso some no histórico. Precisa virar dado pra decisão.

## 2. Estado atual (auditado 14/06)
- **Já existe** o edge `lead-perfil-extrator` (GPT-4o-mini) → grava em `banco_interesse_leads`: `tipo_contratacao_preferida`, `modalidade_preferida` (inclui **`producao`** vs `plantao_12h/24h/rotina/sobreaviso` = exatamente "por produção vs por plantão"), `valor_minimo_aceitavel`+unidade, `ufs`, `cidades`, `dias_preferidos`, `periodo_preferido`, `disponibilidade_plantoes_mes`, `observacoes_ia` (texto livre), `confianca_score`.
- 🔴 **Mas quase não roda:** só **2 perfis** extraídos (0 com modalidade), **sem cron**, enquanto **183 leads** já têm conversa (≥4 msgs). Cobertura ~1%.
- 🔴 **Objeções/temas ficam em texto livre** (`observacoes_ia`) → não dá pra agregar/contar.
- 🔴 **Nada disso aparece no BI** — GSS não vê os padrões.

## 3. Solução desenhada (sistema completo)

### F1 — Schema: insights agregáveis
Adicionar a `banco_interesse_leads`:
- `forma_pagamento_preferida text` — `por_plantao | por_producao | por_hora | fixo_mensal | misto` (cristaliza o exemplo do Raul; complementa modalidade).
- `objecoes text[]` — **taxonomia fixa** (agregável): `valor_baixo`, `distancia`, `ja_tem_vinculo`, `carga_horaria_alta`, `prefere_outra_regiao`, `burocracia_documentos`, `sem_interesse_no_momento`, `desconfianca`, `outro`.
- `temas text[]` — **tags livres emergentes** da IA (a "infinidade de coisas"): ex `interesse_telemedicina`, `so_fins_de_semana`, `exige_alojamento`, `quer_carteira_assinada`, `aceita_viajar`. Captura o que a taxonomia fixa não previu.
+ GRANT/índice (GIN nos arrays pra filtro).

### F2 — Extrator enriquecido
Atualizar `lead-perfil-extrator`: além dos campos atuais, retornar `forma_pagamento_preferida`, `objecoes[]` (da taxonomia) e `temas[]` (livres, snake_case curtos). Deploy.

### F3 — Cobertura (o que falta de verdade)
- **Backfill:** rodar o extrator nos 183 leads com conversa (edge em lote / cron one-shot).
- **Contínuo:** cron que roda o extrator periodicamente nos leads com conversa nova/≥N msgs ainda não extraídos (ou stale > X dias). Sem isso, insight não acumula.

### F4 — BI: aba "Insights de Conversas"
Nova aba no `/bi` (ou seção no Resumo da Prospecção), 100% visual:
- **Cards:** cobertura (X médicos com perfil de Y com conversa), confiança média.
- **Forma de pagamento preferida** (donut): % por_plantão / por_produção / por_hora / fixo.
- **Valor desejado** (faixa/média) por modalidade.
- **Top regiões desejadas** (UF/cidade) — barras.
- **Top objeções** (barras) — por que não fecham.
- **Top temas** (nuvem/ranking de keywords) — a "infinidade de coisas" emergente.
- **Especialidades de interesse** declaradas.
- Drill: clicar num insight → lista de médicos (liga com o filtro retroativo A1).

### F5 — Views agregadas
`vw_insights_conversas` (distribuições) + reuso de `banco_interesse_leads` pro drill.

## 4. Por que assim (decisões de design)
- **Híbrido taxonomia fixa + tags livres:** objeções padronizadas = agregável e confiável; temas livres = capturam o imprevisto sem travar num enum. Melhor que só-fixo (perde nuance) ou só-livre (não agrega bem, vira sinônimo solto).
- **Reusa o extrator existente** (não duplica) — só enriquece o prompt + schema.
- **Cron é o que destrava** — o sistema já existia mas não rodava; cobertura é o gap real.

## 5. Fora de escopo (v1)
- Análise de sentimento por mensagem.
- Sumarização de áudio além do que o multimodal já faz.
- Normalização semântica de temas livres (merge de sinônimos) — v2 se a nuvem ficar ruidosa.
- Re-treinar/fine-tune — é prompt + GPT-4o-mini.

## 6. Decisões pendentes (Raul)
1. **Objeções/temas:** híbrido (taxonomia fixa + tags livres) — confirma? (recomendo sim)
2. **Onde no BI:** aba nova "Insights de Conversas" no /bi, ou seção dentro do Resumo da Prospecção? (recomendo aba nova — tema grande)
3. **Cobertura:** backfill nos 183 agora + cron contínuo (ex: a cada 2h nos leads com conversa nova)? (recomendo sim)
4. **`forma_pagamento_preferida` dedicado** além de modalidade — ok? (recomendo sim, deixa o "por pessoa atendida vs plantão" cristalino pro BI)

## 7. Critério de pronto
- [ ] Extrator enriquecido (forma_pagamento + objecoes[] + temas[]) deployado.
- [ ] Backfill: ~183 leads com conversa extraídos; cron rodando.
- [ ] Aba "Insights de Conversas" no BI: forma de pagamento, valor, regiões, objeções, temas — agregados e visuais.
- [ ] GSS consegue responder "quantos preferem produção? top objeção? regiões mais pedidas?" num relance.
- [ ] Raul valida.

## 8. Pipeline
plano (este doc) → decisões §6 → F1 schema → F2 extrator+deploy → F3 backfill+cron → F4/F5 BI → revisão → push → publish.
