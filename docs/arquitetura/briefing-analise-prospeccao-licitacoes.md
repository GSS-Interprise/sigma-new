# Briefing de Análise — Máquina de Prospecção & Licitações (Sigma / GSS)

> **Propósito deste documento:** consolidar, de forma self-contained, os problemas e pontos abertos de duas áreas do Sigma (prospecção via WhatsApp e captura de licitações) para análise independente. Marca explicitamente o que está **[PROVADO]** com dado de produção vs **[HIPÓTESE]** a validar. Termina com as perguntas de decisão.

---

## 0. Contexto (para quem não acompanhou)

**Empresa:** GSS (Gestão Serviços Saúde) — recrutamento/alocação de médicos para hospitais no Brasil. **Sigma** = CRM/SaaS da GSS (React/Vite + Supabase self-hosted, ref `zupsbgtoeoixfokzkjro`).

**Máquina de Prospecção:** módulo que faz 1º contato com médicos por WhatsApp em massa para captação. Dois modos de campanha:
- **IA:** o sistema dispara e a IA (`gpt-4o`) conversa sozinha com o médico até "esquentar" e passar pro humano (handoff).
- **Manual:** a operadora conduz; cada lead vira uma cadência de **tarefas** (kanban) para a equipe executar. **Nesse modo a IA NÃO deveria conversar.**

**Stack de WhatsApp:** Evolution API `v2.3.7` (fork evoapicloud, biblioteca **Baileys**, não-oficial) atrás de **proxy Bright Data ISP/residencial BR**, num VPS (Docker + Redis + Postgres). Cada "chip" = um número de WhatsApp = uma instância Evolution. Bridge de eventos via N8N.

**Licitações:** módulo separado do Sigma para captar oportunidades de licitação pública de serviços médicos. Hoje ingestão vem 86% da **Effecti** (serviço pago, entra via N8N, `fonte='n8n'`). Testando substituir pela API pública gratuita do **PNCP** (Portal Nacional de Contratações Públicas, Lei 14.133).

---

# PARTE A — MÁQUINA DE PROSPECÇÃO

Três frentes levantadas em reunião com a equipe (14/07/2026).

## A1. Frente 1 — Campanhas manuais não fecham o ciclo no CRM

**Sintoma-mãe:** a equipe cria campanhas manuais mas elas "não conseguem ser disparadas e usadas dentro do CRM"; e o processo não gera dado nem fecha o ciclo. Está causando **prejuízo operacional**.

Problemas específicos relatados:

1. **[BUG] A IA conversa junto com a equipe em campanha manual.** Ao criar campanha manual, a IA interage com o médico ao mesmo tempo que a equipe — comportamento errado (manual = humano conduz).
   - **Onde investigar:** `receive-whatsapp-messages` só deveria rotear para `campanha-ia-responder` quando `tipo_envio='ia'`; em manual deveria só mover o kanban. O guard provavelmente está furado (lead pertence a >1 campanha? fallback de tipo? classificação por chip?).
2. **Criação/importação de leads travada:** a campanha **nasce vazia** (criar ≠ adicionar leads); o botão "Adicionar Leads à Base" puxa **50 por clique** via RPC `selecionar_leads_campanha`; chip **não é obrigatório** na criação → gera "campanha fantasma" (ativa, sem leads/sem chip, nunca dispara). [PROVADO: no banco existe campanha "Nefrologista-Pomerode" ativa, 76 leads, sem chip, parada desde 08/06].
3. **[BUG] Tarefas não aparecem para todos os leads** da campanha manual (algumas ficam sem as 6 tarefas do kanban).
4. **[FALTA] Botão de adicionar tarefa / observação por lead** dentro da campanha.
5. **[FALTA] Dados da campanha manual não refletem no BI:** tarefas executadas, toques (`campanha_lead_touches`), conversões manuais não estão sendo capturados/agregados → a diretoria não enxerga o esforço manual.

**Estado atual do módulo (mapeado):** UI de criação = wizard de 3 abas (Configuração/Mensagem/Briefing). Cadeia: criar campanha → adicionar leads (RPC) → cron dispara (só IA) → resposta roteia p/ IA ou kanban. Campanha manual gera `campanha_lead_tasks` (6 tarefas: whatsapp 1/2/3, email, instagram, telefone) via trigger. Já foi feita melhoria recente no wizard (explorador de pool: filtro de cidade/origem/idade + distribuição), mas os pontos acima seguem abertos.

## A2. Frente 2 — Saúde dos chips péssima

**Sintoma-mãe:** só **6–7 de 21** chips de disparo ficam conectados. Chips "entram em processo de restrição e problemas aleatórios a todo momento"; os 14 caídos "têm algum problema que não conseguimos retomar".

Validação feita no banco + servidor + API Evolution:

| # | Hipótese testada | Resultado |
|---|---|---|
| 1 | IPs compartilhados (ban em cluster) | ❌ **[PROVADO falso]** 21 chips = 21 sessions Bright Data distintas (1 IP/chip) |
| 2 | Proxy datacenter (pior tipo) | ⚠️ **[PROVADO]** É Bright Data **ISP/residencial** — não datacenter (ok), mas não 4G (não é padrão-ouro) |
| 3 | Config diferente entre 7 up e 14 down | ❌ **[PROVADO falso]** Config idêntica |
| 4 | Idade (novo cai, velho aguenta) | ❌ **[PROVADO falso]** Up e down ambos de maio a julho |
| 5 | Chips estão em "flapping"/socket-timeout | ❌ **[PROVADO falso p/ estado atual]** Estão em `close`, não `connecting` |
| 6 | Chips estão **deslogados** (sessão morta) | ✅ **[PROVADO]** `/instance/connect` devolve **QR novo** e move p/ `connecting` (aguardando scan). Só voltam com re-scan manual |

**Padrão temporal [PROVADO]:** ~1 chip desloga por dia e **fica morto**; de 07→14/07 acumularam 14 sem ninguém reescanear. O log `chip_auto_reconnect_log` mostra evento `needs_qr` por chip, mas 0 reconexões.

**O edge de reconnect (`chip-auto-reconnect`, cron 5min) funciona corretamente:** detecta `close` como `needs_qr`, **não** tenta reconectar (impossível sem QR), e **alerta** o grupo + número da Bruna ("⚠️ precisa QR"). Ou seja, **o furo é OPERACIONAL** (ninguém reescaneia), não bug de código.

**[CONFIRMADO pela equipe] Restrição/ban ≠ simples logout:** na reunião 15/07 o Raul descreveu o padrão operacional real — "chip desconecta por instabilidade → reconecta; **chip restringido tu não vai conseguir resolver, deixa de lado**". Ou seja, boa parte dos 14 caídos está **restrita/banida (irrecuperável)**, não só deslogada — reescanear não traz de volta. Casos concretos citados: chips restringidos ao disparar (Lidiane), campanhas ficando sem chip. Falta ainda **quantificar** quantos dos 14 são restritos vs. deslogados-recuperáveis (teste de scan real).

**Achados de infra [PROVADO]:**
- Evolution `v2.3.7`; **nenhum env de timeout/socket/keepalive configurado** → usa defaults do Baileys (não tunável sem fork).
- **Dois crons de saúde mortos:** `chip-healthcheck-5min` (jobid 9) e `chip-health-monitor-1min` (jobid 15) têm schedule `0 0 31 2 *` (31 de fevereiro = nunca dispara). 0 execuções em 30 dias.

**Pesquisa de mercado/técnica (3 frentes) — conclusões [validadas em fontes, não em produção]:**
- **O que mais mata chip é COMPORTAMENTO** (taxa de denúncia/bloqueio, alvo **< 2% por 1.000 msgs**; volume de destinatários novos/ritmo), **não** a idade do chip nem o IP.
- **Ban é praticamente irreversível** (~2,76% de apelações revertidas, fev/2026).
- **Comprar chip aquecido = pior custo-benefício** (5–15× o chip virgem, mercado informal, golpe/não-entrega documentado, risco de vir banido). Não ataca a raiz.
- **1º contato manual pela equipe (já adotado) é a melhor jogada anti-ban** — reduz denúncia na origem.
- **Proxy 4G/móvel = padrão-ouro** (CGNAT torna IP "não-banível"), mas caro (~R$800–900/mês/porta → seletivo). **1 IP dedicado por conta** é regra.
- **Cloud API oficial** = única solução "sem-ban" real, mas exige **opt-in + template aprovado** → inviável para cold frio; ótima para **nutrir quem já respondeu** (híbrido).
- **Fork da Evolution** para expor timeouts (`connectTimeoutMs`/`keepAliveIntervalMs`/`defaultQueryTimeoutMs`) resolve a raiz do flapping quando ele ocorre.

## A3. Frente 3 — Rotinas e processos de monitoramento

**Sintoma-mãe:** não há rotina para monitorar a prospecção e saber "se estamos evoluindo ou não".

Estado: existe BI de prospecção (funil de engajamento, esforço por canal/equipe, conversão) já corrigido recentemente, mas:
- **Faltam contadores diários** ("X enviados hoje, Y respondidos, quantos faltam") na tela da campanha — pedido explícito (caso Maikon: campanha de ginecologia com atualização diária de "quantos faltam").
- **Dados da campanha manual não entram no BI** (ver A1.5) → o esforço manual é invisível.
- **Falta cadência de acompanhamento** definida (o que a equipe olha, com que frequência, qual métrica define "evoluindo").

**Da reunião 15/07 (Ramone/Raul) — o que a equipe definiu:**
- **Reunião semanal (segunda de manhã)** para avaliar saúde dos chips, disparos e campanhas.
- **Rotina diária:** ao chegar, olhar campanhas/disparos do dia anterior, ver falhas, ver se tem chip caído → seguir o POP.
- **POP de chip caído (ICs a padronizar):** chip desconectado por instabilidade → tentar reconectar; **chip restringido → NÃO tentar recuperar, deixar de lado, conectar outro / passar pra outra pessoa**; se restringir todos → **protocolo de emergência** ("grita"). Raul vai **escrever esses POPs** e padronizar com a Ramone (presencial terça 15/07).
- **Dono de prospecção** deve ser perfil de **vendas** ("a dor de prospectar é dela"); se a máquina não roda, é problema dela. Bruna (atual) vai sair — trocar por alguém mais forte em tecnologia/CRM.
- **Restrição estrutural [importante para a análise]:** poucas pessoas fazendo o processo inteiro (a mesma pessoa "defende e ataca"); risco real de, ao adicionar tarefa nova, deixar outra cair. A Ramone duvida que "poucas pessoas fazendo muitas coisas" escale só com rotina — a automação precisa reduzir carga, não só organizar.
- **Backup de chips:** definir **quantos aparelhos/chips** são necessários para rodar tudo + reserva.
- **[PESQUISAR] "Novo tipo de chip"** que o Maikon mencionou — "não é da Vivo, mais barato, não é SIM comum" (provável eSIM ou operadora alternativa/virtual). Ramone vai mandar o material; avaliar.
- **[SINAL] "Meta vai cobrar pela resposta do WhatsApp"** (Ramone) — coerente com a mudança de pricing da Cloud API oficial; reforça a avaliação do híbrido.

---

# PARTE B — LICITAÇÕES (substituir Effecti pelo PNCP)

**Objetivo:** cortar a Effecti (paga, cara só pela ENTRADA de dados) usando a API pública gratuita do PNCP — **sem perder oportunidade**.

**Estado da captura [PROVADO]:** edge `licitacoes-pncp-sync` reescrita (v2) para usar o endpoint de **busca** (`/api/search/`, o mesmo que o portal usa) em vez do `/consulta/publicacao` (que sub-capturava ~400/varredura). Grava em `licitacoes_pncp_staging` (não toca produção). Cron 3x/dia.
- **2.008 licitações** acumuladas · **1.094 com dado de resultado** (vencedor) · **100% com CNPJ** · 27 UFs · 827 municípios · 900 órgãos.
- Robustez: retry/backoff (API do PNCP derruba conexão), deadline 110s (limite do Edge Runtime é 150s), loop breadth-first, dedup por `numero_controle_pncp`.

**Cobertura vs Effecti [PROVADO]:**
- Effecti trouxe 76 licitações em 14 dias.
- Overlap município-level no staging: **64% (14d) / 57% (30d)**.
- **MAS:** sondando direto a API do PNCP os municípios "não cobertos no staging" → **11/11 conclusivos existem no PNCP** (7/7 + 4/4). Ou seja, o gap de 40% é **PROFUNDIDADE DE CAPTURA** (o staging só guarda top-N por query), **não falha de cobertura do PNCP**. A fonte tem tudo que a Effecti tem.
- **Bônus:** o PNCP entrega `tem_resultado`/vencedor (1.094 casos) que a Effecti não dá → insumo de um **BI competitivo** (quem ganha, por quanto).

**Conclusão [PROVADO]:** substituição é **viável** — o PNCP contém as licitações da Effecti e entrega a mais.

**Pendências antes de cortar:**
1. **[ENGENHARIA] Tornar a captura exaustiva:** hoje pega top-N por query; falta varredura **por UF** (ou paginação mais profunda) até o staging bater ~100% dos municípios da Effecti num período.
2. Rodar +1–2 dias e confirmar overlap ~100%.
3. Virar produção (`fonte='pncp'` na tabela `licitacoes`), notificar via canais, **desagendar cron de teste e cortar Effecti**.
4. **[LIMITAÇÃO conhecida]** `valor_global` vem null na busca (só 25/2008) → o **valor** do vencedor exige um fetch de detalhe por licitação (enriquecimento futuro do BI).

---

# PARTE C — MÓDULO FINANCEIRO (automatizar a ingestão e o fechamento)

Foco atual do Raul: **automatizar o máximo e entregar valor real**. Base: reunião 15/07 (Ramone, Mavi, Maikon) + 2 planilhas reais enviadas pela Ramone + avaliação de um repo de referência (`financeai`).

## C0. O que já está PRONTO no Sigma (não refazer)
Contas a pagar (importar relatório + conferência + solicitar NF por e-mail com lembrete + comprovante), contas a receber com rateio, resumo consolidado, **fechamento mensal**, **aprovação chat-first via canais** (Mavi fecha → João aprova → Thais sobe comprovante, sistema lê nome no PDF via OCR), web push, visão mobile responsiva. Contas João/Thais criadas.

## C1. A descoberta central da reunião: existem 3 VIAS de dado pra pagar/faturar — não só Dr. Escala
O escopo inicial só mapeou o **Dr. Escala**. A Ramone revelou que faltam duas:
1. **Dr. Escala** (escalas de plantão) — a maioria; consolidação que a Mavi importa.
2. **Ambulatório** — por produção.
3. **Radiologia** — por produção (a **maior dor**, ver C2).

**Formatos por cliente (heterogêneo):** CEPOM = PDF · São João Batista = PDF (e Excel) · resto da radiologia = Excel · CIS Navegantes (Antônia) = planilha que a Mavi criou e a Antônia preenche · Marieta = Excel. **O sistema precisa de um parâmetro/config por contrato para receber cada formato.**

## C2. A dor #1 — Radiologia (~14 mil exames/mês) e o problema do "doppler"
Cliente de radiologia (sistema **PAX**, "o pior do mercado") mudou o sistema → mudaram os relatórios → a nota **caiu de ~R$400k para ~R$299k** numa produção de ~13k exames. Causa da perda:
- Quando cadastram o exame no aparelho (Marieta), **não botam a descrição completa**. Ex.: registram "ultrassom" mas foi **"ultrassom com doppler"** (vale **o dobro**). O médico faz o doppler (está no pedido), mas a GSS **recebe como ultrassom normal** → sub-faturamento.
- Casos análogos: **politrauma**, **abdômen total** (= 2 abdômen normais). O cliente paga a menor.
- Hoje o **Dani entra exame por exame** (900 ultrassons/mês) para identificar o que é doppler/politrauma/total e cobrar o cliente corretamente.

**Pedido:** uma **inteligência/automação que lê a produção dos 14k exames** e sinaliza os casos de sub-faturamento (doppler não cobrado, total pago como normal), para o Dani não conferir um a um. É **detecção de discrepância**, não só classificação. → Raul vai gravar vídeo com o Dani (terça 15/07) para ver o processo manual.

## C3. Blueprint da automação — as planilhas reais são o pipeline inteiro
A planilha **"Fechamento GSS"** (Carestream) carrega o processo manual completo + as **3 tabelas de-para**:

| Aba | Papel | Grão |
|---|---|---|
| RELATÓRIO GSS CARESTREAM (13.222 linhas) | **input cru** (exame, `Mod.`, `Mod. Ajustado`, médico) | exame-a-exame |
| **EQUIVALÊNCIA** (17) | de-para `Mod. → Tipo` (CT→Tomografia, SEG CT→Angiotomografia, MG→Mamografia…) | config |
| **PROCEDIMENTOS** (681) | de-para `procedimento/tipo → valor unitário` (USG 36,75 · Radiografia 5,77 · RM 63…) | config |
| **MÉDICOS GSS** (41) | de-para `nome Carestream → médico GSS` | config |
| RESUMO MÉDICO (500) | **output** (por médico: exame × qtd × valor = total) | agregado |
| LAUDOS / PRAZOS | SLA por tipo de atendimento + calendário de prazos | controle |

Fluxo manual hoje: `cru → EQUIVALÊNCIA (classifica) → PROCEDIMENTOS (valora) → MÉDICOS GSS (normaliza) → soma por médico → RESUMO`.

A planilha **"Marieta"** é **fonte diferente**: já vem como **matriz agregada** (médico × [TC, RX, USG, DOPPLER, ANGIO, RM, MMG…] com contagem + valor). Não precisa classificar exame-a-exame — precisa de importador de matriz.

**Insight arquitetural:** o fechamento de radiologia é **determinístico** (lookup nas de-para) → **não usar LLM** (mantém auditável: preço vem da tabela, não de chute). LLM-classify só faz sentido para fontes **bagunçadas sem código estruturado** (PDF solto tipo CEPOM/São João Batista).

## C4. Etapa não mapeada: conferência do médico ANTES da NF
Toda a radiologia tem uma etapa intermediária: produção → **gerar um resumo ("olheirinho")** → **enviar ao médico** → médico confere e dá OK → **só então** emite a NF. Hoje isso vai por WhatsApp. Precisa entrar no fluxo (o e-mail de solicitação de NF já existe, mas falta o passo de **conferência/aprovação do médico** antes).

## C5. Controladoria — contratado × realizado (pedido forte da Ramone → vira BI)
Ex.: contrato de **1.900 consultas/mês**, realizou **1.100** → precisa saber **qual item** produziu a menos/mais para **renegociar o contrato** com o cliente. Vale para radiologia e ambulatório. Vira **controladoria financeira** (Ramone alimenta/analisa → leva à diretoria). É "o que dá mais trabalho para a Mavi" hoje.

## C6. Fluxo Dr. Escala → aprovação → Conta Azul (confirmado na reunião)
`Mavi importa consolidação Dr. Escala → sistema lê médico × horas × valor → Mavi confere → check → canal do João → João aprova o PAGAMENTO (não o "fechamento", Mavi corrigiu) → aprovado → [FALTA] API Conta Azul envia automático`. Ajustar label "Aprovar fechamento" → **"Aprovar pagamento"**.

## C7. Cadastro de clientes, particularidades e integrações
- **Cliente NÃO deve ser cadastrado pela Mavi** — quem cadastra é o "servidor de contratos" (a **Bianca**). → **integrar** o cadastro de contratos (Bianca) com o financeiro. O que interessa à Mavi é a **execução do serviço para faturar** (cliente pode começar o serviço meses depois do cadastro).
- **Particularidades de faturamento por cliente** (ex.: janela 20→21 vs 1→30) precisam de campo para alimentar.
- **Conta Azul:** **integrar via API, NÃO substituir** (R$1.400/mês; tudo desde 2023, fornecedores, histórico — sensível, não perder dado). Pré-req: mapear com a contabilidade o que usam. **Prioridade: por último** (decisão Maikon).
- **Slack → Sigma:** o driver original de trazer comunicação pro Sigma era **cortar o Slack** (~R$800/mês, por usuário em dólar). **João não quer WhatsApp** (perde informação) — quer no navegador/app. Solução: **PWA** (instalar o Sigma como app no iPhone/Android) — Raul mostra terça. Por ora, **manter Slack** até a Mavi voltar de férias.

## C8. O que reaproveitar do repo `financeai` (stack idêntica ao Sigma)
- **Portar direto:** `_shared/auth.ts` + `validate.ts` (sanitização), `csv-export.ts`/`pdf-export.ts` (pt-BR), `reconcile-transactions` (matching por data+tolerância+idempotência → dedup de fechamento), `margin.ts` (base do BI).
- **Referência:** pipeline `ocr-document` (extrair→classificar com histórico + validação de ID) para as fontes **PDF bagunçadas**; modelagem `budgets`+`monthly_close` para a controladoria (mas grão macro — o nosso é por contrato/procedimento).
- **Não tem:** Conta Azul (zero código), tabelas de-para (não existem) → construir do zero.
- ⚠️ **Segurança:** o `.env` do `financeai` **está commitado** (segredos expostos no GitHub) — revogar/rotacionar + limpar histórico.

## C9. Pendências financeiro (consolidado)
- [ ] **F1 — Ingestão radiologia:** 3 tabelas de-para como config + importador Carestream (determinístico) + importador Marieta (matriz) + **detector de sub-faturamento (doppler/total/politrauma)**.
- [ ] Etapa de **conferência do médico** antes da NF.
- [ ] **Controladoria** contratado × realizado por item (BI Ramone).
- [ ] **Integração cadastro de contratos (Bianca)** + particularidades de faturamento por cliente.
- [ ] Ingestão **CEPOM/São João Batista (PDF)** + **CIS Navegantes** + **ambulatório**.
- [ ] Label "Aprovar pagamento"; **API Conta Azul** (por último, mapear com contabilidade); **API Dr. Escala** (spec).
- [ ] **PWA** (instalar como app) + repassar senha temporária a João/Thais; **Resend Pro + MX** (inbound NF).

---

# PERGUNTAS DE DECISÃO (para a análise)

**Prospecção — priorização e sequência:**
1. Qual a ordem de ataque entre as 3 frentes, dado que a Frente 2 (chips) é o teto de volume e a Frente 1 (manual) causa prejuízo diário?
2. **Chips:** a estratégia certa é (a) reescanear os 14 agora + (b) migrar proxy-chave para 4G + (c) forkar a Evolution para timeouts + (d) híbrido com Cloud API para o morno? Como priorizar por custo × impacto? E como confirmar se os 14 estão **banidos** (irrecuperáveis) vs só deslogados?
3. **Prevenção do ~1 logout/dia:** vale investigar se é expiração multi-device (SIM sem telefone primário online), ban comportamental, ou restart-no-meio-do-scan? Qual instrumentação fecha isso?
4. **Campanha manual:** além de corrigir o bug de IA-em-manual, qual o desenho certo para (a) captura de dados no BI, (b) tarefas por lead, (c) botão de tarefa/observação — sem reescrever o módulo?
5. **Monitoramento:** qual o conjunto mínimo de métricas + cadência (diária/semanal) que responde "estamos evoluindo?" sem virar overhead?

**Licitações:**
6. O sweep por UF é suficiente para garantir exaustão, ou precisa de estratégia adicional (por município da Effecti, por modalidade, por data)?
7. Qual o critério objetivo de corte da Effecti (ex.: "overlap ≥ 98% por 3 dias consecutivos")?
8. Vale já construir o **BI competitivo** de licitações (vencedores) em paralelo, dado que 1.094 casos já têm resultado?

**Financeiro:**
9. **Arquitetura de ingestão multi-fonte:** um único "importador genérico + config por contrato" ou importadores dedicados por fonte (Carestream / Marieta / CEPOM-PDF / CIS)? Como modelar a **config por contrato** (formato, de-para, regra de valor, janela de faturamento) para escalar a novos clientes sem código?
10. **Detector de sub-faturamento (doppler/total/politrauma):** determinístico por regra (ex.: "USG com laudo mencionando doppler → tipo doppler") ou precisa de camada semântica no laudo? Qual o risco de falso-positivo cobrando o cliente indevidamente?
11. **De-para como fonte da verdade:** as 3 tabelas (equivalência/procedimentos/médicos) devem virar tabelas versionadas e editáveis na UI? Como lidar com mudanças de preço/procedimento ao longo do tempo (histórico vs. sobrescrita)?
12. **Controladoria contratado × realizado:** qual o grão mínimo (contrato × item × mês) e de onde vem o "contratado" (do cadastro da Bianca)? Como não duplicar o que o Conta Azul já faz?
13. **Sequência de entrega:** dado que a Mavi só valida ao voltar de férias, qual a ordem que entrega mais valor cedo — radiologia (maior dor) primeiro, ou a etapa de conferência do médico, ou a controladoria?
14. **Reuso do `financeai`:** vale portar os helpers agora (auth/validate/export/reconcile) para acelerar, ou o custo de adaptar supera o de escrever enxuto no padrão do Sigma?

---

*Notas de método: números marcados [PROVADO] foram verificados contra o banco/servidor/API de produção em 13–14/07/2026. Itens [HIPÓTESE] precisam de validação adicional. As conclusões de pesquisa de chips vêm de fontes públicas (majoritariamente comerciais no tema de aquecimento — tratadas com ceticismo); os limiares duros são report rate < 2%/1.000 e irreversibilidade do ban ~2,76%.*
