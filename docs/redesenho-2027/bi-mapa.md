# Mapa do BI e as próximas abas no padrão do Raio-X (16/11/2026)

Pedido do Raul: deixar as abas do BI no padrão do Raio-X e criar um BI só das conversas com os médicos pelo WhatsApp.

**O que já está no ar:** o Raio-X do mercado no desenho do Figma (`src/components/bi/raiox/`). A visão do dia a dia
traz a frase do gargalo com o funil numa faixa, os motivos de recusa e as falas. O botão Apresentar abre o modo do
hospital (`Apresentacao.tsx`): capa com 4 números, mercado por 100 mil habitantes (Censo 2022), esforço semanal por
canal, funil, motivos, quanto o mercado paga e o que propomos. Bloco sem dado some e a numeração anda junto.
Ficaram de fora, por falta de dado confiável: região por raio em km e preço pago em licitações.

**Protótipos novos** (gerador `prototipos/gerar_bi_abas.py`, dados fictícios, portão visual com 0 falhas em 1440 e 1024):
- `prototipos/x-bi-conversas.html`: aba nova **Conversas com médicos**, que substitui Insights Conversas;
- `prototipos/x-bi-prospeccao.html`: **Prospecção** com uma pergunta ("onde cada campanha perde o médico?");
- `prototipos/x-bi-escalas.html`: **Escalas** com uma pergunta ("onde vai faltar médico nos próximos 7 dias?").

O padrão de todas: a pergunta respondida numa frase no topo, uma faixa de até 5 números com o gargalo em âmbar,
2 ou 3 blocos, e a fonte (máquina) numa linha no rodapé.

## Decisões para o Raul antes de codar Conversas com médicos
1. **Migration nova** com a RPC `get_bi_conversas` (5 números + 3 blocos, filtros de período, especialidade, UF,
   campanha e número). Precisa do seu OK para aplicar na produção.
2. **Gravar a origem da mensagem** (disparo, IA, equipe) em `sigzap_messages`. Sem isso, separar disparo e IA é
   heurística pela posição na conversa. Mexe no envio do `campanha-ia-responder` e do disparo.
3. **Backfill do `lead_id`** das 1.130 conversas sem lead que casam por telefone (idempotente). Também pede OK.


Levantamento de 16/11/2026, só leitura (feito por agente, conferido nos números de cobertura). Código: `src/pages/BI.tsx` + `src/components/bi/`. Contagens de produção via
Management API (read_only), só agregados. "Elementos" = `<Card>` / gráficos Recharts / tabelas / filtros (Select,
Combobox, Input) / sub-abas, contados no arquivo da aba (aproximado; cards de KPI são componentes próprios em várias abas).

## Parte A — as abas do BI hoje

Navegação: 6 grupos em botões com popover (`BINavigation.tsx`). Diretoria abre em Raio-X; o resto abre em Prospecção;
licitador vê só Licitações. 15 abas (14 + Hospital de Gaspar).

| Grupo | Aba (arquivo) | Quem / pergunta que parece responder | Fontes | Elementos | Problemas | Prioridade |
|---|---|---|---|---|---|---|
| Comercial | Raio-X do mercado (`raiox/RaioXMercado.tsx`, `Blocos.tsx`, `ModoGestao.tsx`) | Diretoria e hospital: onde a prospecção trava, e por quê? | RPC `bi_raiox_funil`, `bi_raiox_objecoes`, `bi_raiox_destrava`, `bi_raiox_gestao` (sobre `campanha_leads`, `sigzap_messages`, `conversa_classificacao`, `cfm_medico_especialidades`, `email_envios`) | 5 blocos, 3 filtros, 2 modos, PDF | Já é o padrão-alvo (nota 7 no raio-x). Topo poluído (6 botões + 3 filtros + modo + Apresentar + PDF); gargalo (Contratados 0%) na mesma cor das outras barras | baixa: só polir (âmbar no gargalo, filtros numa linha) |
| Comercial | Prospecção (`AbaProspec.tsx`, 963 linhas) | Maikon/gestora: como está o funil e o que converte? | RPC `get_bi_prospec_dashboard`, `get_bi_prospec_funil`, `get_bi_campanhas_api_oficial`; tabelas `bi_prospec_funil_snapshot` (1 linha), `chips` | 7 sub-abas (Funil & Oportunidades, Visão geral, Por especialidade, Conversão, Tráfego pago, Campanhas, Propostas, Canais), ~11 KPIs, 8 gráficos | Parede de KPI; sub-abas demais; repete o funil do Raio-X e as "Motivos de não conversão" do Raio-X; tráfego pago e canais são outra pergunta | **alta** |
| Comercial | Acompanhamento Campanhas (`AbaAcompanhamentoCampanhas.tsx`) | Gestora, de manhã: as campanhas estão disparando? | RPC `get_bi_acompanhamento_campanhas` | faixa de 5 "Pulso" + 1 gráfico + lista | Faixa de 5 números já existe; falta a frase ("2 campanhas paradas, 1 sem chip"). Sobrepõe a tela de Saúde dos chips | média |
| Comercial | Esforço da Equipe (`AbaEsforcoEquipe.tsx`) | Gestora: quem trabalhou quantos leads? | RPC `get_bi_esforco_equipe`, `get_bi_funil_campanha` (sobre `campanha_lead_tasks`, 21k) | 4 KPIs, 4 gráficos, 1 filtro | Mede tarefas, não conversa; `assumido_por` ≈ vazio; no 30d só 2 pessoas enviaram mensagem pelo Sigma | média (absorver pela nova aba de Conversas) |
| Comercial | Insights Conversas (`AbaInsightsConversas.tsx`) | Diretoria: o que os médicos pedem (pagamento, modalidade, valor, UF, objeções)? | RPC `get_bi_funil_engajamento`; tabelas `banco_interesse_leads` (175 perfis), `campanha_leads`, `campanhas` | 4 KPIs, 4-5 gráficos (pizza, barras), 2 filtros | Base minúscula (175) e só de quem a IA "perfilou"; ignora `conversa_classificacao` (1.069); objeções repetem o Raio-X; KPIs de vaidade ("Confiança média da IA") | **alta** (vira "Conversas com médicos", Parte B) |
| Comercial | Licitações (`AbaLicitacoes.tsx`) | Setor de licitações: pipeline, ganhas, perdidas, valor | hook `useLicitacoesBI` → `licitacoes` (26,5 mil) | ~11 KPIs, 4 gráficos, 6 filtros, alertas | Parede de KPI (Ativas/Ganhas/Perdidas/Taxa/Valor ×2 rótulos repetidos); sem pergunta | média |
| Comercial | Competitiva (`AbaInteligenciaCompetitiva.tsx` + `InteligenciaCompetitivaSection.tsx`) | Diretoria: contra quem perdemos e por quanto? | `useInteligenciaCompetitivaBI` → `licitacao_itens` (159), `licitacao_resultados` (121) | ~10 KPIs, 7+2 gráficos, 1 tabela | Base pequena; KPIs duplicados (Taxa de vitória, Ranking médio aparecem também em AGES) | média |
| Operacional | Escalas (`AbaEscalas.tsx` + `AbaDrEscala.tsx` + `escalas/*`) | Coordenação: onde há furo e quanto de hora descoberta? | `useEscalasBI` → `escalas_integradas` (12 mil), `escalas_locais`, `escalas_setores`; edge `drescala-bi` (Dr. Escala, `drescala_plantoes` 2,1 mil) | 4 sub-abas, ~12 KPIs, ~25 títulos de gráfico, 6 filtros | Mais denso do BI; duas fontes de escala (integrada × Dr. Escala) na mesma aba; furos espalhados em 6 gráficos | **alta** |
| Operacional | AGES (`AbaAges.tsx`) | Diretoria AGES: produção, receita, licitações | `useAgesBI360` → `ages_*` (7 contratos, 12 produções, 22 leads) | 12 cards, 8 gráficos, 7 filtros | ~20 KPIs para dados quase vazios; mistura licitação, contrato e produção | baixa (pouco dado; esconder ou reduzir a 1 bloco) |
| Pessoas | Médicos (`AbaMedicos.tsx`) | Administrativo: quantos médicos aptos e onde falta? | `useMedicosBI` → `medicos` (850), `medico_documentos` (835) | ~9 KPIs, 3 gráficos, 6 filtros, alertas | Parede de KPI; "Especialidades em déficit" é a pergunta real e está escondida | média |
| Pessoas | Relacionamento (`AbaRelacionamento.tsx`) | Relacionamento: reclamações e SLA | `useRelacionamentoBI` → `relacionamento_medico` (57), `blacklist` | 8 cards, 4 gráficos, 7 filtros | 57 registros para 7 filtros e funil; gráficos quase vazios | baixa |
| Financeiro | Financeiro (`AbaFinanceiro.tsx`) | Lucro, margem, ticket | `recebimentos_cliente` (0), `pagamentos_medico` (0), `select('*')` no cliente | 3 KPIs, 3 gráficos | **Tudo zero**: as duas tabelas estão vazias; depende do Conta Azul | baixa (estado vazio honesto até ter dado) |
| Financeiro | Contratos (`AbaContratos.tsx`) | Diretoria: o que vence e quanto vale? | `useContratosBI` → `contratos` (109) | ~10 KPIs, 4 gráficos, 7 filtros, alertas | Pergunta clara ("vence em 90 dias") enterrada em 10 cards | média |
| TI | TI (`AbaTI.tsx`) | TI: tickets abertos, SLA | `useTIBI` → `suporte_tickets` (261), `profiles` | 17 cards, 2 gráficos, 3 sub-abas (Hoje/Mês/Ano) | 17 cards para 261 tickets | baixa |
| Clientes | Hospital de Gaspar (`AbaClienteExterno.tsx` + `cliente-externo/*`) | Cliente externo: dashboard de importação | `bi_clientes`, `bi_client_imports` (0), `bi_client_import_rows` | 3 sub-abas, 5 cards, 1 gráfico, 2 tabelas | Sem importação nenhuma (0); tela vazia | baixa |

### As 3 que mais valem redesenhar agora

**1. Prospecção** → pergunta: *"Onde cada campanha perde o médico?"*
- Frase: "De 4.210 médicos contatados em 30 dias, 812 responderam e 34 viraram contrato. O funil trava entre resposta e interesse." (números ilustrativos, não consultados)
- Números (máx. 5): contatados · responderam (%) · interessados · contratados · campanhas ativas.
- Blocos: (1) funil em barras horizontais com a etapa-gargalo em âmbar, recortável por especialidade/UF; (2) tabela
  de campanhas ordenada pela pior conversão (campanha, especialidade, contatados, resposta %, interesse %, contrato);
  (3) "Convertidos por colaborador" pequeno ao lado. Tráfego pago, Propostas e Canais saem para uma aba "Canais" ou
  para o Raio-X; motivos de não conversão saem (já estão no Raio-X).
- Fontes: `get_bi_prospec_funil`, `get_bi_prospec_dashboard` (já existem).

**2. Escalas** → pergunta: *"Onde vai faltar médico nos próximos 7 dias?"*
- Frase: "Há 9 plantões descobertos até domingo, 6 deles no Hospital X (UTI)." (ilustrativo)
- Números: plantões descobertos (7 dias) · horas descobertas · locais afetados · % de cobertura do mês · profissionais ativos.
- Blocos: (1) lista de furos por data/local/setor (o que agir); (2) barras de horas descobertas por local; (3) top 10
  profissionais por carga (risco de concentração). Distribuição por dia da semana/faixa de horário vira detalhe colapsado.
- Fontes: `drescala_plantoes.furo` + `drescala_locais/setores` (edge `drescala-bi`), `escalas_integradas` para histórico.

**3. Insights Conversas → "Conversas com médicos"** (detalhe na Parte B). Substitui uma aba de 175 perfis por uma sobre
16 mil mensagens/mês, e absorve o pedaço "quem respondeu" do Esforço da Equipe.

## Parte B — BI "Conversas com médicos" (só WhatsApp)

### Onde estão os dados

| Tabela | Linhas | Papel |
|---|---|---|
| `sigzap_messages` | 157.848 (desde 22/08/2025) | Cada mensagem. `from_me`, `sent_by_user_id`, `sent_at`, `message_type`, `message_text`, `message_status`, `provider` (chakra/evolution), `campanha_lead_id` (coluna existe no banco, **falta em `types.ts`**), `sent_via_instance_name` (vazio nos últimos 30 dias) |
| `sigzap_conversations` | 45.155 | Uma por contato × instância. `lead_id`, `contact_id`, `instance_id`, `assigned_user_id`, `status`, `not_the_doctor`, `service_window_expires_at`, `last_message_at` |
| `sigzap_contacts` | 45.384 | `contact_phone`, `contact_jid` |
| `sigzap_instances` | 141 | Número/chip: `name`, `phone_number`, `provider` (evolution/chakra/twilio), `chip_id`, `is_trafego_pago` |
| `campanha_leads` | 34.516 | Lead × campanha: `conversa_id` (= `sigzap_conversations.id`), `campanha_id`, `status`, `humano_assumiu`, `assumido_por`, `historico_conversa` (JSON com `role` medico/gss da IA) |
| `conversa_classificacao` | 1.069 (desde 09/11/2026) | Classificação por IA da conversa: `resultado` (sem_interesse 377, interessado 351, filtro_secretaria 126, objecao 100, contato_errado 56, fora_do_perfil 40, indicacao 11, desconfianca 8), `objecao` (distancia 54, agenda 21, modelo_trabalho 8, valor 5…), `valor_pedido`, `uf_medico`, `cidade_medico`, `especialidade_id`, `trecho`, `confianca`. Chave `campanha_lead_id` |
| `banco_interesse_leads` | 175 | Perfil extraído pela IA (pagamento, modalidade, valor mínimo). Usado pela aba atual |
| Legado vazio | `conversas` 0, `mensagens` 0, `disparos_ia_logs` 0, `lead_pareceres` 0 | Ignorar |
| Views prontas | `vw_sigzap_atividade_equipe` (msgs por usuário), `vw_sigzap_conversation_origem` (só 21 conversas no 30d: não serve), `vw_lead_timeline` (trata todo `from_me` do sigzap como "humano": não serve para IA × humano) |

### Cadeias de resolução

- **Contato → lead:** `sigzap_messages.conversation_id → sigzap_conversations.lead_id → leads.id`.
- **Lead → especialidade:** `leads.especialidade_id` (73% das conversas do 30d) ou `lead_especialidades.especialidade_id`
  (junto: 93% das conversas com lead). Alternativa já classificada: `conversa_classificacao.especialidade_id`.
- **Lead → UF/cidade:** `leads.uf` (99% das com lead), `leads.cidade` (88%). Alternativa: `conversa_classificacao.uf_medico/cidade_medico` (o que o médico disse).
- **Conversa → campanha:** `campanha_leads.conversa_id = sigzap_conversations.id` (53% das conversas do 30d) ou
  `sigzap_messages.campanha_lead_id → campanha_leads.campanha_id` (51%). O resto é conversa fora de campanha (inbound, manual, histórico).
- **Conversa → número/chip:** `sigzap_conversations.instance_id → sigzap_instances` (`name`, `provider`, `chip_id`). Não usar `sent_via_instance_name` (nulo no 30d). 10 instâncias tiveram conversa no 30d.

### Quem escreveu a mensagem

| Autor | Regra | 30 dias |
|---|---|---|
| Médico | `from_me = false` | 5.119 |
| Equipe (pelo Sigma) | `from_me and sent_by_user_id is not null` | 551 (só 2 pessoas) |
| Automação (disparo + IA + digitado no celular) | `from_me and sent_by_user_id is null` | 10.306 |
| → 1º contato (disparo) | automação e 1ª mensagem da conversa | 5.393 |
| → resposta da IA (provável) | automação logo depois de mensagem do médico | 1.802 |
| → sequência/follow-up | automação depois de outra nossa | 3.111 |

Não há coluna `is_ai`. A separação disparo × IA é **heurística** (posição na conversa). Para ficar exata: gravar a
origem em `sigzap_outbox`/`sigzap_messages` (o `campanha-ia-responder` já passa `origem='resposta_ia'` ao anti-ban,
`chip_send_log.evento_origem`, mas a mensagem salva não guarda). Ajuste pequeno, recomendado antes do BI.

### Conversas sem lead

- Total: 14.620 sem `lead_id` (32% das conversas); 1.061 delas tiveram mensagem no 30d (17% das ativas).
- 9.178 têm "telefone" com 14+ dígitos: é id `@lid` do WhatsApp ou número estrangeiro, **não casa por telefone**.
- 5.422 têm telefone BR (12-13 dígitos). Casando `'+'||fone` (e o de 12 dígitos com o 9 inserido) contra
  `leads.phone_e164` (índice único) e `lead_contatos.valor` (índice): **1.130 casam** (1.028 por `leads`, 952 por
  `lead_contatos`). Dá para preencher `lead_id` com um backfill idempotente; os outros ~4.300 são médicos fora da base ou não-médicos.

### Cobertura (30 dias)

- 15.976 mensagens, 6.220 conversas ativas.
- Com lead: 83% (5.159). Com especialidade: 77% das ativas (4.807). Com UF: 83%. Com campanha: 53%.
- Médico respondeu em 1.780 conversas (29%). Em 1.232 conversas a última mensagem é do médico (sem resposta nossa).
- Tempo até nossa resposta depois de msg do médico: mediana 5 min (geral), 4 min quando é a equipe (só 103 casos).
- Médico escreve curto (mediana 27 caracteres); nós longo (mediana 199). Pico do médico: 9h, depois 14-15h.
- Tipos: 95% texto; 364 documentos, 149 imagens, 73 áudios.

### Métricas computáveis

Volume por dia/hora/dia da semana · % de conversas em que o médico respondeu · tempo médico→nós e nós→médico (mediana,
p90) · conversas com a última palavra do médico (esperando) e há quanto tempo · quem responde (IA × equipe × pessoa via
`sent_by_user_id → profiles`) · por especialidade, UF, campanha, número/chip e provedor · resultado e objeção (só desde
09/11, via `conversa_classificacao`) · tamanho de mensagem · mídia enviada pelo médico (documento = sinal de
interesse) · conversas "não é o médico" (`not_the_doctor`, só 15) · janela de 24h da API oficial (`service_window_expires_at`).

### Tela proposta

**Pergunta:** "Os médicos estão respondendo, e alguém está respondendo a eles?"

**Frase do topo (exemplo com os dados de hoje):** "1.780 médicos responderam no último mês, e 1.232 conversas terminam
com o médico falando por último. Quem responde quase sempre é a IA: a equipe mandou 551 mensagens."

**Faixa de 5 números**
1. Conversas ativas: `count(distinct conversation_id)` de `sigzap_messages` no período.
2. Médicos que responderam (%): conversas com `bool_or(not from_me)` / ativas.
3. Esperando resposta: conversas cuja última mensagem é `from_me=false` (com idade da mais antiga).
4. Tempo de resposta (mediana): `lead(sent_at)` após mensagem do médico, partition por `conversation_id`.
5. Respostas da equipe × IA: `from_me` com `sent_by_user_id` não nulo × nulo após mensagem do médico.

**Blocos**
1. *Quem está esperando* — lista das conversas com o médico por último, ordenada por espera: especialidade
   (`leads.especialidade_id`), UF, campanha (`campanha_leads.conversa_id`), número (`sigzap_instances.name`), espera.
   Link para abrir a conversa. É o bloco de ação.
2. *Onde o médico responde* — barras de % de resposta por especialidade (e alternância UF / campanha / número), com o
   volume ao lado; a pior em âmbar. Fonte: `sigzap_messages` × `sigzap_conversations` × `leads` / `campanha_leads` / `sigzap_instances`.
3. *O que eles dizem* — `conversa_classificacao.resultado` em barra empilhada e top objeções com um `trecho` de
   exemplo (sem nome). Avisar "classificação desde 09/11". Substitui as pizzas do Insights atual.

Detalhe opcional (colapsado): mapa de calor dia × hora das mensagens do médico.

**Filtros (uma linha):** período (7/30/90 dias), especialidade, UF, campanha, número/chip. Nada mais.

**Implementação:** uma RPC `get_bi_conversas(p_desde, p_especialidade_ids, p_ufs, p_campanha_id, p_instance_id)`
`security definer`, devolvendo os 5 números + 3 blocos em JSON; volume atual (16 mil msgs/mês) cabe em CTE com
`idx_sigzap_messages_sent_at`. Antes: (a) gravar a origem da mensagem (disparo/IA/equipe) em `sigzap_messages`;
(b) backfill do `lead_id` das 1.130 conversas que casam por telefone; (c) regenerar `types.ts` (falta `campanha_lead_id`).
