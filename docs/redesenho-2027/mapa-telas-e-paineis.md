# Sigma GSS: telas e painéis possíveis com os dados que já temos (13/11/2026)

Fonte: o esquema do banco (`src/integrations/supabase/types.ts`, 287 tabelas e 31 visões), as 15 abas de BI
que já existem (`src/components/bi/`) e as tabelas novas do Dr. Escala (`drescala_locais`, `drescala_setores`, `drescala_plantoes` com a coluna `furo`, ligadas em 13/11). O `pncp_mirror` foi criado fora das migrations e não aparece nos tipos.
Ninguém consultou a produção para este mapa. Os volumes citados vêm do raio-X e da nota do projeto.

Cada item responde a uma pergunta de alguém. "Pronto" quer dizer que os dados já existem e basta a tela;
"ajuste" quer dizer que falta corrigir ou completar um dado antes de a tela valer.

## Legenda
- **Situação hoje:** existe (já há tela ou aba), parcial (há pedaço espalhado) ou novo.
- **Dados:** pronto ou ajuste (com o que falta).
- **Esforço:** P (até 1 dia), M (2 a 4 dias), G (1 semana ou mais).

## 1. Prospecção (captadoras, gestora comercial, Maikon)

| # | Tela ou painel | Pergunta que responde | Quem e quando | Fontes | Situação | Dados | Esforço |
|---|---|---|---|---|---|---|---|
| 1.1 | **Início da captadora** ("Hoje para você") | O que espera por mim agora? | Captadora, o dia todo | `vw_leads_quentes_esperando`, `sigzap_conversations`, `campanha_lead_tasks`, `worklist_tarefas`, `vw_worklist_pendencias_setor` | parcial (Home mostra calendário e pendências soltas) | pronto | M |
| 1.2 | **Fila de quentes sem dono** | Quem está esperando alguém, e há quanto tempo? | Captadora e gestora, várias vezes ao dia | `vw_leads_quentes_esperando`, `vw_acompanhamento_kanban` | parcial (3 avisos na aba Quentes) | pronto | P |
| 1.3 | **Saúde da Máquina** | As campanhas estão enviando no ritmo, e algum número caiu? | Gestora, de manhã | `chip_send_log`, `vw_disparos_diarios`, `vw_chip_saude`, `chip_health_event`, `vw_campanha_ultimo_disparo`, `vw_campanha_metricas` | parcial (BI Acompanhamento e Saúde dos chips separados) | pronto | M |
| 1.4 | **Funil por campanha e especialidade** | Onde o funil trava em cada campanha? | Maikon e diretoria, semanal | `vw_leads_funil_stats`, `bi_prospec_funil_snapshot`, `vw_campanha_lead_counts` | existe (BI Prospecção, Raio-X) | pronto | P (só redesenho) |
| 1.5 | **Mapa de oportunidades** | Em que especialidade e estado ainda há médico para abordar? | Maikon, mensal, ao abrir campanha | `mv_especialidade_uf_universo`, `mv_uf_universo`, `vw_especialidade_pool_count` | existe (Funil & Oportunidades) | ajuste: ~395 mil médicos sem especialidade ficam fora | P |
| 1.6 | **Por que dizem não** | O que faz o médico recusar, e o que destrava? | Diretoria, mensal | `lead_pareceres`, `vw_parecer_metricas`, `campanha_resumos`, `conversas` | existe (Raio-X, Insights de Conversas) | pronto | P |
| 1.7 | **Tempo de resposta** | Quanto tempo o quente espera até alguém responder? | Gestora, semanal | `sigzap_messages`, `vw_lead_tempo_por_canal`, `vw_leads_quentes_esperando` | novo | pronto | M |
| 1.8 | **Qual canal responde mais** | WhatsApp, e-mail ou LinkedIn: onde cada especialidade responde? | Maikon, mensal | `campanha_proposta_lead_canais`, `vw_lead_tempo_por_canal`, `email_interacoes`, `campanha_lead_touches` | novo | ajuste: LinkedIn só registra o toque desde 11/11 | M |
| 1.9 | **Produtividade da equipe** | Quem assumiu, respondeu e converteu quanto? | Gestora e diretoria, semanal | `vw_captadora_produtividade`, `vw_sigzap_atividade_equipe`, `vw_produtividade_disparos` | parcial (BI Esforço) | **ajuste:** `assumido_por` e `data_conversao` quase vazios; a equipe não usa o "Aprovar" | M + correção |
| 1.10 | **Segmentos de leads** | Quem eu ainda não abordei e posso pôr numa campanha? | Gestora, ao montar campanha | `leads`, `lead_especialidades`, `lead_contatos`, `campanha_leads`, `blacklist` | parcial (Leads e Listas) | ajuste: 509 mil sem WhatsApp precisam de enriquecimento | M |
| 1.11 | **Ficha do médico 360** | Quem é esse médico, o que já falamos e em que etapa está? | Captadora, a cada conversa | `vw_lead_perfil_360`, `vw_lead_timeline`, `lead_historico`, `lead_anotacoes`, `medico_documentos` | parcial (perfil espalhado) | pronto | M |

## 2. Operação clínica (escalas, contratos, médicos)

| # | Tela ou painel | Pergunta que responde | Quem e quando | Fontes | Situação | Dados | Esforço |
|---|---|---|---|---|---|---|---|
| 2.1 | **Furos de escala** | Que plantão está descoberto nos próximos 7 dias, e em que hospital? | Coordenação de escala, diário | `drescala_locais`, `drescala_setores`, `drescala_plantoes` (coluna `furo`), `escalas_alertas` | novo (dado chegou em 13/11) | ajuste: sem histórico ainda; robô roda às 6h, 12h e 18h | M |
| 2.2 | **Cobrir o furo** | Que médico da base pode cobrir esse plantão? | Coordenação e captação, quando abre furo | `drescala_*` × `leads`/`medicos` (especialidade, cidade) × `vw_lead_perfil_360` | novo | pronto (cruzamento por especialidade e região) | G |
| 2.3 | **Vagas em aberto** | Qual vaga está mais atrasada, e quem cuida dela? | Captação e coordenação, diário | `demandas`, `contratos_demanda`, `campanhas` | existe (vazia) | ajuste: o fluxo de cadastrar vaga ainda não pegou | P |
| 2.4 | **Documentos de médico vencendo** | Que médico vai ficar irregular este mês? | Administrativo, semanal | `medico_documentos`, `ages_profissionais_documentos`, `medico_documentos_log` | parcial (avisos) | pronto | P |
| 2.5 | **Contratos e renovações** | Que contrato vence em 90 dias, e quanto vale? | Diretoria, mensal | `contratos`, `contrato_itens`, `contrato_renovacoes`, `contrato_aditivos_tempo`, `bi_clientes` | existe (BI Contratos) | pronto | P |
| 2.6 | **Relacionamento com o médico** | Que médico contratado está sumindo ou reclamando? | Relacionamento, semanal | `relacionamento_medico`, `medico_ausencias`, `medico_indisponibilidades`, `escalas` | existe (BI Relacionamento) | pronto | P |
| 2.7 | **Radiologia: SLA de laudos** | Que exame está atrasado, por cliente? | Radiologia, diário | `radiologia_*` (exames em atraso, pendências, SLA por cliente) | existe | pronto | fora do escopo |

## 3. Gestão (diretoria, financeiro, licitações)

| # | Tela ou painel | Pergunta que responde | Quem e quando | Fontes | Situação | Dados | Esforço |
|---|---|---|---|---|---|---|---|
| 3.1 | **Painel dos sócios** | O negócio está crescendo: médicos contratados, plantões cobertos, receita? | Diretoria, semanal | `contratos`, `recebimentos_cliente`, `financeiro_receber`, `drescala_*`, `vw_leads_funil_stats` | parcial (cada número numa aba) | ajuste: receita depende do Conta Azul, ainda não conectado | M |
| 3.2 | **Contas a pagar do mês** | Quem falta pagar, e com que nota? | Financeiro, no fechamento | `financeiro_pagamentos`, `financeiro_pagamento_itens`, `pagamentos_medico`, `financeiro_anexos` | existe (Financeiro) | pronto | fora do escopo |
| 3.3 | **Licitações: o que entra esta semana** | Que edital vale disputar, e qual prazo vence? | Licitações, diário | `licitacoes`, `licitacoes_atividades`, `licitacoes_notificacoes_prazo`, `pncp_mirror` | existe (quadro e triagem) | pronto | P |
| 3.4 | **Concorrência** | Quem ganha de nós, em que preço e onde? | Diretoria, mensal | `licitacao_resultados`, `licitacao_item_concorrentes`, `empresas_concorrentes` | existe (Inteligência competitiva) | pronto | P |
| 3.5 | **E-mail marketing** | O e-mail traz resposta, ou só abertura? | Maikon, por campanha | `email_campanhas`, `email_interacoes`, `email_respostas` | parcial | ajuste: nenhum envio real ainda (falta remetente) | P |

## O que eu levaria para o fim de semana
Cinco itens mostram o Sigma "dono no comando" e usam dado que já existe:
1. **Início da captadora** (1.1): já desenhado no Figma.
2. **Saúde da Máquina** (1.3): o painel de todas as manhãs da gestora.
3. **Funil por campanha** (1.4) com o Raio-X redesenhado: já desenhado no Figma.
4. **Furos de escala e Cobrir o furo** (2.1 e 2.2): é a novidade. Junta o Dr. Escala, que chegou hoje, à base de 828 mil
   médicos e responde quem chamar para cobrir um plantão.
5. **Painel dos sócios** (3.1): uma tela só, com contratados, plantões cobertos e funil.

## Dados que precisam de conserto antes de virar painel
- **Conversão e dono do lead:** `data_conversao` e `assumido_por` estão quase vazios porque a equipe não usa o
  "Aprovar" no Kanban. Sem isso, produtividade por captadora e taxa de conversão saem erradas (1.9). O
  redesenho ajuda: "Assumir" e "Mover para Em atendimento" ficam no caminho natural (Quentes e Conversas).
- **Especialidade:** cerca de 395 mil médicos sem especialidade ficam fora do mapa de oportunidades (1.5).
- **WhatsApp:** cerca de 509 mil médicos sem número; precisam de enriquecimento para entrar em campanha.
- **Receita:** depende de conectar o Conta Azul, que espera a autorização da Mavi (3.1).
- **Escalas:** o Dr. Escala começou a gravar em 13/11; comparar semana a semana só depois de algumas semanas.
