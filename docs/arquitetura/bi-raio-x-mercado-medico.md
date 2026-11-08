# Raio-X do Mercado Médico — o BI que o Maikon leva ao hospital

> **Spec de desenho.** Origem: reunião com o Maikon (07/11/2026) e o pedido do Raul em 08/11: "como gerar esse nível de inteligência dentro de um BI e mostrar isso para o Maikon".
> Faz parte do plano `docs/arquitetura/plano-goal-gss-dono-no-comando.md` (Fase 7).
> Números deste documento: banco de produção em 08/11/2026.

## 1. A pergunta que a tela responde

O Maikon senta com um secretário de saúde, um gestor ou um dono de hospital e precisa explicar **por que é difícil colocar um médico ali — e o que resolveria**. A tela é o argumento dele:

> "Existem 49.948 pediatras no Brasil e 2.310 em SC. Nós já falamos com 4.975. 666 responderam. Destes, a maioria diz que não se muda de cidade, a segunda razão é o valor. Para preencher a sua vaga, ou o plantão vira concentrado com moradia, ou o valor sobe para a faixa que o mercado pede."

Pergunta da tela, em uma frase: **"Por que é difícil preencher [especialidade] em [lugar], com prova?"**

Dois públicos, uma base:
- **Modo apresentação** (para o hospital): números grandes, sem nome de médico, marca GSS, exporta PDF. É o argumento.
- **Modo gestão** (para o Maikon e os sócios): o mesmo funil com os detalhes de operação: qual número, qual campanha, tempo de resposta, conversas sem resposta nossa. É o diagnóstico.

## 2. O que os dados mostram hoje (e que a tela precisa contar com honestidade)

| Especialidade | Leads no CRM | Em campanha | Alcançados (1º contato) | Responderam | Quentes | Convertidos |
|---|---|---|---|---|---|---|
| Pediatria | 57.068 | 14.531 | 4.975 | 666 (13%) | 11 | 20 |
| Anestesiologia | 30.456 | 5.835 | 2.558 | 450 (18%) | 20 | 1 |
| Radiologia | 21.790 | 1.792 | 1.006 | 133 (13%) | 17 | 13 |
| Psiquiatria | 16.720 | 2.319 | 761 | 161 (21%) | 9 | 0 |
| Ginecologia e Obstetrícia | 40.978 | 1.351 | 518 | 106 (20%) | 0 | 1 |

Três leituras que mudam o desenho:

1. **"Mandamos para 30 mil" ainda não é verdade.** Em ginecologia foram 518 médicos alcançados. O BI precisa separar **universo** (CFM), **base que temos** (CRM), **alcançados** (mensagem entregue) e **conversas**. Se inflar, o Maikon perde a credibilidade na primeira pergunta do hospital. O número grande e verdadeiro é o universo, e o funil mostra o quanto já foi trabalhado.
2. **A maior perda é nossa, não do médico.** Dos médicos que responderam nos últimos 60 dias, **só 17% receberam alguma resposta nossa depois de 14/10** (47 de 273), contra 43% antes (194 de 453). A IA das campanhas está sem crédito (OpenAI) desde 14/10. Mesmo antes, mais da metade ficou sem resposta. Isso vai para o modo gestão em destaque ("médicos esperando resposta") e é a Fase 8 do plano.
3. **Objeção não está registrada em lugar nenhum.** `campanha_leads.motivo_perdido` tem texto livre e misturado ("numero_errado", "Situação: sem interesse", "000", "juiko"). As objeções reais estão no texto das conversas. Sem uma classificação por IA de cada conversa, não existe o bloco que o Maikon mais quer.

## 3. As categorias (tiradas de 90 respostas reais de médicos)

Uma amostra aleatória de 90 respostas de médicos (últimos 120 dias) mostrou estes padrões. A IA vai classificar cada conversa em **um resultado** e, quando houver, **uma objeção principal**.

**Resultado da conversa**
| Código | O que é | Exemplo (anonimizado) |
|---|---|---|
| `interessado` | Quer detalhes, mandou datas, aceitou conversar | "Vaga em que plantões e qual a oferta salarial?" · "Gostei, me manda a escala de novembro" |
| `objecao` | Disse não com um motivo | (ver tabela abaixo) |
| `sem_interesse` | Disse não sem motivo | "Não tenho interesse, obrigado" |
| `filtro_secretaria` | Respondeu secretária, consultório, assistente virtual | "Sou a secretária, o Dr. agradece…" · resposta automática de clínica |
| `indicacao` | Indicou outro médico | "Meu irmão anestesiologista está precisando" |
| `contato_errado` | Número não é do médico | "Neste telefone não existe Eduardo" |
| `fora_do_perfil` | Aposentado, não atua mais, outra área | "Já completei 70" · "Não faço mais clínica" |
| `desconfianca` | Quer saber quem é e de onde veio o contato | "Como conseguiu meu contato?" |

**Objeção principal** (quando `resultado = objecao`)
| Código | Rótulo na tela | Sinal na conversa |
|---|---|---|
| `distancia` | Mora longe / não muda de cidade | "Moro em Brasília", "não consigo me deslocar", "sou de MG" |
| `agenda` | Agenda cheia | "horários todos preenchidos", "sem disponibilidade" |
| `valor` | Valor abaixo do esperado | pede valor e recusa; cita número |
| `modelo_trabalho` | Modelo de contratação / carga | vínculo, noturno, fim de semana, PJ |
| `so_remoto` | Só telemedicina | "só remoto, por telemedicina" |
| `estrutura` | Estrutura do hospital / volume | salas, cirurgias, exames por plantão |
| `outro` | Outro (texto livre curto) | — |

Campos extraídos junto (quando aparecerem): **cidade/UF onde o médico mora**, **valor pedido** (R$, por plantão/hora/exame), **disponibilidade citada** (dias), **trecho** (até 160 caracteres, sem nome) e confiança da IA.

## 4. A tela — modo apresentação

Filtros no topo (os únicos): **Especialidade** · **Região** (Brasil / UF / cidades do CRM) · **Período**. Botão **Apresentar** (tela cheia) e **Baixar PDF**.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ GSS · Raio-X do mercado — PEDIATRIA · Santa Catarina · últimos 6 meses   │
├──────────────────────────────────────────────────────────────────────────┤
│ 1. O MERCADO                                                             │
│   49.948 pediatras no Brasil   ·   2.310 em SC   ·   x por 100 mil hab.  │
├──────────────────────────────────────────────────────────────────────────┤
│ 2. O QUE JÁ FIZEMOS                     3. COMO O MERCADO RESPONDE       │
│   4.975 médicos alcançados              alcançados  4.975 ████████████   │
│   WhatsApp 4.975 · E-mail 1.200         responderam   666 ██             │
│   LinkedIn 40 · Instagram 25            interessados  120 ▌              │
│   desde jun/2026, 9 campanhas           contratados    20 ▏              │
├──────────────────────────────────────────────────────────────────────────┤
│ 4. POR QUE DIZEM NÃO                                                     │
│   Mora longe / não muda      ███████████  38%  "Moro em Brasília, a       │
│   Agenda cheia               ██████       21%   logística fica difícil"   │
│   Valor                      ████         14%  "E os valores? Para que    │
│   Modelo de trabalho         ██            8%   dias seria?"              │
│   Só telemedicina            █             4%                             │
│   (sem motivo 15% · secretária filtrou 120 contatos · 18 indicações)     │
├──────────────────────────────────────────────────────────────────────────┤
│ 5. O QUE DESTRAVA                                                        │
│   • 38% não se mudam → plantão concentrado (ex.: 4×24h/mês) + moradia     │
│   • Valor pedido pelos que recusaram: mediana R$ 2.100/12h                │
│     (oferta atual R$ 1.600) — 31 médicos citaram valor                    │
│   • 42 médicos moram a até 150 km: lista pronta para abordagem 2          │
└──────────────────────────────────────────────────────────────────────────┘
```
*(Números do desenho são ilustrativos onde ainda não existem: objeções e valores dependem da classificação da seção 6.)*

Regras de leitura:
- **Bloco 1** mostra o tamanho e a escassez. A densidade por 100 mil habitantes entra quando houver população IBGE por UF (tabela pequena, carga única).
- **Bloco 2** prova trabalho com **médicos alcançados** (mensagem entregue), nunca "mensagens enviadas".
- **Bloco 3** é um funil de barras horizontais com o número escrito; sem pizza.
- **Bloco 4** são barras ordenadas, % sobre quem deu motivo, com 1 citação curta por categoria (anônima, sem cidade pequena que identifique). Embaixo, em cinza, o que não é objeção (sem motivo, secretária, indicação).
- **Bloco 5** são regras fixas sobre os números, não texto livre da IA:
  - `distancia` ≥ 30% → sugerir plantão concentrado / moradia e mostrar quantos médicos moram perto (cidade da conversa ou do CRM);
  - valor citado por ≥ 10 médicos → mostrar a mediana pedida contra a faixa do briefing (`valor_min`/`valor_max`);
  - `agenda` ≥ 20% → sugerir escala flexível / sobreaviso;
  - `indicacao` > 0 → "X indicações viraram leads".
- Sem nome de médico em nenhum lugar do modo apresentação (LGPD).

## 5. A tela — modo gestão (só GSS)

Mesmo filtro, mais quatro blocos:
- **Médicos esperando resposta nossa** (respondeu e ficou sem resposta > 2 h): número grande, vermelho, com link para a conversa. Hoje seriam centenas.
- **Tempo até a primeira resposta** (mediana, por número e por pessoa).
- **Por campanha e por número:** alcançados, % resposta, % interessado, falhas de envio.
- **Conversão por abordagem:** % interessado por template e por roteiro da IA (quando a Fase 8 criar variações).

## 6. De onde vêm os números

| Peça | Fonte | Situação |
|---|---|---|
| Universo por especialidade e UF | `cfm_medicos_staging.especialidade` (texto com RQE: "&PEDIATRIA - RQE Nº: 1261", várias por médico) | **Precisa normalizar**: tabela `cfm_medico_especialidades (nu_crm, sg_uf, especialidade_id)` casando o texto com `especialidades.nome/aliases`. Só tem UF (o CFM não traz cidade). Carga de 07/06 |
| Base no CRM | `leads` + `lead_especialidades` | Existe |
| Alcançados / responderam | `campanha_leads.data_primeiro_contato` + `sigzap_messages` (entrada do médico após o 1º contato) | Existe |
| Interessados / contratados | `campanha_leads.status` (`quente`, `convertido`) | Existe, mas é pouco preenchido: a classificação da IA (`interessado`) supre |
| Objeções, valor pedido, onde mora | **Nova:** `conversa_classificacao` | Não existe |
| Canais LinkedIn / Instagram | `campanha_leads.canal_atual` + toques assistidos (Fase 9) | Não existe |

### Tabela nova `conversa_classificacao`
`id, campanha_lead_id → campanha_leads (único), lead_id, campanha_id, especialidade_id, resultado text, objecao text, objecao_detalhe text, valor_pedido numeric, valor_unidade text ('plantao_12h','plantao_24h','hora','exame','mes'), cidade_medico text, uf_medico text, disponibilidade text, trecho text, confianca numeric, modelo text, mensagens_ate timestamptz, classificado_em timestamptz` + `GRANT` + RLS (leitura para diretoria e gestores).

### Edge `conversas-classificar`
- Seleciona as conversas de campanha com mensagem do médico **depois** de `mensagens_ate` (nova ou mudou).
- Monta o texto (últimas ~30 mensagens, sem mídia), pede JSON estrito com os campos acima.
- Modelo barato e rápido (Gemini Flash; OpenAI como alternativa). Carga inicial: ~2–3 mil conversas, ordem de poucos milhões de tokens — custo baixo, mas **depende de crédito de IA** (D-G).
- Cron a cada 2 h; backfill em lotes de 200.
- Conferência: 50 conversas classificadas lidas por uma pessoa; acerto ≥ 85% no `resultado` antes de ligar o modo apresentação.

### Visões
- `bi_raiox_funil(p_especialidade_ids uuid[], p_ufs text[], p_desde date)` → universo CFM Brasil/UF, base CRM, alcançados por canal, responderam, interessados, contratados.
- `bi_raiox_objecoes(...)` → contagem e % por objeção + 1 trecho por categoria (o de maior confiança) + mediana de `valor_pedido` por unidade.
- `bi_raiox_destrava(...)` → os gatilhos do bloco 5 já calculados.

## 7. Onde fica no Sigma

- Menu: **BI › Raio-X do mercado** (primeira aba do BI para diretoria).
- Atalho em cada campanha: "Ver Raio-X desta especialidade".
- Atalho na vaga (Fase 4): "Por que esta vaga está difícil?" abre o Raio-X da especialidade + UF da vaga.

## 8. Pronto quando

- Para Pediatria/SC e Ginecologia/Brasil, todos os números dos blocos 1–3 batem com SQL manual.
- Objeções classificadas em ≥ 95% das conversas com resposta; conferência humana ≥ 85% de acerto.
- PDF do modo apresentação sai com marca GSS, sem nenhum nome de médico.
- `/impeccable` + `qualidade-de-tela` aplicados; portão visual em 1440 e 1024 px nos dois modos e no estado "especialidade sem campanha ainda" (mostra só o mercado e "ainda não prospectamos").
