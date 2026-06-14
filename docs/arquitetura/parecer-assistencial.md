---
tags: [arquitetura, sigma-gss, parecer, maikon, kanban, spec-driven]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-14
status: spec (aguarda aprovação do Raul pra executar)
repo: GSS-Interprise/sigma-new
parent: plano-fechamento-contrato.md
---

# Parecer Assistencial — investigação do médico pelo Dr. Maikon

> **O que é (1 frase):** quando um médico chega na etapa de análise, abre **automaticamente** uma tarefa "Fazer parecer do médico", e o Dr. Maikon tem um **módulo centralizado** (login dele) pra dar o parecer de todos os médicos de todas as campanhas — bateu o olho, preencheu, resolveu — com **métricas** do que foi enviado pra ele investigar.

## 1. Problema (por que nasceu)
Mensagem da gestão: *"dr Maikon me pediu pra ver contigo alguma forma da gente metrificar os médicos que enviamos pra ele investigar."* Hoje o Maikon investiga o médico (pergunta a conhecidos, checa reputação) mas: (a) não há gatilho/registro estruturado; (b) ele teria que entrar campanha por campanha; (c) não dá pra **metrificar** (quantos enviados, quantos com parecer, quanto tempo, veredito).

## 2. Estado atual (já existe — reusar, não duplicar)
- **Etapa `em_analise`** ("Em análise") no kanban de acompanhamento (`AcompanhamentoKanban`).
- **`validacao_maikon`** = 1 das 4 validações de `campanha_leads.validacoes` (jsonb `{ok, por, em, obs}`), exigidas pra `prospeccao_aprovar`. RPC `prospeccao_validar(item, ok, obs)`.
- Filtro **"Aguarda Maikon"** em `useAcompanhamentoLeads`.
- **`campanha_lead_tasks`** (tipo, rotulo, status, prazo_at, feita_em, feita_por, observacao) — tasks por lead.
- **Maikon** = usuário `2e0c9567…` (Maikon Lucian Madeira), roles `diretoria, admin`.
- Vale pra **manual e IA**: ambos caem no mesmo `em_analise` → mecanismo único.

## 3. Solução desenhada

### F1 — Dados do parecer (rico + metrificável)
Tabela nova `lead_pareceres` (1 parecer por médico, com histórico):
```
lead_pareceres
  id uuid pk
  lead_id uuid → leads(id)
  campanha_lead_id uuid → campanha_leads(id)  (origem do parecer)
  veredito text  -- apto | apto_com_ressalva | inapto | precisa_mais_info
  investigacao text   -- o que descobriu / com quem falou
  ressalvas text      -- pontos de atenção (opcional)
  parecer_por uuid → auth.users(id)
  created_at, updated_at
```
+ GRANT + RLS + índice. Ao salvar parecer com veredito apto/ressalva → também marca `validacao_maikon.ok=true` (integra com o gate de aprovação que já existe). `inapto` → opção de marcar o lead como perdido (motivo "parecer inapto").

### F2 — Task automática "Fazer parecer do médico"
- Ao mover o lead pra `em_analise` (RPC `prospeccao_mover_etapa`), **inserir idempotente** uma task `campanha_lead_tasks {tipo:'parecer', rotulo:'Fazer parecer do médico'}` se não houver uma aberta.
- Não é pra todos: só quando o lead entra em análise (decisão da equipe move o quente pra "Em análise").
- A task fecha sozinha quando o parecer é salvo (`feita_em`).

### F3 — Módulo do Maikon (centralizado, rápido)
- Rota nova `/parecer` ("Pareceres"), no login do Maikon (gate `adminOrLeader`/diretoria; item na sidebar **Operação clínica** só pra quem tem acesso).
- **Consolidado de TODAS as campanhas** — não por campanha. Lista/kanban dos médicos aguardando parecer (etapa `em_analise` e/ou `validacao_maikon` não ok).
- Card por médico: nome, especialidade, cidade/UF, **resumo IA do perfil** + timeline resumida (contexto pra ele decidir) + **form rápido**: veredito (4 botões) + campo investigação + salvar. "Bateu o olho, preencheu, resolveu."
- Opcional: kanban simples pra ele (A fazer → Feito) ou lista com filtro. **Decisão pendente** (ver §6).

### F4 — Métricas (metrificar)
View `vw_parecer_metricas`: enviados pra parecer, pendentes, concluídos, % por veredito, **tempo médio até o parecer**, por campanha/origem. Alimenta um cabeçalho no módulo do Maikon + entra no BI depois.

## 4. Fora de escopo (v1)
- Integração com fonte externa de reputação (CRM médico, processos) — investigação é manual.
- Parecer multi-revisor / aprovação em cadeia — só o Maikon na v1.
- Notificar o Maikon por WhatsApp quando cai médico novo (pode ser fase 2).

## 5. Riscos / pegadinhas
- **Não duplicar task** ao mover pra em_analise e voltar — insert idempotente (só se não há task de parecer aberta).
- **Integração com as 4 validações:** salvar parecer deve refletir em `validacao_maikon` pra não criar dois lugares de verdade.
- **GRANT/RLS** na tabela nova (senão edge/UI quebra 42501).
- **Volume:** o consolidado pode ter muitos médicos — paginar/filtrar por campanha/especialidade.
- Maikon é admin (vê tudo) — o módulo é pra **foco**, não permissão.

## 6. Decisões pendentes (Raul)
1. **Nome da etapa:** manter "Em análise" ou renomear pra "Parecer Assistencial"?
2. **Vereditos:** apto · apto com ressalva · inapto · precisa mais info — fecha?
3. **Módulo do Maikon:** kanban (A fazer → Feito) ou lista rápida com filtro? (recomendo **lista rápida** — mais "bateu o olho, resolveu").
4. **Inapto:** ao dar parecer inapto, marca lead como perdido automático ou só registra?

## 7. Critério de pronto
- [ ] Lead em "Em análise" gera task "Fazer parecer do médico" (idempotente).
- [ ] Maikon abre `/parecer` e vê todos os pendentes de todas as campanhas, com contexto (perfil IA).
- [ ] Form rápido: 1 clique no veredito + nota → salva, fecha task, reflete em validacao_maikon.
- [ ] Métricas: enviados/pendentes/concluídos/veredito/tempo médio.
- [ ] Build verde + Raul revisa + publica.

## 8. Pipeline
spec (este doc) → aprovação Raul §6 → migration (F1+F4) → RPC/trigger (F2) → módulo `/parecer` (F3) → revisão → push → publish.
