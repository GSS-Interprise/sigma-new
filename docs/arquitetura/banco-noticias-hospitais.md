---
tags: [arquitetura, sigma-gss, banco-noticias, hospitais, spec-driven]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-13
status: spec (pronto pra executar)
repo: GSS-Interprise/sigma-new
parent: plano-fechamento-contrato.md (Frente D)
---

# Banco de Notícias — Catálogo de Hospitais + Argumentos

> **O que é (1 frase):** um **catálogo de hospitais** (local, região, especialidades) com **notícias/ocorrências vinculadas** (calote, processo, má reputação) pras captadoras **puxarem como argumento** ao falar com médico — "o tempo passa e elas esquecem".

## 1. Problema (por que nasceu)
- Pedido Maikon via Ramone (10/06): "banco de notícias no Sigma" — banco de hospitais que **não pagam ou têm situação ruim**, pras gurias usarem de argumento com os médicos.
- Hoje vive na cabeça/WhatsApp; some com o tempo. Falta **local pra alimentar e puxar** (exemplo enviado: post de Instagram).

## 2. Estado atual (mapeado)
- **Não existe** tabela `hospitais` nem `*noticia*` no schema (greenfield confirmado, 13/06).
- Hospital hoje aparece só como texto solto em campos de campanha/lead.
- **Decisão Raul:** modelar como **catálogo** (entidade hospital reaproveitável), não nome livre. Cadastro de local, região, especialidades (mais de uma).

## 3. Solução desenhada

### D1 — Modelagem (migration)
```
hospitais
  id uuid pk default gen_random_uuid()
  nome text not null
  cnpj text null
  uf text null, cidade text null, regiao text null   -- região = agrupador (ex: "Vale do Itajaí")
  especialidades text[] default '{}'                  -- multi (alinhar com taxonomia de especialidades existente)
  tipo_local text null                                 -- hospital | UPA | clínica | município ...
  observacoes text null
  ativo boolean default true
  criado_por uuid null, created_at, updated_at

hospital_noticias
  id uuid pk
  hospital_id uuid not null references hospitais(id) on delete cascade
  tipo text not null        -- calote | processo_trabalhista | ma_reputacao | atraso_pagamento | outro
  titulo text not null
  resumo text null
  fonte_url text null        -- link (Instagram, notícia)
  fonte_print text null      -- caminho no Storage (print)
  data_fato date null
  gravidade smallint default 2  -- 1 baixa · 2 média · 3 alta
  tags text[] default '{}'
  criado_por uuid null, created_at
```
- **GRANT obrigatório:** `GRANT SELECT, INSERT, UPDATE, DELETE ON hospitais, hospital_noticias TO authenticated, service_role;` (tabela via SQL direto não ganha GRANT default → edge crasha `42501`). [[feedback_grant_apos_create_table]]
- **RLS:** habilitar; policy `authenticated` pode ler todos; criar/editar = `authenticated` (refinar por role depois). Ajustar conforme `permissoes` se virar módulo.
- **Índice trgm** em `hospitais.nome` (busca rápida por nome, padrão já usado pra 796k leads): `CREATE INDEX ... USING gin (nome gin_trgm_ops);`
- Trigger `updated_at` em `hospitais` (reusar `set_updated_at()` se existir).

### D2 — Catálogo + cadastro (UI)
- Página `/noticias` (ou aba dentro de Captação) — gated `authenticated` (todas as captadoras).
- **Lista/busca de hospitais:** busca por nome (trgm) + filtros UF/região/especialidade/tipo. Card por hospital com nº de notícias + maior gravidade (semáforo).
- **Detalhe do hospital:** dados do local + lista de notícias (título, tipo, gravidade, data, link/print).
- **Cadastro:** form hospital (nome, UF, cidade, região, especialidades multi-select, tipo) + form notícia (tipo, título, resumo, link, upload print → Supabase Storage, data, gravidade, tags).

### D3 — Argumentos no atendimento (fase 2, opcional)
- No card do lead / Modo Foco: busca rápida de hospital por nome → mostra notícias → captadora cola argumento na conversa. Liga o catálogo ao fluxo de prospecção.

## 4. Fora de escopo (v1)
- Scraping/ingestão automática de notícias (Instagram/portais) — cadastro é **manual** por enquanto.
- Vínculo automático hospital ↔ vaga/contrato (D3 é manual; integração com módulo Contratos = futuro).
- Moderação/aprovação de notícias (qualquer captadora cadastra; confiança no time).
- Score de reputação calculado — só gravidade manual na v1.

## 5. Riscos / pegadinhas
- **GRANT esquecido** = edge/UI quebra com `42501`. Incluir no mesmo migration. [[feedback_grant_apos_create_table]]
- **Especialidades:** alinhar com a taxonomia existente (135 especialidades) pra filtro casar — não inventar lista paralela. Decidir se referencia tabela de especialidades ou array livre.
- **Storage de prints:** criar bucket (`hospital-noticias`) + policy; senão upload falha.
- **Duplicata de hospital:** busca trgm na hora de cadastrar pra evitar "Hospital São X" duplicado (avisar "já existe parecido").
- **LGPD/difamação:** notícias são fatos com fonte. Manter `fonte_url`/print obrigatório pra notícia grave (gravidade 3) — evita boato sem lastro.

## 6. Critério de pronto
- [ ] Migration aplicada com GRANT + RLS + índice trgm; tabelas acessíveis pela UI sem `42501`.
- [ ] Cadastrar hospital (com especialidades multi) e notícia (com link/print) funciona.
- [ ] Busca por nome de hospital retorna e mostra notícias + gravidade.
- [ ] Upload de print vai pro Storage e abre.
- [ ] Build verde + revisão sem bloqueante.
- [ ] Raul revisa PR e mergeia; publica.

## 7. Pipeline
spec (este doc) → branch `banco-noticias` → migration (D1) → UI (D2) → revisão → Raul → push main → publish. D3 só após validação do MVP com a equipe.

## 8. Nota comercial
Capacidade **fora dos 4 blocos** (cláusula "alterações de escopo" da proposta). Raul decide: cobrar à parte ou cortesia no fechamento. Não impacta cronograma dos blocos.
