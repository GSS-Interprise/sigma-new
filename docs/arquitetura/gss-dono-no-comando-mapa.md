# GSS com o dono no comando — mapa da reunião com o Maikon (07/11/2026)

> Fonte: reunião de sábado 07/11/2026 com o Maikon (transcrição Fireflies `qox-gvsj-mjp`) + explicação do Raul na sessão.
> Prazo pedido: **10 dias** (revisão com o Maikon no sábado 14/11; entrega até ~17/11).
> **Revisão 08/11 (Raul):** campanha criada por um assistente de IA que conversa (R1); só API oficial do WhatsApp (Chakra), Evolution sai do fluxo; MCP/"Dots" é do CRM pessoal do Maikon e sai deste mapa; rotinas da VPS (foto do CFM) podem começar já; vagas em aberto confirmadas.
> Este documento é o mapa. A execução de cada frente vira checklist aqui mesmo (seção 7) e tarefa no Pulse OS.

## 1. O problema em uma frase

Hoje cada passo da prospecção depende de uma pessoa: a Ester tira a lista no Life's Hub, a Bianca consulta processo, o Vinícius escreve e solta a campanha, as secretárias lembram (ou não) das vagas abertas. A GSS vai reduzir equipe. O Maikon quer **abrir o Sigma e ele mesmo** criar a campanha, aprovar o texto, ver o resultado e ser avisado do que importa — sem perguntar nada a ninguém.

Regra de desenho que sai da reunião: **ignorar o vício do processo do funcionário** e desenhar para o dono. Quem cria e gerencia campanha são gestores, diretores e donos.

## 2. O que é da GSS e o que não é

**Entra neste mapa (Sigma / CRM da GSS):** campanhas, listas, universo CFM, canais, IA de resposta, dossiê do médico, dashboard/BI, conversas da equipe, vagas em aberto, notificações dos hospitais, concorrentes, histórico de problema do médico, pós-primeiro-plantão, alertas de contrato, limpeza do menu, acessos, rotinas automáticas na VPS da GSS.

**Não entra (outros projetos — registrar no lugar certo):**

| Assunto da reunião | Onde vive |
|---|---|
| Radar cirúrgico, pacientes (TAV, revascularização, robótica), protocolos por cirurgia, cobrança de exames | CRM do Maikon (`/radar-cirurgico`, no ar desde 30/10, sem paciente) + Jornada Paciente (protocolos, produto para outros cirurgiões) |
| Financeiro "Dona Helena", tarefas atrasadas da Isa/Mari | CRM do Maikon |
| Operar o CRM pelo assistente pessoal do Maikon ("Dots", MCP) | CRM do Maikon — não é da GSS e não entra agora (Raul, 08/11) |
| Contatos com IA buscando diretores de hospital (oferecer Dr. Escala, curso de gestão) | A confirmar com o Raul — parece CRM do Maikon |
| Tele / consórcio RS (Raul como gerente de projeto), credenciamento | Projeto novo, fora do Sigma |
| Sistema da UTI (Hospital do Coração), Dados para Donos, Open Finance, curso de gestão | Fora do Sigma |
| Radiologia (pedido da Ramone), financeiro com a Mavi, aprovações com João/Eron | Já existem no Sigma; o Maikon pediu para os pedidos da Ramone passarem por ele antes |

## 3. O processo do Maikon — hoje × alvo

| # | Passo | Hoje (quem) | Alvo (no Sigma) |
|---|---|---|---|
| 1 | Hospital pede (ex.: cardiologia em Lucas do Rio Verde) | Maikon recebe a ligação | Maikon cria a campanha na hora: especialidade + região |
| 2 | Saber o tamanho do mercado | Ninguém sabe ("quantos ginecologistas tem no Brasil?") | Universo do CFM aparece no topo: Brasil e região |
| 3 | Montar a lista | Ester, no Life's Hub + lista do robô, segunda 8h ou à tarde | Lista automática: CFM + Life's Hub + base do CRM, cruzadas e sem duplicata |
| 4 | Escrever e aprovar o texto | Vinícius escreve e solta | Maikon (com João/Eron) aprova o texto; IA sugere |
| 5 | Disparar | Vinícius / chips | WhatsApp oficial (vários números), e-mail com imagem gerada, LinkedIn do Maikon 20/dia e Instagram em modo assistido |
| 6 | Médico responde | Operadora, quando vê | IA qualifica: de onde é, faculdade, residência, pede currículo |
| 7 | Médico "esquentou" | Bianca vê processo quando quer; ninguém olha CNES | Dossiê automático: foto do CRM, locais de trabalho (CNES), processos, redes sociais |
| 8 | Acompanhar | Ninguém consolida | Dashboard da campanha + BI por especialidade, com objeções lidas pela IA |
| 9 | Vender o serviço ao hospital | Maikon sem números | Abre a tela no hospital: "são X pediatras no Brasil, falamos com Y" |
| 10 | Vaga ganha e não preenchida | Esquecida até a secretária do hospital ligar | Vaga com relógio + PDF diário 7h no grupo dos sócios |

## 4. Requisitos — pedido × o que existe × lacuna

Legenda de peso: **P1** = coração do pedido (entra nos 10 dias) · **P2** = entra se couber · **P3** = depois.

### R1. Criar campanha com um assistente de IA — P1 (primeira entrega)
- **Pedido:** "Eu queria que fosse fácil de eu criar uma campanha" — especialidade + região, ele aprova o texto.
- **Existe:** `NovaCampanhaProspeccaoDialog.tsx` (2.036 linhas, ~44 campos num formulário só; provedor Evolution ou Chakra; lista opcional). 22 campanhas paradas em rascunho.
- **Decisão do Raul (08/11):** a campanha é criada **conversando com um assistente de IA** dentro do Sigma, que pergunta só o essencial, nesta ordem:
  1. Especialidade e região (mostra o universo do CFM — R2).
  2. Lista: usar uma lista já extraída/importada **ou** extrair uma nova (CRM + CFM; Life's Hub quando a rotina da VPS existir — R3). Quais leads entram (filtros, sem blacklist, sem duplicata).
  3. Template: usar um template já aprovado na Meta (o padrão, quase sempre o mesmo) **ou** criar um novo.
  4. Números: quantos números oficiais usar e quais (um ou vários — R4).
  5. Resumo final para o dono confirmar ("sim" cria; nada dispara sem confirmação). Aprovação registrada (quem, quando).
- **Só API oficial:** a GSS não usa mais API não oficial. O assistente só oferece números Chakra; Evolution, chips, aquecimento e campos de anti-ban de chip saem do fluxo de criação.
- **Lacuna:** a tela do assistente (conversa + painel com o rascunho da campanha sendo montado ao lado), uma edge que interpreta as respostas e preenche os mesmos campos da campanha atual, e o formulário antigo fica só como "avançado".

### R2. Universo do CFM por especialidade e região — P1
- **Pedido:** "quero que primeiro ele pegue o número de intensivistas pediátricos que tem no Brasil".
- **Existe:** `cfm_medicos_staging` com 751.800 médicos, 402 mil com especialidade (ginecologia 38.712; pediatria 49.948). **Última carga 07/06/2026** — cinco meses.
- **Lacuna:** número no topo da campanha e do BI (Brasil e UF/região), lido de uma visão agregada; atualização periódica do CFM (rotina na VPS).

### R3. Lista automática cruzando fontes — P1
- **Pedido:** "já pegue a lista do Life's Hub, a lista do Thiago, cruze".
- **Existe:** base `leads` (832 mil); enriquecimento Life's Hub via `enrich-lead` / `query-leads-for-enrich`; listas `disparo_listas` / `campanha_listas`.
- **Lacuna:** gerar a lista ao criar a campanha (especialidade + região → leads do CRM + CFM, sem duplicata, sem blacklist). Life's Hub **sem API** (caro): automação de navegador logada, rodando na VPS da GSS. "Lista do Thiago" — confirmar o que é (Raul: "os do Thiago já estão aqui").

### R4. Canais: WhatsApp, e-mail, LinkedIn, Instagram — P1 (WhatsApp/e-mail) · P2 (LinkedIn/Instagram)
- **Existe:** WhatsApp oficial Chakra (coexistência, histórico importado) — **único canal de WhatsApp daqui em diante** (Evolution/API não oficial sai, decisão 08/11); e-mail pelo Resend e pelas caixas Gmail da equipe (tela ainda não publicada no Lovable). LinkedIn/Instagram só como rótulo.
- **Lacuna:** vários números Chakra numa mesma campanha (em andamento); imagem gerada para o e-mail; LinkedIn do Maikon 20/dia e Instagram em **modo assistido** (fila de sugestões que o Maikon executa) — automatizar arrisca bloquear a conta dele (decisão de 05/11).

### R5. IA de resposta que qualifica e pede currículo — P1
- **Pedido:** "O senhor é natural de onde? Fez faculdade aonde? Residência aonde? Tem currículo?"
- **Existe:** `campanha-ia-responder` (briefing por campanha, handoff, `humano_assumiu`).
- **Lacuna:** roteiro de qualificação padrão + gravar as respostas no lead + receber o PDF do currículo e anexar ao médico. ⚠️ OpenAI sem crédito desde 14/10 derruba a IA das campanhas — resolver antes (crédito ou Gemini via Fred).

### R6. Dossiê do médico quente — P1
- **Pedido:** quando o médico responde, "procure no CRM o rostinho, procure pelo CNES os lugares que trabalhou, procure se tem processo, a rede social".
- **Existe:** nada (só foto de perfil do WhatsApp).
- **Lacuna:** ao virar "quente", disparar uma busca na VPS: foto e situação no portal do CFM, vínculos no CNES (DATASUS), processos, Instagram/LinkedIn; resultado num cartão "Dossiê" na ficha + aviso ao Maikon. Fonte de processos é decisão (ver seção 6).

### R7. Dashboard da campanha que serve para vender — P1
- **Pedido:** "uma dashboard bonita pra mostrar pros caras quando vou vender serviço": universo, % disparado por canal, respostas, conversão, e "uma inteligência dizendo por que não curtiram (valor, distância)".
- **Existe:** dashboards em `src/components/campanhas/` (metas, funil, saúde), BI › Prospecção/Acompanhamento/Insights de Conversas, `campanha-resumo-ia`. Sem análise de objeções; na reunião a tela de ginecologia mostrou "falha de envio" e zero conversão, e o Maikon achou confusa.
- **Lacuna:** uma tela por campanha legível pelo dono (universo → alcançados → responderam → interessados → convertidos, por canal) + bloco "Objeções" (IA lê as conversas e agrupa motivos) + BI agregando todas as campanhas da mesma especialidade (filtro "pediatras do Brasil").

### R8. Conversas de toda a equipe + análise — P1 (ver) · P2 (métrica por pessoa)
- **Pedido:** "eu quero o WhatsApp de todo mundo", e saber no fim do mês quanto cada uma demora para responder.
- **Existe:** `/disparos/sigzap` (tela herdada do Ewerton), Chakra com histórico; mapa de qualidade de 05/11 (painel do Kanban só toca áudio, 500 mensagens, 1 conversa por lead, caixa sem tempo real).
- **Lacuna:** plugar todos os números da equipe por coexistência (plano em curso), dono de cada número, caixa no padrão da Jornada, tempo de primeira resposta por pessoa/mês.

### R9. Vagas em aberto com relógio + PDF diário — P1
- **Pedido:** "Vaga aberta de Neurologia Navegantes… 10 dias, 15 dias, 3 meses" e "me mandem PDF todo dia às 7h, num grupo, pra mim e pros guris".
- **Existe:** nada (sem tabela de vagas). `report-diario-grupo` já manda resumo de campanhas num grupo de WhatsApp (sem cron).
- **Lacuna:** cadastro de vaga (hospital, especialidade, tipo plantão/ambulatório, aberta desde, responsável), tela com dias em aberto em cor, PDF às 7h no grupo dos sócios, lista para a reunião de quinta. Origem natural: licitação/contrato ganho cria a vaga.

### R10. Notificações dos hospitais com contador — P2
- **Pedido:** "preciso ter a notificação e o reloginho: dois dias notificado, três dias…".
- **Existe:** nada específico.
- **Lacuna:** registrar notificação recebida do hospital (contrato, assunto, data), contador até resolver, aviso escalonado. Confirmar o que é "notificação" no processo deles.

### R11. Concorrentes e pessoas dos concorrentes — P2
- **Pedido:** aba Concorrentes alimentada pelas licitações e aba de vagas/pessoas que trabalham nos concorrentes (LinkedIn) para recrutar (ex.: BNG em SP).
- **Existe:** `empresas_concorrentes`, `licitacao_item_concorrentes`, BI › Competitiva, leitura de ata por IA.
- **Lacuna:** painel "quem está ganhando" + lista de pessoas-chave por concorrente (assistido, sem raspar LinkedIn em massa).

### R12. Memória de problema com o médico — P2
- **Pedido:** a médica que largou o plantão de 24h em Navegantes "como é que volta na minha lista?".
- **Existe:** `blacklist` (bloqueia de vez).
- **Lacuna:** ocorrência com motivo na ficha + alerta quando o médico reaparece em lista/campanha/escala (sem necessariamente bloquear).

### R13. Pós-primeiro-plantão — P3
- **Pedido:** mensagem perguntando como foi o primeiro plantão/ambulatório.
- **Existe:** `drescala-sync` / `escalas-api`, mas a tela de escalas não sincroniza com o Dr. Escala ("isso aí é coisa de antes").
- **Lacuna:** sincronizar Dr. Escala, detectar primeiro plantão, mensagem automática. Depende da API do Dr. Escala.

### R14. Contratos: perguntar e ser avisado — P2
- **Pedido:** "uma janelinha pra me fazer as perguntas" e alertas de datas (Bianca deve sair).
- **Existe:** `contratos-avisos`, `vencimentos-alertas`.
- **Lacuna:** caixa de pergunta em linguagem natural sobre contratos dentro do Sigma (não via assistente pessoal do Maikon).

### R15. Relacionamento automático — P3
- **Pedido:** mensagem de parabéns automática.
- **Existe:** aniversariantes listados em `/relacionamento-medico`, sem envio.
- **Lacuna:** envio automático com modelo aprovado.

### R16. Limpeza e marca — P1 (rápido)
- **Pedido:** tirar o que não serve ("reseta tudo"): Triagem PNCP e PNCP × Effecti (para o Maikon), campos de psicólogo/fono e "idades", Marketing (ninguém usa), Patrimônio (nunca preenchido), "Minhas OS"; logo da GSS grande ("Sigma" foi nome do Ewerton, pode mudar).
- **Lacuna:** menu por papel (dono vê o que importa), esconder telas mortas, marca GSS.

### R17. Rotinas automáticas na VPS da GSS — P1 (pode começar já)
- **Ideia do Raul:** instalar o **Hermes na VPS KVM4 da GSS**, usando a assinatura de IA da GSS (Claude/Gemini, confirmado pelo Maikon) como motor das rotinas que dependem de navegador.
- **Rotinas mapeadas:**
  1. **CFM — foto e situação do médico:** abrir a consulta pública do CFM no navegador, buscar por CRM/UF, salvar a foto e a situação na ficha do médico. Primeira rotina (Raul, 08/11).
  2. **CFM — universo por especialidade:** atualizar `cfm_medicos_staging` periodicamente (última carga 07/06).
  3. **CNES:** locais onde o médico trabalha.
  4. **Life's Hub:** extrair lista por especialidade/região (sem API; navegador logado — D3).
  5. **Processos:** conforme a fonte decidida (D4).
  6. **PDF das vagas às 7h** (R9) — pode rodar no cron do Supabase em vez da VPS.
- **Regra:** a VPS só executa; o resultado sempre volta para uma tabela do Sigma (fila de pedidos → VPS pega → grava resultado).
- **Fora daqui:** MCP para o assistente pessoal do Maikon ("Dots") é do CRM dele, não da GSS, e não entra agora (Raul, 08/11).

### R18. Acessos — P1 (imediato)
- **Pedido:** login para o João e o Eron; Maikon ver financeiro e aprovações.
- **Feito:** conta do Maikon `@gestaoservicosaude.com.br` (admin + diretoria) em 07/11.
- **Falta:** e-mails do João e do Eron (o Maikon mandou no chat da reunião; não estão na transcrição).

## 5. Desenho proposto

```
                 Maikon / João / Eron
                  │            │
       tela do Sigma + assistente de criação de campanha
                  │
        ┌─────────▼───────────────────────────────────────┐
        │  Sigma (Supabase): campanhas, listas, leads,    │
        │  vagas, notificações, dossiê, BI, conversas     │
        └───────▲───────────────▲──────────────▲──────────┘
                │               │              │
   Chakra (só API oficial,   e-mail       VPS KVM4 da GSS
   vários números)
   coexistência + histórico  Resend/Gmail  Hermes + Claude/Gemini
                                            ├ Life's Hub (navegador)
                                            ├ CFM: universo + foto
                                            ├ CNES: vínculos
                                            ├ processos
                                            └ PDF das vagas 7h
```

Princípios:
- **O Sigma guarda e mostra; a VPS executa o que é lento ou depende de navegador.** Resultado sempre volta para uma tabela do Sigma (nada fica só na VPS).
- **O assistente de campanha nunca dispara sozinho:** cria a campanha só depois do "sim" do dono.
- **WhatsApp só pela API oficial (Chakra).**
- **LinkedIn e Instagram só assistidos.**

## 6. Riscos e decisões abertas

| # | Ponto | Por que importa | Quem decide |
|---|---|---|---|
| D1 | ~~O que é o "Dots"~~ | Resolvido 08/11: é do CRM pessoal do Maikon; MCP fora deste mapa | — |
| D2 | Assinatura do Claude da GSS como motor no Hermes | Uso fora do Claude Code pode ferir os termos da assinatura (mesma ressalva registrada no projeto da Wood); alternativa é API paga ou Gemini via Fred | Raul |
| D3 | Life's Hub sem API | Automação de navegador logada pode violar o contrato do Life's Hub e quebra quando a tela muda | Raul + Maikon (login com o Vinícius) |
| D4 | Fonte de processos | Não há busca pública nacional por nome de parte (DataJud busca por número); serviços como Escavador/Jusbrasil são pagos | Maikon (custo) |
| D5 | Portal do CFM (foto) | Consulta pública pode ter captcha; volume baixo (só médico quente) reduz o risco | Raul testa |
| D6 | OpenAI sem crédito desde 14/10 | IA das campanhas, objeções e qualificação dependem disso | GSS (crédito) ou trocar para Gemini |
| D7 | Quem cadastra vaga e notificação | Sem responsável, a tela nasce vazia (receio do Raul na reunião) | Maikon nomeia responsável |
| D8 | "Lista do Thiago" | Pode já estar na base `leads` | Raul confirma |
| D9 | Pedidos da Ramone (radiologia) em espera | Maikon pediu para passar por ele | Raul alinha com a Ramone |
| D10 | Tela do Gmail não publicada; publicação no Lovable é manual | Tudo de front só vale depois do Publish | Raul |

## 7. Plano de 10 dias (proposta)

| Onda | Dias | Entrega | Requisitos |
|---|---|---|---|
| 0 | seg 09/11 | Acessos João/Eron, menu limpo e marca GSS, crédito/IA destravada | R18, R16, D6 |
| 1 | 09–11/11 | **Assistente de IA que cria a campanha** (lista existente ou nova, template, números oficiais), com universo CFM e lista automática do CRM; tela da campanha para o dono com objeções | R1, R2, R3 (parte CRM), R7 |
| 2 | 11–12/11 | Vagas em aberto com relógio + PDF 7h no grupo; memória de problema do médico | R9, R12 |
| 3 | 09–14/11 (em paralelo, começa já) | Hermes na VPS da GSS; rotina CFM (foto + situação) primeiro; depois CNES, Life's Hub e dossiê do médico quente | R17, R6, R3 (Life's Hub) |
| — | sáb 14/11 | Revisão com o Maikon | — |
| 4 | 16–17/11 | IA qualifica e pede currículo; tempo de resposta por pessoa | R5, R8 |
| Depois | — | Notificações dos hospitais, concorrentes, contratos por pergunta, pós-plantão, parabéns | R10, R11, R14, R13, R15 |

### Checklist

- [ ] R18 Acessos João e Eron
- [ ] R16 Menu limpo + marca GSS
- [ ] D6 IA das campanhas com crédito/fallback
- [ ] R1 Assistente de IA que cria a campanha (só API oficial)
- [ ] R2 Universo CFM na campanha e no BI (+ rotina de atualização)
- [ ] R3 Lista automática (CRM + CFM) · Life's Hub na VPS
- [ ] R7 Tela da campanha para o dono + objeções + BI por especialidade
- [ ] R9 Vagas em aberto + PDF 7h
- [ ] R12 Memória de problema do médico
- [ ] R6 Dossiê do médico quente
- [ ] R17 Hermes na VPS + rotina CFM (foto) · CNES · Life's Hub
- [ ] R5 IA qualifica + currículo
- [ ] R8 Todos os números + tempo de resposta por pessoa
- [ ] R4 Vários números Chakra por campanha · e-mail com imagem · LinkedIn/Instagram assistidos
