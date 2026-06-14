---
tags: [arquitetura, sigma-gss, import, campanhas, planilhas, spec-driven]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-06-14
status: PLANO (aguarda decisões do Raul — ver §7 — antes de executar)
repo: GSS-Interprise/sigma-new
---

# Importação de campanhas manuais passadas (planilhas da Bruna)

> **O que é (1 frase):** trazer as planilhas que a equipe usava pra gerir a prospecção manual pra dentro do Sigma, como **campanhas manuais** — gerando histórico por médico, indicadores, e (no caso da que está em andamento) **revivendo a campanha** pra equipe continuar de dentro do sistema.

## 1. Fontes (analisadas 14/06)
| Arquivo | Médicos | Estado | Colunas |
|---|---|---|---|
| **CNES empresa.xlsx** | 58 | ✅ finalizada | Nome · Especialidade · Instituição · Telefone · Instagram · Email · **Ligação** (desfecho) |
| **Pediatras MG.xlsx** | 4.062 | 🟡 em andamento | (UF) · nome · cidade · especialidade(+RQE) · **telefone_1..5** · **WPP** · Email · Situação email · Ligação · Instagram · Linkedin · **Situação** |

Observações dos dados:
- **WPP** (Pediatras): 1.401 "Enviado" (1ª msg foi) · 2.661 vazio (não contatado).
- **Situação** (Pediatras): 123 "sem interesse" · resto vazio.
- **Ligação** (ambas): desfechos livres ("Não atendeu", "Desligou", "Recusada", "Sem interesse", "Passei proposta por wpp"…).
- Pediatras: 3.246 médicos com >1 telefone; 0 sem telefone. CNES: 8 sem telefone.
- Especialidade Pediatras vem com RQE embutido ("PEDIATRIA - RQE Nº 53291 (...)") → normalizar pra "PEDIATRIA".
- Acentos OK no arquivo (o `�` que aparece no terminal é cp1252 do Windows, não corrupção do dado) — importar em **UTF-8** ([[feedback_encoding_utf8_python]]).

## 2. Alvo no Sigma
- 1 **campanha manual** por planilha (`tipo_envio='manual'`), `status='finalizada'` (CNES) ou `status='ativa'/'pausada'` (Pediatras MG, pra equipe continuar).
- Cada linha → 1 `campanha_leads` ligado a 1 `leads` (achado ou criado) + telefones em `lead_contatos` + desfecho em `lead_historico`/`campanha_lead_touches`.

## 3. Mapeamento de campos
| Planilha | → Sigma |
|---|---|
| nome | `leads.nome` |
| especialidade (strip RQE) | `leads.especialidade` |
| cidade / UF | `leads.cidade` / `leads.uf` |
| telefone_1..5 / Telefone | `lead_contatos` (tipo=whatsapp, is_primary no telefone_1; normaliza E.164) |
| Email | `leads.email` / `lead_contatos` (tipo=email) |
| Instituição (CNES) | metadado do `campanha_leads` (não vincula ao catálogo de hospitais na v1) |
| Instagram / Linkedin | `lead_contatos` (se preenchido) |

## 4. Mapeamento de status/desfecho
| Sinal na planilha | `campanha_leads.status` | resultado/motivo |
|---|---|---|
| WPP = "Enviado" (Pediatras) | `contatado` | touch "1ª msg (importado)" |
| WPP vazio (Pediatras) | `frio` | — (vira "Pendente" → equipe continua) |
| Situação = "sem interesse" | `descartado` | motivo_perdido "sem interesse" |
| Ligação "não atendeu/desligou/recusada" | `contatado` ou `sem_resposta` | touch de ligação + motivo |
| Ligação/Email "passei proposta por wpp" | `contatado`/`em_conversa` | touch "proposta enviada" |
| CNES (finalizada), sem desfecho positivo | `descartado`/`sem_resposta` | — |

Cada desfecho também vira um **registro em `lead_historico`** (tipo evento + descrição), com data = data de importação (as planilhas não têm timestamp por ação) e **origem marcada como `import_planilha`**. **Nenhum disparo real é feito** — é só registro histórico.

## 5. Estratégia de match / dedup (o ponto crítico)
Pra cada linha, achar o `leads` existente antes de criar (evita duplicar a base de 796k):
1. **Por telefone** (mais confiável): normaliza cada telefone → `find_lead_by_phone_fuzzy` (últimos 8 dígitos, já existe). Tenta telefone_1..5.
2. Se não achou → **por nome normalizado + especialidade** (uppercase, sem acento, trim).
3. Se ainda não achou → **cria lead novo** (são médicos reais; valem pra base + histórico).
4. Idempotência: a importação grava `metadados.import_origem` + hash da linha; re-rodar não duplica `campanha_leads` (UNIQUE campanha_id+lead_id já existe).

## 5.1 Resultado do dry-run de match (14/06 — dados reais)
Cruzei os telefones das planilhas com `leads.phone_e164` + `lead_contatos` (sufixo 8 dígitos), e os não-achados por nome (trgm):

| Planilha | Achados por telefone | Restantes (por nome ≥0.5) | Realmente novos |
|---|---|---|---|
| **Pediatras MG** (4.062) | **4.041 (99%)** | 21 | ~0 |
| **CNES empresa** (58) | 14 (24%) + 8 sem telefone | 44 batem por nome | ~0 |
| **Total** | ~4.055 por telefone | 65 por nome | **~0 a criar** |

**Conclusão:** praticamente **100% dos médicos já existem na base** (telefone forte; o resto bate por nome). Quase nada a criar. ⚠️ Os 65 por-nome (sim≥0.5) precisam de **conferência no dry-run** (risco de homônimo) antes do commit.

**Task de contato pra todos? Sim:** cada médico vira `campanha_leads`. Pediatras → WPP vazio (2.661) = `frio` + task **"1º contato"** (Pendente, equipe continua); WPP "Enviado" (1.401) = `contatado` + touch histórico. CNES (finalizada) → status pelo desfecho da Ligação, sem task aberta. Mecanismo de task já existe (`campanha_lead_tasks` + cadência manual).

## 6. Execução (proposta)
- **Script Python controlado** (one-time, não UI — é importação pontual), via Management API/service_role:
  1. **Dry-run**: lê planilha, normaliza, roda match, e **gera relatório** (quantos match por telefone / por nome / novos / sem telefone / por status) SEM gravar. Raul revisa.
  2. **Commit**: cria campanha + insere leads/contatos/campanha_leads/histórico em lote, em transação, idempotente.
  3. **Validação**: contagens batem com a planilha; amostra conferida.
- Alternativa se a equipe quiser repetir sozinha no futuro: virar uma tela de import (fase 2, fora do escopo agora).

## 7. Decisões pendentes (Raul) — preciso antes de executar
1. **Médico sem match → criar novo lead ou pular?** (recomendo **criar** — médico real, vale pra base.)
2. **Pediatras MG: importar os 4.062** (inclui 2.661 não-contatados como "Pendentes" pra continuar) **ou só os 1.401 já contatados?** (recomendo **todos** — revive a campanha.)
3. **Instituição (CNES)** vira só metadado, ou vincula ao catálogo de hospitais? (recomendo **metadado** v1.)
4. **Status da campanha Pediatras MG:** `ativa` (equipe continua disparando do Sigma) ou `pausada` (só histórico, sem disparo)? (recomendo **pausada** até validar, pra não disparar sem querer.)
5. **Telefones múltiplos** → todos viram contato (primary=telefone_1)? (recomendo **sim**.)
6. Confirmar nomes das campanhas: "CNES empresa (importada)" e "Pediatras MG (importada)".

## 8. Riscos / pegadinhas
- **Disparo acidental:** a campanha Pediatras importada NÃO pode disparar sozinha. Importar com `cadencia_ativa=false` e (se `ativa`) sem chip, OU `pausada`. Validar antes de qualquer disparo.
- **Duplicação de lead:** match fraco gera médico duplicado. Dry-run + revisão obrigatórios.
- **Telefone inválido/sem DDD:** normalização E.164 pode falhar → marcar "sem_telefone" em vez de criar contato lixo.
- **Encoding:** ler/gravar UTF-8 (acentos nos nomes).
- **Volume (4k):** inserir em lote/transação; não 4k requests soltos.
- **Sem timestamp por ação:** histórico fica com data de import (não dá pra reconstruir quando cada msg foi). Indicadores temporais ficam ancorados na data de import — comunicar à gestão.

## 9. Pipeline
plano (este doc) → decisões §7 → script dry-run → Raul revisa relatório → commit → validação. Começar pela **CNES** (58 linhas, finalizada = mais simples) como piloto, depois **Pediatras MG** (4k, em andamento).
