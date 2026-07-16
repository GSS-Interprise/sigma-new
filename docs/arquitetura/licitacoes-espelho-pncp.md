# Espelho PNCP — Substituição da Effecti + Produto de Automação de Licitações

> **Objetivo duplo:** (1) substituir a Effecti na GSS **sem dor** (cobertura ≥ e dado mais rico); (2) transformar a capacidade em **produto replicável** para outros clientes. Doc vivo — atualizar conforme valida.

## 1. Problema com a abordagem antiga

A busca ao vivo no PNCP (`/api/search`, fuzzy, top-N) **nunca garante cobertura** — embaralha data, capa em N resultados, e a API do PNCP é **instável** (durante a construção presenciamos outage total: HTTP 000 em todos os endpoints). Depender de query ao vivo = ficar cego quando a fonte cai e perder editais silenciosamente.

## 2. Arquitetura — espelho + relevância em 2 estágios

```
PNCP (fonte, instável)
  │ pncp-mirror-sync: varre /consulta por DATA × MODALIDADE × PÁGINA (tam 50),
  │ checkpoint retomável, retry/backoff, deadline 110s. SEM filtro de tema.
  ▼
[ pncp_mirror ]  ← ESPELHO completo do Brasil (todas modalidades). Garantia de
  │               cobertura: se está no PNCP, está aqui. Cópia bruta + busca
  │               full-text PT-BR local (forte, nossa — não a fuzzy do PNCP).
  │
  ├─ ESTÁGIO 1 (recall): pncp_relevantes(perfil)
  │    filtro keyword sobre o OBJETO (não órgão), mira SERVIÇO médico.
  │    Precisão ~55% de propósito — só afunila volume sem perder saúde real.
  │    ~150 candidatos / 20k espelho.
  ▼
  ├─ ESTÁGIO 2 (precisão): pncp-classificar (IA gpt-4o, batch)
  │    lê o objeto e decide "é oportunidade real de serviço médico?". Grava
  │    veredito em pncp_triagem (ia_aprovado / ia_rejeitado).
  ▼
[ pncp_triagem ] → tela de triagem humana (decide borderline)
  ▼
  └─ pncp-promote → card no Sigma via api-licitacoes (a MESMA API que a Effecti
       usa hoje) + baixa PDF do edital (/arquivos → bucket editais-pdfs).
       A equipe não muda nada no fluxo de trabalho — muda só a origem.
```

### Por que 2 estágios (achado de validação)
Keyword puro tem **teto de precisão ~55%**: casa pelo órgão ("Secretaria de Saúde" comprando merenda), pega compra de medicamento (a GSS quer SERVIÇO, não compra), e coincidências ("mão de obra de trator", "curso de psicologia"). A precisão de produto vem da IA no estágio 2. O keyword só precisa de **recall alto** (não perder) e afunilar.

## 3. Estado da construção (2026-07-16)

| Peça | O que faz | Estado |
|---|---|---|
| `pncp_mirror` (+ `_sync_state`, `pncp_sync_bump`) | espelho bruto + checkpoint | ✅ aplicado |
| `pncp-mirror-sync` (edge) + cron `pncp-mirror-drain-3min` | varredura resiliente | ✅ rodando — ~20k registros, enchendo |
| `licitacao_captura_perfis` + `pncp_relevantes()` | relevância config-driven (multi-cliente) | ✅ aplicado — perfil `gss-saude`, ~150 candidatos |
| `pncp_mirror.busca_objeto` (v2) | busca só no objeto (corrige falso-positivo de órgão) | ✅ aplicado |
| `pncp_triagem` + `pncp-classificar` (edge IA) | precisão via gpt-4o | ⚠️ **construído, bloqueado por quota OpenAI (429)** |
| `pncp-promote` | leva aprovados pro Sigma + PDF | 🔨 a construir |
| Tela de triagem (front) | fila humana aprovar/descartar | 🔨 a construir |
| Comparador Effecti × espelho | prova de cobertura | 🔨 a construir (espera espelho encher) |

## 4. Gate de corte da Effecti (validações — o que prova "pode remover")

**🔴 Críticas (sem isso, cliente perde licitação):**
1. **Cobertura 1:1** — toda licitação da Effecti aparece no espelho, casada uma a uma. Meta: **100% por 7 dias seguidos**. Casamento heurístico (dados da Effecti no Sigma são pobres: código interno, sem CNPJ/objeto — casar por município + nº edital + modalidade + data).
2. **Fontes fora do PNCP** — quantificar: dos editais da Effecti, quantos % nascem fora do PNCP (portais estaduais, 8.666 residual). Se >0, é o que justificava pagar a Effecti. **Este número decide se vendemos "100%" ou "96%".**
3. **Latência vs prazo** — PNCP publica a tempo da disputa? Medir defasagem Effecti vs PNCP.

**🟡 Importantes (degradam valor):**
4. **PDF/anexos completos** — % de editais com PDF baixável e conjunto completo (edital + TR + planilhas), não só o principal.
5. **SLA de captura** — tempo publicação→Sigma no pior caso (com a instabilidade real do PNCP).

**Critério objetivo de corte:** cobertura 1:1 = 100% por 7 dias **E** gap-fora-do-PNCP = 0 (ou explicado e aceito).

## 5. Replicabilidade (produto)

**Favorável:** o espelho é **único e serve todos** (o Brasil é o mesmo PNCP). Cliente novo = **novo perfil** (`licitacao_captura_perfis`: termos + modalidades + UF + destino) + **novo prompt de classificação IA**. Custo marginal de infra ≈ zero. Multi-tenant limpo: `pncp_triagem` é por licitação × perfil.

**Ressalvas honestas (encarar antes de vender):**
1. **Destino ainda acoplado** ao `api-licitacoes` do Sigma GSS — abstrair como webhook configurável por cliente.
2. **Risco de fonte única** — só PNCP. Se o PNCP muda/cai, **todos** os clientes sofrem juntos. A Effecti tem redundância de fontes. Para produto com SLA cobrado, portais estaduais como fallback entram no roadmap. **Vender como "cobertura PNCP automatizada com curadoria", não "tudo que qualquer agregador pega"** — até ter o número da validação #2.

## 6. Bloqueios ativos
- **Quota OpenAI (429)** — trava o estágio IA de classificação **e** (mesma key) a IA das campanhas de prospecção. Repor crédito na conta OpenAI da GSS.
