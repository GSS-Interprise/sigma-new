# Handoff — CRM AGES forkando do Sigma (lições da frente de licitações)

> **Pra quem é isto:** a sessão/dev que está montando o CRM da AGES reaproveitando código do Sigma.
> Escrito em 2026-07-22, no fecho de uma investigação que consertou 5 bugs de produção na
> cadeia Effecti → n8n → Sigma → PNCP. Cada seção existe porque um desses bugs custou dias.
> Contexto vivo do espelho PNCP: `docs/arquitetura/licitacoes-espelho-pncp.md`.

## 0. O princípio que resume tudo: falha silenciosa com cara de sucesso

Os cinco incidentes desta semana tiveram a MESMA assinatura — o sistema reportava sucesso
enquanto não fazia nada (ou fazia a coisa errada):

| Incidente | "Sucesso" aparente | Realidade |
|---|---|---|
| Espelho PNCP congelado 5 dias | `sync_state` todo "completo", zero erros | dia selado vazio à meia-noite, nunca revisitado |
| Comparador Effecti 100% | cobertura 100%/dia | critério tautológico ('ausente' impossível por construção) |
| Captador AGES invisível 16 dias | `workflow.success` de hora em hora | n8n rodava VERSÃO VELHA (salvar ≠ ativar) |
| Cards renascendo ("descarto e volta") | POST 200 toda hora | `maybeSingle()` com duplicata → erro → insert infinito |
| Deploy quebrou auth do n8n | `Deployed` | deploy sem `--no-verify-jwt` reativou JWT check |

**Regra pro CRM novo:** todo loop de sincronização nasce com um alarme de
"nada processado há N horas" e um contador de trabalho útil (linhas gravadas), não só de
execuções. Execução sem trabalho é o sintoma nº 1.

## 1. NÃO forkar o espelho PNCP — compartilhar

`pncp_mirror` (452k+ registros, todas as modalidades, Brasil inteiro) é UM só e serve
qualquer cliente. Cliente novo = linha em `licitacao_captura_perfis` (termos + modalidades +
UF + destino). Forkar o espelho = pagar a varredura duas vezes e DOBRAR a pressão no
rate-limit do PNCP — que já nos bloqueou em produção (nosso drain roda a cada 3 min e
consome a cota; consultas ad-hoc levam HTTP 429/503).

Peças 100% reutilizáveis, sem acoplamento GSS:
- `municipios_ibge` (5.571, fonte IBGE) + `ufs_ibge` + `resolve_municipio_ibge()` —
  resolvedor de nome sujo → código IBGE, 3 níveis (exato / contido / trigram ≥0.55 travado
  por UF). Devolve `metodo` de propósito: "não resolvi" é bucket próprio, nunca vira
  falso-negativo silencioso.
- `pncp_casa_effecti_ibge()` v2 + `pncp_cobertura_medir()` — casamento e medição por código
  IBGE, tudo em SQL puro pra ser auditável rodando à mão (`scripts/pncp_casa_effecti_ibge_v2.sql`,
  `scripts/pncp_cobertura_medir.sql`).

## 2. Dados sujos: NUNCA casar município por string

O que já chegou da Effecti: encoding comido (`"ão rancisco do Oeste"` = São Francisco do
Oeste, `"lves"` = Luiz Alves), município TROCADO (`Ipirá/BA` gravado como `Itajaí - SC`),
separador inconsistente (`" - SC"`, `"/SC"`, `"/Santa Catarina"`, ausente), consórcio no
lugar de município (CONSAUDE, CISSUL, CONISA), nome de estado como município, duplicata
literal. Título e campo `municipio_uf` divergem em ~5% — **nenhum dos dois é autoridade**:
resolva OS DOIS pro IBGE e deixe o número do edital desempatar.

Número de edital: o `numeroCompra` do PNCP vem com ano e sufixo colados (`"34/2026"`,
`"003/2026– SMS/PMLA"`). Comparar dígito-a-dígito concatenado NÃO funciona — compare grupo
numérico como INTEIRO (mata zero à esquerda dos dois lados). O `numero_edital` da Effecti
no Sigma é o ID interno dela, NÃO o número real do edital — o real só existe no título.

## 3. Arquitetura atual do fluxo AGES (e a decisão pendente)

```
Effecti (conta contato@agesaude.org.br, perfil 12631)
  → n8n "captador ages" (o8h7xfR7nGDaH6Rf, cron horário 6-18h, TZ -03)
  → POST api-licitacoes (token sigma_..., NÃO é JWT)
  → tabela licitacoes com effect_id = <id>+"33" e etiquetas ["AGES"]
  → ages_licitacoes é tabela de ACOMPANHAMENTO (FK licitacao_id), não inbox
```

O sufixo `"33"` separa o card AGES do card GSS do MESMO edital (contas diferentes favoritam
o mesmo aviso; o ID do aviso é global na Effecti). Efeito: edital favoritado pelas duas
empresas aparece 2×, um card por empresa — **por desenho**. Avise a equipe.

**Decisão pendente pro CRM novo:** se o CRM AGES for app separado, o destino do captador
muda de `api-licitacoes` (Sigma) pra API própria do CRM. Fazer a troca ATÔMICA e comunicada —
dois destinos ativos em paralelo sem combinar recria a confusão de "não tá chegando".

## 4. Armadilhas n8n (custaram 16 dias de captador invisível)

- **Salvar workflow ≠ ativar versão.** O n8n versiona; a produção roda `activeVersionId`,
  que NÃO avança quando você edita e salva. O captador AGES rodou 16 dias numa versão velha
  com o fix já salvo do lado. Confira `versionId == activeVersionId` (via
  `n8n export:workflow`) depois de QUALQUER edição. Via CLI: `import:workflow` deixa
  inativo; `update:workflow --id=X --active=true` publica; **restart obrigatório** pra
  instância carregar.
- **NUNCA `docker restart` em container de Swarm** — o Swarm sobe um substituto e o
  reiniciado vira zumbi duplicado (tivemos 2 n8n simultâneos por 3 min = cron em dobro).
  Use `docker service update --force disparador_n8n`.
- Execuções bem-sucedidas NÃO são persistidas no banco do n8n (só event log
  `~/.n8n/n8nEventLog*.log`). Debug de "rodou mas não fez nada" = grep no event log,
  contando eventos por nó.
- O dedup próprio do captador (`licitacoes_processadas_ages` no Postgres genzMemory) nunca
  funcionou — hoje é inofensivo porque a idempotência da API segura, mas não confie nele.

## 5. Armadilhas api-licitacoes / Supabase (se copiar o padrão)

- **Idempotência:** casa por `effect_id` → `licitacao_codigo`, com
  `.order().limit(1).maybeSingle()`. O `.limit(1)` é VITAL: `maybeSingle()` com linhas
  duplicadas LANÇA erro, e erro tratado como "não existe" = insert infinito (18 cópias do
  mesmo edital em 2 dias — o "eu descarto e volta" da equipe).
- **Update via n8n preserva campos humanos** (`status`, `responsavel_id`, `etiquetas`...) —
  manter esse contrato no CRM novo, senão o robô reseta triagem da equipe a cada hora.
- **Guard de descarte:** POST n8n de edital presente em `licitacao_descartes` responde
  `skipped`, não recria. Descarte da equipe é decisão final; robô não ressuscita card.
- **`verify_jwt`:** o token dos captadores (`sigma_...`) NÃO é JWT. A entrada
  `[functions.api-licitacoes] verify_jwt = false` no `config.toml` é obrigatória — deploy
  sem ela (ou sem `--no-verify-jwt`) derruba a captação inteira com "Invalid JWT".
- **GRANT após CREATE TABLE via SQL direto** (`GRANT ... TO authenticated, service_role`),
  senão edge quebra com 42501 em runtime.
- `column_id` inválido no POST não dá erro — fallback silencioso pro status default. Se o
  CRM novo usar kanban próprio, valide o mapeamento com um SELECT antes de ativar.

## 6. Sobre depender só do PNCP (contexto comercial)

Auditoria de 258 licitações da Effecti (janela limpa 01/06–14/07): ~91,5% casadas no
espelho com critério rigoroso; **zero municípios ausentes do PNCP confirmados** após
verificação ao vivo (os "ausentes" eram janela temporal do espelho — cobertura começa em
2025-12-15 com varredura sistemática desde 2026-04-01 — ou numeração divergente). Restam
~7 casos individuais possivelmente fora do PNCP (0,4–2,7%), verificação por objeto
inconclusiva por rate-limit. Tradução comercial: PNCP cobre a grande maioria; existe cauda
pequena de prefeituras que publicam fora. Vender como "cobertura PNCP automatizada com
curadoria", não como "tudo que qualquer agregador pega" — até fechar esse número.
