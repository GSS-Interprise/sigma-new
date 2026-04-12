# Visão de Produto: Máquina de Prospecção Automática

> **DOCUMENTO ESTRATÉGICO** — Visão macro do produto final que o CRM Sigma GSS está sendo construído para ser.
> Cada bloco de sprint entrega uma peça dessa máquina. Este documento guia todas as decisões de arquitetura.

---

## O Problema Atual

A GSS prospecta médicos para preencher escalas, plantões e contratos em diversas especialidades e regiões do Brasil. Hoje o processo é majoritariamente manual:

- Um operador cria uma campanha, seleciona leads um a um (até 600), configura o WhatsApp e dispara
- Após o disparo, o mesmo operador precisa ler respostas, qualificar o interesse do médico e fechar o negócio
- Campanhas rodam uma de cada vez, com limite baixo (120 mensagens/dia)
- Não há automação de conversa — cada resposta exige intervenção humana
- O operador faz tudo: dispara, conversa, qualifica e fecha

**Resultado**: a capacidade de prospecção é limitada pelo número de operadores. Escalar exige contratar mais gente.

## A Visão: Motor Automático de Prospecção

### Conceito central

Transformar o CRM em uma **máquina que prospecta sozinha**. O operador humano só entra no momento do fechamento — quando o médico já demonstrou interesse real.

```
OPERADOR CRIA CAMPANHA (2 minutos)
        ↓
MÁQUINA RODA SOZINHA
  → Localiza médicos por especialidade + região
  → Dispara WhatsApp automaticamente
  → IA conversa, explica serviços, tira dúvidas
  → IA qualifica e aquece o lead
  → Lead quente → notifica operador
        ↓
OPERADOR FECHA O NEGÓCIO
```

### Campanhas em paralelo

A GSS quer rodar **10+ campanhas simultâneas**, cada uma prospectando um tipo de serviço em uma região diferente:

| Campanha | Especialidade | Região | Serviço | Status |
|----------|--------------|--------|---------|--------|
| 1 | Anestesiologista | RJ | Plantão UTI | 🟢 Ativa |
| 2 | Anestesiologista | SP | Plantão UTI | 🟢 Ativa |
| 3 | Pediatra | MG | Emergência Pediátrica | 🟢 Ativa |
| 4 | Radiologista | PR + SC | Laudo Remoto | 🟢 Ativa |
| 5 | Intensivista | RJ | UTI Adulto | 🟡 Agendada |
| 6 | Ginecologista | BA | Plantão Maternidade | 🟢 Ativa |
| 7 | Clínica Médica | GO | PA 12h | 🟢 Ativa |
| 8 | Endoscopista | SP | Centro Diagnóstico | 🔵 Pausada |
| 9 | Cirurgião Geral | RS | Eletiva | 🟢 Ativa |
| 10 | Emergencista | CE | UPA 24h | 🟢 Ativa |

**Volume projetado**: ~1.000 médicos/dia sendo prospectados automaticamente.

### Pipeline do lead

Cada lead percorre um funil automático:

```
FRIO ──────→ CONTATADO ──────→ EM CONVERSA ──────→ AQUECIDO ──────→ QUENTE ──────→ CONVERTIDO
  ↓               ↓                 ↓                  ↓               ↓
Motor           IA inicia        IA conversa         IA detecta     Operador
dispara         conversa         explica serviço     interesse      assume
WhatsApp        automática       tira dúvidas        real           e fecha
                                 extrai dados                         ↓
                                                        ↓          Contrato
                                                  🔔 Notificação   assinado
                                                  para operador
                                                  com resumo
```

### O que muda para os operadores

| Aspecto | Hoje | Com a máquina |
|---------|------|---------------|
| Papel do operador | Faz tudo (dispara + conversa + fecha) | **Só fecha** (a máquina faz o resto) |
| Campanhas simultâneas | 1-2 manuais | **10+ automáticas** |
| Seleção de leads | Manual (600 por vez) | **Automática por filtro** (pool dinâmico) |
| Após envio | Espera resposta, lê manualmente | **IA conversa automaticamente** |
| Qualificação | Manual (operador lê e classifica) | **IA classifica automaticamente** |
| Handoff | Não existe | **IA notifica operador quando lead está quente** |
| Capacidade | Limitada por nº de operadores | **Limitada por nº de chips WhatsApp** |

---

## Arquitetura Técnica Necessária

### 1. Campanhas com pool dinâmico de leads

**Hoje**: campanha tem lista fixa de até 600 leads.

**Visão**: campanha tem um **filtro** (especialidade + UF + serviço). O motor puxa leads automaticamente em lotes diários até esgotar a base ou atingir meta.

```
Campanha "Anestesio RJ"
  Filtro: especialidade=Anestesiologista, uf=RJ, serviço=Plantão UTI
  Pool: 3.200 leads que atendem ao filtro
  Dia 1: dispara para 120
  Dia 2: dispara para mais 120
  Dia 3: ...
  (automático, sem intervenção do operador)
```

**Implicação técnica**:
- Remover limite de 600/campanha — ou tornar configurável
- `disparos_campanhas` ganha campo `filtro_especialidades UUID[]`, `filtro_ufs TEXT[]`, `filtro_servico TEXT`
- Motor backend (edge function + pg_cron) consulta diariamente o pool e cria lotes automaticamente
- Controle de "já contatado" impede re-disparo

### 2. Multi-chip com fallback automático

**Hoje**: 1 chip fixo por campanha. Se bloqueado → pausa e notifica.

**Visão**: campanha tem chip primário + fallback(s). Se um é bloqueado, migra automaticamente.

```
Campanha "Anestesio RJ"
  Chip primário: +55 21 99999-1111
  Fallback 1: +55 21 99999-2222
  Fallback 2: +55 21 99999-3333
  
  Se 1111 bloqueado → troca para 2222 automaticamente
  Se 2222 bloqueado → troca para 3333
  Se todos bloqueados → pausa e notifica
```

**Implicação técnica**:
- `disparos_campanhas` ganha `chips_fallback UUID[]`
- Callback `6-BLOQUEADORA` troca de chip em vez de pausar
- Rotação de chips para distribuir carga (evitar bloqueio)
- Dashboard mostra saúde de cada chip (mensagens/dia, taxa de bloqueio)

### 3. IA como primeira linha de conversa

**Hoje**: não existe automação de conversa pós-disparo.

**Visão**: a IA de WhatsApp do Raul é conectada ao Sigma. Cada campanha tem um script/persona configurável. A IA:
- Responde automaticamente quando o médico responde
- Explica o serviço (plantão, valores, localização)
- Faz perguntas para qualificar (disponibilidade, interesse, CRM)
- Extrai dados estruturados da conversa (interesse, objeções, disponibilidade)
- Classifica o lead no pipeline automaticamente

```
Médico: "Oi, recebi a mensagem. Que plantão é esse?"
IA: "Olá Dr. João! É um plantão de UTI adulto no Hospital X, no RJ.
     A escala é 12h, valor de R$ X por plantão. Você tem disponibilidade
     para esse tipo de escala?"
Médico: "Tenho sim, trabalho com UTI há 5 anos. Qual o valor exato?"
IA: "Ótimo! O valor é R$ 2.800 por plantão de 12h. Posso conectar você
     com nossa equipe de contratos para alinhar os detalhes?"
Médico: "Pode sim"

→ IA marca lead como QUENTE
→ Notifica operador: "🔥 Dr. João, Anestesiologista RJ, interessado em
   plantão UTI R$2.800. Histórico de conversa disponível."
→ Operador assume a conversa e fecha contrato
```

**Implicação técnica**:
- Edge function que recebe mensagens do WhatsApp (já existe parcialmente no sigzap)
- Integração com API de IA (Claude API ou similar) para gerar respostas
- `disparos_campanhas` ganha `script_ia TEXT`, `persona_ia JSONB`
- `sigzap_conversations` ligada ao lead + campanha
- Classificação automática de status baseada na conversa
- Trigger de handoff quando IA detecta lead quente

### 4. Handoff inteligente para operador

**Hoje**: não existe.

**Visão**: quando a IA detecta que o lead está pronto (interesse real demonstrado), ela:
1. Marca o lead como "Quente" no pipeline/kanban
2. Gera um **resumo da conversa** (o que o médico quer, objeções, disponibilidade)
3. Envia notificação para o operador responsável pela campanha
4. Transfere a conversa — operador vê todo o histórico e continua de onde a IA parou

**Implicação técnica**:
- Sistema de notificações push (já existe `system_notifications`)
- Resumo gerado por IA (Claude API) a partir do histórico de mensagens
- `leads` ganha `resumo_ia TEXT`, `score_aquecimento INT`
- Kanban visual com raias: Frio → Contatado → Em Conversa → Aquecido → Quente → Convertido
- Atribuição automática de operador por campanha/região

### 5. Dashboard de campanha e BI

**Hoje**: métricas básicas (enviados, sem zap, falhas).

**Visão**: cada campanha tem dashboard completo:

```
Campanha "Anestesio RJ" — 15 dias ativos
┌──────────────────────────────────────────────┐
│ Disparados: 1.800  │  Responderam: 340 (19%)  │
│ IA conversando: 45  │  Aquecidos: 28          │
│ Quentes (handoff): 12 │ Convertidos: 5         │
│                                               │
│ Taxa de conversão: 0.28%                      │
│ Custo por conversão: R$ 12 (custo WhatsApp)   │
│ Tempo médio: 4.2 dias (disparo → conversão)   │
│                                               │
│ Top objeções:                                 │
│  1. Valor abaixo do mercado (8 menções)       │
│  2. Não tem disponibilidade (6 menções)       │
│  3. Já tem contrato fixo (4 menções)          │
└──────────────────────────────────────────────┘
```

**Implicação técnica**:
- Métricas agregadas por campanha via materialized views ou pg_cron
- Análise de objeções por IA (categorização automática)
- Funil de conversão visual (Recharts — já usado no sistema)
- Comparação entre campanhas (qual especialidade/região converte melhor)

---

## Mapeamento nos Blocos de Sprint

| Bloco | Entrega para a máquina | Período |
|-------|----------------------|---------|
| **Bloco 1** (atual) | **Fundação**: especialidades limpas, dedup, blacklist, filtros funcionando. Sem isso, nada escala. | 23/03 – 11/04 |
| **Bloco 2** | **Pipeline**: kanban automático, tracking de origem, pool dinâmico de leads, automação de status, multi-chip com fallback | 14/04 – 02/05 |
| **Bloco 3** | **IA**: WhatsApp IA conectada ao Sigma, extração de dados de conversa, perfil inteligente do médico, handoff automático, resumo por IA | 05/05 – 30/05 |
| **Bloco 4** | **Inteligência**: dashboard de campanha, BI de conversão, análise de objeções, painel de produtividade, modo foco (prontuário + chat) | 02/06 – 20/06 |

### Bloco 2 em detalhe (próximo)

| Sprint | Entregas | Como se conecta à máquina |
|--------|----------|--------------------------|
| Sprint 4 | Kanban de tráfego de lead, página de fluxo, automação de status | Pipeline visual do funil de prospecção |
| Sprint 5 | Automação de status por raia, tempo de conversação, identificação JID | Motor automático de mudança de status |
| Sprint 6 | Relatório por fluxo, módulo de tarefas, fechamento com notificação, reorganização disparos/email | Handoff operacional + preparação para IA |

---

## Decisões de arquitetura para o Bloco 2

### Pool dinâmico vs lista fixa

**Recomendação**: manter a lista de `disparos_contatos` (rastreabilidade), mas criar um motor (`pg_cron` + edge function) que popula automaticamente com base no filtro da campanha. O operador define o filtro; o motor faz o resto.

### Limite de 600 por campanha

**Recomendação**: tornar configurável por campanha. Default 600 para campanhas manuais. Para campanhas automáticas, o limite é o pool total (controlado por lotes diários de 120).

### Estrutura de dados da campanha (proposta para Bloco 2)

```sql
ALTER TABLE disparos_campanhas ADD COLUMN IF NOT EXISTS
  filtro_especialidades UUID[],          -- especialidades alvo
  filtro_ufs TEXT[],                     -- UFs alvo
  filtro_servico TEXT,                   -- tipo de serviço
  chips_fallback UUID[],                 -- chips de fallback
  modo TEXT DEFAULT 'manual',            -- 'manual' ou 'automatico'
  script_ia TEXT,                        -- script para IA (Bloco 3)
  meta_diaria INT DEFAULT 120,           -- mensagens por dia
  pool_total INT,                        -- total de leads no filtro
  pool_processados INT DEFAULT 0;        -- quantos já foram disparados
```

### WhatsApp IA (proposta para Bloco 3)

A IA do Raul será integrada como uma edge function que:
1. Recebe webhook de mensagem recebida (Evolution API)
2. Consulta histórico da conversa + dados do lead + script da campanha
3. Gera resposta via Claude API
4. Envia de volta pelo WhatsApp
5. Atualiza status do lead automaticamente
6. Se lead quente → handoff

---

## Métricas de sucesso da máquina (KPIs)

| KPI | Meta |
|-----|------|
| Campanhas ativas simultâneas | 10+ |
| Médicos contatados/dia | 1.000+ |
| Taxa de resposta | >15% |
| Taxa de aquecimento (resposta → interesse) | >30% |
| Taxa de conversão (interesse → contrato) | >10% |
| Tempo médio disparo → conversão | <7 dias |
| Intervenção humana | Apenas no fechamento |

---

## Riscos e mitigações

| Risco | Mitigação |
|-------|-----------|
| WhatsApp bloqueia chips em massa | Rotação de chips, warmup gradual, multi-fallback |
| IA dá respostas erradas | Script rigoroso, aprovação de persona pela GSS, logs de conversa |
| Médicos reclamam de spam | Cooldown de 7 dias, blacklist, opt-out com 1 clique |
| LGPD | Opt-out imediato, dados de CFM são públicos, consentimento no primeiro contato |
| Volume sobrecarrega banco | PostgreSQL aguenta 500k+ leads facilmente; partial indexes já aplicados |

---

> **Este documento deve ser revisitado no início de cada bloco para validar prioridades e ajustar a rota com a equipe GSS.**
