# Plano de execução — GSS com o dono no comando (para rodar com `/goal`)

> **Spec:** `docs/arquitetura/gss-dono-no-comando-mapa.md` (mapa da reunião com o Maikon, revisado em 08/11).
> **Escrito em:** 08/11/2026, a partir da revisão do Raul na sessão (assistente de campanha primeiro, Conversas no formato WhatsApp, Configurações › WhatsApp, menu enxuto, vagas, investigação da Chakra).
> **Revisão 08/11 (2ª rodada):** decisões D-A a D-G respondidas pelo Raul (tabela no fim); entram a Fase 7 (Raio-X do mercado — `docs/arquitetura/bi-raio-x-mercado-medico.md`), a Fase 8 (agente com a persona do Maikon que converte) e a Fase 9 (LinkedIn e Instagram no mesmo Kanban); `/impeccable` em toda tela.
> **Para agentes:** executar fase a fase, na ordem. Cada tarefa tem "Pronto quando" verificável. Não pular o portão de tela nem o teste real de envio.

**Objetivo:** o dono da GSS cria uma campanha conversando com um assistente, usando só os números oficiais (Chakra); vê e responde as conversas de todos os números numa tela igual ao WhatsApp; enxerga os números disponíveis em Configurações › WhatsApp; acompanha as vagas em aberto (plantão e ambulatório) com os dias contados; e o menu mostra só o que a GSS usa.

**Arquitetura:** React + Vite + shadcn no front (publicação manual no Lovable), Supabase self-hosted (Postgres, edge functions Deno, `pg_cron`). WhatsApp só pela Chakra (`whatsapp_chakra_connections` → `whatsapp_official_senders` → `sigzap_instances` com `provider='chakra'`). A VPS KVM4 da GSS executa rotinas de navegador e grava o resultado em tabelas do Sigma.

### Texto sugerido para o `/goal`

```
/goal Executar docs/arquitetura/plano-goal-gss-dono-no-comando.md da Fase 0 à Fase 9, na ordem
(Fase 5 pode correr em paralelo).
Cada tarefa só fecha quando o "Pronto quando" dela for verdade (build sem erro, SQL de conferência,
portão de tela em 1440 e 1024 px, envio real de teste quando houver WhatsApp). Commit + push na main
a cada tarefa (identidade Raul, pull antes). Edge alterada = deploy confirmado. Tabela nova = GRANT.
Parar e perguntar ao Raul nas decisões marcadas com 🛑.
```

---

## Regras globais (valem para toda tarefa)

- Commit só como `Raul <raul.sxs27@gmail.com>`; `git fetch` + `git pull` antes; push direto na main.
- Front só vale em produção depois do **Publish no Lovable** (manual, Raul). Edge e DDL vão direto.
- Edge editada em `supabase/functions/*` termina com `supabase functions deploy <nome> --project-ref zupsbgtoeoixfokzkjro` confirmado.
- `CREATE TABLE` sempre seguido de `GRANT ... TO authenticated, service_role` e RLS.
- Texto com acento gravado por script: UTF-8 explícito; conferir com `SELECT` antes de usar.
- **WhatsApp só pela API oficial (Chakra).** Nada novo usa Evolution.
- **Status da Chakra/Meta não prova nada; só envio real de teste prova** (feedback de 05/11). Envio de teste vai para o número do Raul, com o "ok" dele.
- Tela: carregar a skill `qualidade-de-tela` antes; rodar **`/impeccable`** (critique + polish) em cada tela nova antes de fechar a tarefa; portão visual só em **1440 e 1024 px** (ninguém usa o Sigma no celular).
- Não há suíte de testes no repo. Verificação = `npm run build` sem erro + SQL de conferência + portão de tela + teste manual no navegador (localhost).
- Esconder do menu ≠ apagar: as rotas continuam existindo (reversível).

## Pontos de atenção (o que mais pode quebrar)

1. **Template é por WABA, não por número.** Uma campanha com vários números precisa do mesmo template aprovado em cada WABA. Hoje o padrão `gss_oportunidade_sair_20261026` está aprovado em 5 números (3416, 2474, 3444, 0538, 3761), **reprovado** no da Ester (5309) e **ausente** no 8860 (Amni), 6429 e 9264. O assistente só pode oferecer números onde o template escolhido existe aprovado.
2. **Fora da janela de 24 h só sai template.** Na tela de Conversas, se a última mensagem do médico tem mais de 24 h, o campo de texto livre vira "escolher template".
3. **Evolution fica como está nas campanhas antigas** (decisão D-A). Conferido em 08/11: o número "Prospecção radiologia" está **desconectado** e o último envio foi em **30/10** — nada saiu em novembro; ainda chegam respostas atrasadas (até 03/11). As 7 campanhas marcadas "ativa" em Evolution não disparam. A tarefa 2.4 só tira a Evolution da **criação** de campanha nova.
4. **Grupo de WhatsApp não existe na API oficial.** Decidido (D-C): o PDF das 7h vai por **e-mail para os sócios** e por **WhatsApp oficial para o Maikon** (individual).
5. **OpenAI sem crédito desde 14/10.** O assistente de campanha não pode depender de LLM para funcionar: as perguntas são guiadas por botões; a IA só ajuda em texto livre e na sugestão de template, com fallback. **Efeito medido:** dos médicos que responderam depois de 14/10, só 17% receberam alguma resposta nossa (47 de 273); antes eram 43%. É a maior causa de não conversão (Fase 8).
6. **Número da Amni (99018-860) é só para as automações financeiras** (Raul, 08/11). Nunca entra em campanha de prospecção.

---

## Fase 0 — Diagnóstico dos números oficiais (Chakra) · 0,5 dia

**Por quê:** o Raul vê erros ("nome não existe", "nome recusado", pagamento) e não sabe se impedem o disparo.

**Já levantado no banco em 08/11 (14 dias de mensagens):**

| Número | Nome | Conta | Nome de exibição | Qualidade | Enviadas / entregues / falhas (14 d) | Leitura |
|---|---|---|---|---|---|---|
| 9292-0538 | Gestão de Serviços de Saúde | GSS | NON_EXISTS | GREEN | 983 / 351 / 591 | Envia, mas com muita falha: 131049 (limite de marketing da Meta por destinatário), 131026 (não entregável), 131031 (conta travada em 05/11) |
| 93618-3416 | Dr Maikon Madeira | GSS | NON_EXISTS | — | 529 / 221 / 1 | **Disponível** |
| 93618-3444 | Gestão Serviço Saúde | GSS | NON_EXISTS | — | 339 / 209 / 1 | **Disponível** |
| 93618-3761 | Maicon Madeira | GSS | NON_EXISTS | — | 195 / 186 / 3 | **Disponível** (teve 131042 pagamento) |
| 9713-2474 | GSS - Gestao Servico saude | GSS | NON_EXISTS | — | 328 / 39 / 3 | Envia; entrega baixa a conferir (130472 / 131042) |
| 99018-860 | Amni Julia - GSS | **Pulse (Raul)** | NON_EXISTS | GREEN | 390 / 48 / 0 | **Só financeiro** — fora da prospecção (não precisa do template de prospecção) |
| 9233-5309 | Ester - GSS | GSS | NON_EXISTS | GREEN | 389 / 71 / 1 | Template padrão **reprovado**; WABA com 141006 (pagamento) |
| 9264-7508 | Maikon Madeira | GSS | NON_EXISTS | **RED** | 25 / 0 / 0 | Último entregue 16/10 — **não usar** até conferir |
| 6429-1713 | Maikon Madeira | GSS | **DECLINED** | — | 0 / 0 / 0 | Sem envio; último evento 24/09 |
| 9722-2007 | Dr. Maikon Madeira | GSS | NON_EXISTS | — | sem instância no Sigma | **Nenhum evento de webhook** — conversas desse número não chegam |

**Conclusão parcial:** `NON_EXISTS` **não impede o envio** — os números que mais entregam estão todos com `NON_EXISTS`. Indica que nunca foi pedido um nome de exibição pela API (no modo coexistência o nome vem do app WhatsApp Business). `DECLINED` (6429) é nome recusado pela Meta. `messaging_limit_tier` está vazio em todos: o Sigma não sincroniza o limite.

### Tarefa 0.1 — Fechar o diagnóstico
- **Arquivos:** criar `docs/arquitetura/chakra-numeros-diagnostico.md`.
- Para cada número: chamar `chakra-connect` (ação de status/sync) e guardar `name_status`, `quality_rating`, `messaging_limit_tier`, estado da conta de pagamento e o motivo bruto do erro; separar **conta GSS** × **conta Pulse**.
- Confirmar na documentação da Meta/Chakra o significado de `NON_EXISTS`, `DECLINED`, `131049`, `131026`, `130472`, `141006` e onde se pede o nome de exibição de um número em coexistência.
- 9722-2007: descobrir por que não chega webhook (conexão sem `sigzap_instances`, webhook apontando para outro lugar?).
- 🛑 Envio de teste em cada número para o celular do Raul (pedir "ok" antes).
- **Pronto quando:** o doc diz, por número, "disponível / disponível com cuidado / não usar" com a prova (envio de teste entregue ou erro bruto) e o que o Vinícius precisa fazer (pagamento, nome de exibição, reconectar).

### Tarefa 0.2 — Sincronizar o que falta
- **Arquivos:** `supabase/functions/chakra-connect/index.ts`.
- Criar `whatsapp_chakra_connections.uso text not null default 'prospeccao'` (`'prospeccao' | 'financeiro' | 'pessoal'`); marcar o 99018-860 como `financeiro`. Assistente e Conversas de prospecção ignoram `financeiro`.
- Sincronizar `messaging_limit_tier` e criar `whatsapp_chakra_connections.disponibilidade` (`'disponivel' | 'atencao' | 'indisponivel'`) + `disponibilidade_motivo text`, calculados a partir da última entrega real e dos erros dos últimos 7 dias (regra: entregou nas últimas 72 h e falhas < 20% → disponível; entregou mas falhas ≥ 20% ou erro de pagamento → atenção; sem entrega em 7 dias ou qualidade RED → indisponível).
- Cron diário recalcula.
- **Pronto quando:** `select phone_e164, disponibilidade, disponibilidade_motivo from whatsapp_chakra_connections` bate com a tabela da Tarefa 0.1.

---

## Fase 1 — Menu enxuto + Configurações › WhatsApp · 1 dia

### Tarefa 1.1 — Esconder do menu o que não se usa
- **Arquivo:** `src/components/layout/Sidebar.tsx` (array `navigationGroups`, linhas ~70–121).
- Sair do menu: **Notícias**, **Disparos & Chips**, **Saúde dos Chips**, **Licitações (Robô)**, **Triagem PNCP**, **PNCP × Effecti**, **Radiologia**, **Marketing**, **Patrimônio**.
- **Minhas Tarefas fica** (Raul, 08/11: é importante).
- Rotas em `src/App.tsx` ficam (acesso direto por URL continua).
- **Pronto quando:** sidebar renderiza sem os itens; `npm run build` ok; portão de tela 1440/1024.

### Tarefa 1.2 — Configurações › WhatsApp (números oficiais)
- **Arquivos:** criar `src/components/configuracoes/NumerosOficiaisTab.tsx`; modificar `src/pages/Configuracoes.tsx` (abas `chips` e `whatsapp`, linhas 42–43): a aba "Chips WhatsApp" sai; a aba "WhatsApp API" vira **"WhatsApp"** e abre em `NumerosOficiaisTab`; `ChakraConnectCard` fica abaixo, recolhido, para conectar número novo.
- A tela responde uma pergunta: **"quais números posso usar agora?"** Tabela, um número por linha:
  - número + nome + responsável (editável);
  - selo de disponibilidade (Fase 0.2) com o motivo em uma frase;
  - última entrega real ("entregou há 2 h");
  - enviadas / falhas nos últimos 7 dias;
  - conta (GSS ou Pulse);
  - templates aprovados nesse número (contagem, com o padrão destacado);
  - ações: **Enviar teste** (para um número digitado), **Sincronizar**, **Definir responsável**.
- Ordenação: disponíveis primeiro.
- Botão no topo: **"Baixar lista (PDF)"** — a mesma lista que o Raul mandou ao Vinícius.
- **Pronto quando:** os 10 números aparecem com o selo certo; "Enviar teste" entrega (envio real); portão de tela 1440/1024.

---

## Fase 2 — Assistente de campanha · 2,5 dias (primeira entrega para o Maikon)

**Decisão de desenho:** a conversa é **guiada** (o assistente pergunta, a resposta é por botões, chips ou um campo curto). Funciona sem LLM. A IA entra só para interpretar texto livre ("pediatras em SC e PR") e sugerir o texto de um template novo, com fallback para os botões quando a IA falhar.

### Tarefa 2.1 — Campanha com vários números oficiais (back-end)
- **Migração:** `supabase/migrations/2026111000000_campanha_varios_numeros_oficiais.sql`
  - `campanhas.official_sender_ids uuid[] not null default '{}'`;
  - `campanhas.official_template_name text` (o template é escolhido **pelo nome**; cada número usa a cópia aprovada na sua WABA);
  - backfill: `official_sender_ids = array[official_sender_id]` onde existe.
- **Função SQL:** `campanha_templates_compativeis(p_sender_ids uuid[]) returns table(friendly_name text, senders_ok uuid[], senders_sem uuid[])` — para cada nome de template aprovado em pt_BR, quais números têm a cópia aprovada (casar `whatsapp_official_templates.content_sid` `chakra:<plugin_id>:...` com `whatsapp_official_senders.chakra_plugin_id`).
- **Edge:** `supabase/functions/campanha-disparo-processor/index.ts` (linhas ~629–850) e `campanha-disparo-burst/index.ts` (~193): quando `official_sender_ids` tiver mais de um, revezar entre os números (round-robin por lead, respeitando o limite diário de cada um), resolver o template pelo nome + plugin do número; número que falhar com erro de conta (131031, 131042, 141006) sai da rodada e a campanha segue nos outros. `official_sender_id` continua aceito (campanhas antigas).
- **Pronto quando:** campanha de teste com 2 números e 4 leads de teste (números do Raul/equipe, com "ok") envia 2 por número; `sigzap_messages` mostra os dois remetentes; campanhas antigas de um número seguem disparando.

### Tarefa 2.2 — Montagem da lista pelo assistente (back-end)
- **RPC:** `campanha_assistente_previa(p_especialidade_ids uuid[], p_ufs text[], p_cidades text[], p_lista_id uuid default null) returns jsonb` → `{ universo_cfm, universo_cfm_uf, leads_crm, com_whatsapp, na_blacklist, em_campanha_ativa, entram }`.
  - universo do CFM a partir de `cfm_medicos_staging` (especialidade + UF);
  - leads do CRM por especialidade (`lead_especialidades`) e região, sem blacklist, sem quem já está em campanha ativa, sem duplicata de telefone.
- **RPC:** `campanha_assistente_criar(p_payload jsonb) returns uuid` — cria `campanhas` (`whatsapp_provider='chakra'`, `status='rascunho'` até o "sim", `official_sender_ids`, `official_template_name`, limites padrão) + a lista em `campanha_listas`/`campanha_leads`; grava quem aprovou e quando (`aprovado_por`, `aprovado_em` — colunas novas).
- **Pronto quando:** a prévia de "Pediatria, SC" devolve números que batem com consultas SQL manuais; criar com o payload de teste gera a campanha e os leads sem duplicata.

### Tarefa 2.3 — Tela do assistente
- **Arquivos:** criar `src/components/campanhas/assistente/AssistenteCampanha.tsx` (página/diálogo em tela cheia), `PassosAssistente.ts` (máquina de passos), `RascunhoCampanhaPainel.tsx` (painel lateral com o rascunho sendo montado), `useAssistenteCampanha.ts`.
- Ponto de entrada: botão principal **"Nova campanha"** em `/prospeccao` abre o assistente; o formulário antigo (`NovaCampanhaProspeccaoDialog`) vira link "modo avançado".
- Passos (cada um uma pergunta do assistente, resposta por botões):
  1. **Para qual especialidade e região?** Busca de especialidade + UFs/cidades. Mostra na hora "CFM: 49.948 pediatras no Brasil, 2.310 em SC" (RPC 2.2).
  2. **De onde vem a lista?** "Usar uma lista que já tenho" (escolher em `disparo_listas`/listas importadas) · "Montar agora do CRM + CFM" · "Pedir extração do Life's Hub" (desabilitado com aviso até a Fase 5 existir). Mostra quantos entram e quantos saíram (blacklist, já em campanha).
  3. **Qual mensagem?** "Usar o modelo padrão" (pré-selecionado: o template aprovado em mais números) · outro aprovado · "Criar um novo" (texto sugerido pela IA → envio para aprovação na Meta via `chakra-connect create_template`; a campanha fica esperando a aprovação).
  4. **Por quais números?** Lista dos números **disponíveis** (Fase 0.2), com `uso='prospeccao'`, **que têm o template escolhido**; número sem o template aparece apagado com o motivo. Pergunta "quantos?" com sugestão (leads ÷ limite diário).
  5. **Resumo** em linguagem de dono: "Vou falar com 1.240 pediatras de SC, pelos números 3416 e 3444, com o modelo X, até 35 por número por dia, das 7h às 17h, em dias úteis. Termina em ~18 dias." Botões **Criar e começar** · **Criar pausada** · **Voltar**.
- IA (opcional) no passo 1 e 3: edge `campanha-assistente-ia` (Gemini se houver chave; senão OpenAI; senão desliga o campo de texto livre).
- **Pronto quando:** do zero até a campanha criada em menos de 2 minutos, sem abrir o formulário antigo; campanha criada aparece no Kanban com os números e o template certos; portão de tela 1440/1024 nos 5 passos e no estado "nenhum número tem esse template".

### Tarefa 2.4 — Tirar a Evolution da criação
- **Arquivos:** `NovaCampanhaProspeccaoDialog.tsx` (estado `whatsappProvider`, linha 83): padrão `chakra`, opção Evolution escondida.
- Campanhas antigas em Evolution ficam como estão (D-A); nada é migrado nem apagado.
- **Pronto quando:** nenhuma campanha nova nasce com `whatsapp_provider='evolution'`.

---

## Fase 3 — Conversas no formato WhatsApp · 2 dias

**Pedido do Raul:** a aba Conversas igual a uma tela do WhatsApp, com algumas trocas por cima; mexer em todos os números oficiais por aqui; tirar os números não oficiais.

### Tarefa 3.1 — Tela nova
- **Rota:** `/conversas` (a entrada "Conversas" do menu passa a apontar para ela; `/disparos/sigzap` continua por URL).
- **Arquivos:** criar `src/pages/Conversas.tsx` e `src/components/conversas/` (`BarraNumeros.tsx`, `ListaConversas.tsx`, `JanelaConversa.tsx`, `CampoMensagem.tsx`, `PainelContato.tsx`).
- Layout WhatsApp Web: lista à esquerda (busca, não lidas, foto, prévia, hora), conversa à direita (balões, ticks, mídia: áudio, imagem, PDF, vídeo; data agrupada; fundo padrão).
- **Por cima (a "alternância"):** barra de números oficiais — "Todos" + um chip por número (selo de disponibilidade e contador de não lidas). Filtros: minhas / sem dono / campanha.
- Só `sigzap_instances.provider = 'chakra'` aparece.
- Campo de mensagem: texto livre dentro da janela de 24 h; fora dela, o campo vira "Enviar modelo" (templates aprovados **do número daquela conversa**). Envio por `whatsapp-oficial-send`.
- Painel do contato (lado direito, recolhível): lead, campanha, etapa, responsável, botão "Assumir conversa" (`humano_assumiu`).
- Tempo real: assinar `sigzap_messages` e `sigzap_conversations` (resolver a lacuna de 05/11: tique e arquivo sem tempo real).
- Reaproveitar a leitura de mídia de `SigZapMediaPlayer.tsx`/`SigZapDocumentCard.tsx`; não reaproveitar `SigZapChatColumn.tsx` (2.437 linhas).
- **Pronto quando:** abrir uma conversa de cada número oficial; responder dentro da janela (envio real, com "ok"); fora da janela o campo pede modelo; mensagem nova chega sem recarregar; portão de tela 1440/1024.

---

## Fase 4 — Vagas em aberto (plantão e ambulatório) · 1,5 dia

**Pedido:** "Vaga aberta de Neurologia Navegantes… 10 dias, 15 dias, 3 meses"; criar vagas ambulatoriais etc.; lista para a reunião de quinta; PDF às 7h.

**O que existe:** nada de vaga. `demandas` e `contratos_demanda` existem vazias (tentativa antiga); `escalas_ambulatoriais` vazia; `escalas_integradas` (Dr. Escala) parou em 31/03.

### Tarefa 4.1 — Modelo de dados
- **Migração:** `supabase/migrations/2026111200000_vagas.sql` — tabela `vagas`:
  `id, cliente_id → clientes, contrato_id → contratos (nulo), hospital_nome, cidade, uf, especialidade_id → especialidades, tipo ('plantao','ambulatorio','fixa','sobreaviso'), descricao (carga, dias, horário), valor text, quantidade int default 1, prioridade ('normal','urgente'), aberta_em date default current_date, responsavel_id → profiles, status ('aberta','em_negociacao','preenchida','cancelada'), preenchida_em, medico_id → medicos, campanha_id → campanhas, observacoes, created_by, created_at, updated_at`.
- Visão `vagas_abertas_v` com `dias_aberta = current_date - aberta_em` e faixa (`ate_7`, `8_a_15`, `16_a_30`, `mais_30`).
- `GRANT` + RLS (leitura para logados com módulo contratos ou escalas; escrita para gestores e diretoria).
- Não reaproveitar `demandas` (modelo é de quantidade por período de contrato, não de vaga). 🛑 confirmar com o Raul se `demandas` pode ser removida depois.
- **Pronto quando:** inserir e ler uma vaga como gestor; `dias_aberta` correto.

### Tarefa 4.2 — Tela de vagas
- **Arquivos:** criar `src/pages/Vagas.tsx`, `src/components/vagas/NovaVagaDialog.tsx`, `src/components/vagas/VagaLinha.tsx`; rota `/vagas`; item **"Vagas em aberto"** no grupo "Operação clínica" do menu.
- Pergunta da tela: **"quais vagas estão abertas há mais tempo?"** Lista ordenada por dias em aberto, cor por faixa, filtro por tipo (plantão / ambulatório), especialidade, cidade, responsável.
- Ações por vaga: **Marcar preenchida** (pede o médico), **Criar campanha para esta vaga** (abre o assistente da Fase 2 já com especialidade e cidade), editar, cancelar.
- Cadastro rápido: hospital/cliente, especialidade, tipo, cidade, descrição, responsável — 6 campos.
- **Pronto quando:** cadastrar uma vaga ambulatorial e uma de plantão, vê-las com os dias, abrir o assistente pré-preenchido; portão de tela 1440/1024.

### Tarefa 4.3 — Relatório diário das 7h
- **Edge:** criar `supabase/functions/vagas-relatorio-diario/index.ts` — gera PDF (vagas abertas por dias, as mais antigas no topo, total por especialidade), guarda no Storage, envia.
- **Cron:** `pg_cron` às 10:00 UTC (7h BRT), dias úteis.
- Entrega (D-C): **e-mail** para os sócios (Maikon, João, Eron) com o PDF anexo + **WhatsApp oficial para o Maikon**, individual, com template de utilidade com documento no cabeçalho (`gss_vagas_diario_v1`, aprovar num número da conta GSS, ex.: 93618-3444).
- **Pronto quando:** rodar a edge manualmente gera o PDF certo, o e-mail chega aos sócios e o WhatsApp chega ao Maikon (envio real, com "ok").

---

## Fase 5 — Rotinas na VPS da GSS · 2 dias (pode rodar em paralelo às Fases 2–4)

### Tarefa 5.1 — Base da VPS
- **Hermes com a assinatura de IA da GSS** (D-D) na VPS KVM4 `root@147.93.71.48`, em container próprio no Easypanel, com navegador (Playwright/Chromium) para logar no Life's Hub e consultar o CFM. Credenciais em variáveis de ambiente da VPS (nunca no repo nem no Vault).
- Fila no Sigma: tabela `rotina_pedidos (id, tipo text, payload jsonb, status ('pendente','executando','feito','erro'), resultado jsonb, erro text, tentativas int, criado_em, iniciado_em, concluido_em)` + `GRANT`. A VPS consulta a fila (service_role), executa e grava o resultado.
- **Pronto quando:** pedido `tipo='ping'` vai de pendente a feito em menos de 1 min.

### Tarefa 5.2 — Foto e situação do médico no CFM
- Rotina `cfm_foto`: entrada `{crm, uf}`; abre a consulta pública do CFM no navegador, lê nome, situação, especialidades e foto; salva a foto no Storage (`medicos-fotos/<uf>-<crm>.jpg`) e grava `leads.cfm_foto_url`, `leads.cfm_situacao`, `leads.cfm_consultado_em` (colunas novas).
- Gatilho: lead vira "quente" (etapa do Kanban) ou botão "Buscar no CFM" na ficha.
- Volume baixo (só médico quente); intervalo entre consultas; captcha → marcar erro e seguir (sem burlar captcha).
- **Pronto quando:** 5 CRMs de teste com foto e situação na ficha.
- 🛑 **Bloqueio (08/11):** a foto só sai pela API `medicos/buscar_foto`, que exige token de reCAPTCHA (sem token: `{"status":"erro","dados":"não permitido"}`; o `security_hash` da base não basta). Foto automática = burlar captcha, fora do plano. Situação e especialidades já estão na base CFM (`cfm_medicos_staging`, 978 mil na VPS) e não precisam de consulta nova. Decisão do Raul pendente sobre a foto.

> **5.1 entregue (08/11):** fila `rotina_pedidos` + RPCs `rotina_pedir` / `rotina_pegar` / `rotina_concluir`, edge `rotinas-fila` (chave `ROTINAS_WORKER_KEY`, a VPS não recebe a service role), worker `vps/sigma-rotinas` como serviço systemd `sigma-rotinas` em `/opt/sigma-rotinas`. Ping de pendente a feito em 1,9 s. O Hermes entra como executor das rotinas que precisam de agente (Life's Hub).

### Tarefa 5.3 — Depois da 5.2
- **Life's Hub** (D-E decidido: o Hermes loga): rotina `lifeshub_lista` — entrada `{especialidade, ufs, cidades}`, extrai a lista, grava em `disparo_listas` como lista "Life's Hub — <especialidade> — <data>"; o passo 2 do assistente passa a oferecer "Pedir extração do Life's Hub".
- CNES (vínculos do médico), atualização periódica do universo CFM (`cfm_medicos_staging`), processos (🛑 D-F fonte). Cada uma vira uma rotina nova na mesma fila.

---

## Fase 6 — Tela da campanha para o dono + objeções · 1,5 dia

- **Arquivos:** criar `src/components/campanhas/PainelDonoCampanha.tsx`; aba "Resumo" padrão ao abrir uma campanha.
- Funil em linguagem de dono: universo CFM → na lista → enviados → entregues → responderam → interessados → convertidos, por número e por canal (WhatsApp, e-mail).
- Bloco **Objeções:** lê `conversa_classificacao` (Fase 7.2) filtrada pela campanha — mesma classificação do Raio-X, sem edge separada.
- Fazer depois da 7.2 (ou mostrar "objeções em processamento" até lá).
- **Pronto quando:** a campanha de Pediatria mostra o funil com números que batem com o banco e as objeções agrupadas; portão de tela 1440/1024.

## Fase 7 — Raio-X do mercado médico (BI de argumento) · 2,5 dias

**Spec completa:** `docs/arquitetura/bi-raio-x-mercado-medico.md`. Resumo: a tela que o Maikon abre na frente do hospital — mercado (CFM) → o que já fizemos → como o mercado responde → por que dizem não → o que destrava. Modo apresentação (sem nome de médico, PDF) e modo gestão (operação).

### Tarefa 7.1 — Universo CFM normalizado
- Migração: `cfm_medico_especialidades (nu_crm, sg_uf, especialidade_id, rqe)` a partir do texto de `cfm_medicos_staging.especialidade` ("&PEDIATRIA - RQE Nº: 1261", várias por médico) casado com `especialidades.nome/aliases`; relatório do que não casou.
- **Pronto quando:** total de pediatras e ginecologistas (Brasil e SC) bate com contagem manual por texto; < 2% de textos sem casamento.

### Tarefa 7.2 — Classificação das conversas
- Tabela `conversa_classificacao` + edge `conversas-classificar` + cron 2 h + backfill (campos e categorias na spec, seção 3 e 6).
- **Pronto quando:** ≥ 95% das conversas com resposta classificadas; 50 conferidas por uma pessoa com ≥ 85% de acerto no resultado.

### Tarefa 7.3 — Funções do BI
- `bi_raiox_funil`, `bi_raiox_objecoes`, `bi_raiox_destrava` (assinaturas e regras na spec, seções 4 e 6).
- **Pronto quando:** Pediatria/SC e Ginecologia/Brasil batem com SQL manual.

### Tarefa 7.4 — Tela e PDF
- **Arquivos:** `src/components/bi/raiox/` (`RaioXMercado.tsx`, `BlocoMercado.tsx`, `BlocoEsforco.tsx`, `BlocoFunil.tsx`, `BlocoObjecoes.tsx`, `BlocoDestrava.tsx`, `ModoGestao.tsx`); aba **"Raio-X do mercado"** primeira no BI; botões Apresentar e Baixar PDF; atalhos na campanha e na vaga.
- Skills: `qualidade-de-tela`, `dataviz`, `kpi-dashboard-design`, `/impeccable`.
- **Pronto quando:** critérios da spec, seção 8.

## Fase 8 — Agente com a persona do Maikon que converte · 2 dias

**Problema medido:** quem responde não é atendido (17% receberam resposta depois de 14/10) e, quando é, não converte (Pediatria: 666 responderam → 20 convertidos). Nas respostas reais, os médicos pedem **valor, dias e carga** (155 mensagens citando valor em 120 dias), muitos são **secretárias** e alguns **indicam colegas** — o roteiro atual não trata esses casos.

### Tarefa 8.1 — A IA nunca para em silêncio
- `supabase/functions/campanha-ia-responder/index.ts` (usa `gpt-4o`, linhas ~522 e ~588): cadeia de provedores (Gemini → OpenAI) e, se todos falharem, a conversa vai para a fila "esperando resposta" com aviso ao responsável (WhatsApp/e-mail) em vez de ficar muda.
- Depende de crédito de IA (🛑 D-G).
- **Pronto quando:** simular falha do provedor principal → resposta sai pelo segundo; falha de todos → alerta chega e a conversa aparece no modo gestão do Raio-X.

### Tarefa 8.2 — Persona do Maikon
- Tom tirado das mensagens reais que o Maikon escreve pelos números dele (amostra de conversas `from_me` com `sent_by_user_id` dele): saudação, tamanho das frases, como fala de valor. Gravar como `persona_contexto` padrão do briefing (`b.persona_contexto`, linha ~1359), editável por campanha.
- Apresentação honesta: "Sou o Maikon, médico e sócio da GSS" — e o agente responde que é assistente se perguntarem (sem fingir ser humano quando perguntado diretamente).
- **Pronto quando:** o Maikon lê 5 conversas simuladas e aprova o tom.

### Tarefa 8.3 — Roteiro por situação
Usar a mesma classificação da Fase 7 (em tempo real, na resposta) para escolher o próximo passo:
| Situação | O agente faz |
|---|---|
| Pergunta valor / dias / carga | Responde com a faixa do briefing (`valor_min`–`valor_max`, `valor_por`) e as datas; termina pedindo disponibilidade |
| Distância | Oferece o formato que reduz deslocamento (plantão concentrado, moradia, se o briefing tiver); pergunta onde mora; grava a cidade |
| Agenda cheia | Oferece escala flexível / sobreaviso / datas avulsas; pede para voltar a falar em 30 dias (agenda tarefa) |
| Secretária / consultório | Mensagem curta "para encaminhar à doutora" + pede o contato direto |
| Indicação | Agradece, pede nome e telefone do indicado, **cria lead novo** ligado a quem indicou |
| Desconfiança | Explica de onde veio o contato (base pública do CFM), oferece sair da lista (opt-out vai para `blacklist`) |
| Interessado | Qualificação curta (de onde é, formação, residência — R5), pede **currículo** (PDF anexado ao lead) e passa para humano com resumo |
- **Pronto quando:** cada situação testada com uma conversa simulada; indicação gera lead; currículo recebido aparece na ficha.

### Tarefa 8.4 — Medir
- Modo gestão do Raio-X mostra por campanha: % resposta, % interessado, % convertido, tempo da primeira resposta, por roteiro.
- **Pronto quando:** os números da semana aparecem e batem com o banco.

## Fase 9 — LinkedIn e Instagram na mesma campanha e no mesmo Kanban · 2 dias

**Pedido do Raul:** a campanha gera leads e ações de LinkedIn e Instagram junto com WhatsApp e e-mail, tudo no mesmo Kanban. As ferramentas ainda vão ser escolhidas pelo Raul (🛑 D-I); o desenho abaixo não depende delas.

### Tarefa 9.1 — Canais no modelo
- `campanhas.canais text[]` (`whatsapp`, `email`, `linkedin`, `instagram`) — o assistente (passo 4) pergunta os canais.
- Tabela `campanha_toques (id, campanha_lead_id, canal, tipo ('conexao','mensagem','seguir','dm','email','whatsapp'), status ('sugerido','feito','respondido','falhou'), executado_por, executado_em, url_perfil, observacao)` + `GRANT`.
- `leads.linkedin_url`, `leads.instagram_handle` (se ainda não existirem).
- **Pronto quando:** campanha com 4 canais guarda toques por canal.

### Tarefa 9.2 — Kanban com canais
- Card do Kanban (`CampanhaProspeccaoKanban.tsx`) mostra ícones por canal com estado (cinza = não tentado, azul = enviado, verde = respondeu).
- Lead que chega só por LinkedIn/Instagram (sem telefone) entra no mesmo Kanban, na mesma etapa.
- **Pronto quando:** card com WhatsApp + LinkedIn mostra os dois estados; `/impeccable` + portão 1440/1024.

### Tarefa 9.3 — Fila assistida
- Tela "Fila do dia" do responsável: até 20 conexões de LinkedIn e N ações de Instagram sugeridas, com o texto pronto e o link do perfil; a pessoa executa e marca "feito" (modo assistido — automatizar arrisca bloquear a conta, decisão de 05/11).
- Integração com a ferramenta que o Raul escolher entra aqui depois (D-I).
- **Pronto quando:** a fila mostra 20 sugestões, marcar "feito" atualiza o card.

## Depois do pacote (fora do `/goal` atual)

Memória de problema do médico (R12) · notificações dos hospitais (R10) · concorrentes (R11) · contratos por pergunta (R14) · pós-primeiro-plantão (R13) · parabéns (R15) · CNES e processos (Fase 5.3).

---

## Decisões que param o `/goal` (🛑)

| # | Decisão | Opções |
|---|---|---|
| D-A | ✅ Campanhas antigas em Evolution e radiologia | **Manter como estão** (Raul, 08/11). Radiologia desconectada desde 30/10 |
| D-B | ✅ Menu | **Esconder Marketing e Patrimônio; Minhas Tarefas fica** |
| D-C | ✅ PDF das 7h | **E-mail para os sócios + WhatsApp oficial para o Maikon** |
| D-D | ✅ Motor da VPS | **Hermes com a assinatura da GSS**, logando no Life's Hub e no CFM |
| D-E | ✅ Life's Hub | **O Hermes loga** (credencial com o Vinícius) |
| D-F | 🛑 Fonte de processos | Escavador / Jusbrasil (pago) · só tribunais com busca pública |
| D-G | 🛑 Crédito de IA | Recarregar OpenAI · chave Gemini via Fred — **bloqueia as Fases 7.2 e 8** |
| D-H | 🛑 Envios de teste | "ok" do Raul a cada rodada de testes reais |
| D-I | 🛑 Ferramentas de LinkedIn e Instagram | Raul vai pesquisar alternativas; a Fase 9 começa em modo assistido |

## Checklist

- [ ] 0.1 Diagnóstico dos números oficiais
- [ ] 0.2 Disponibilidade calculada + limite sincronizado
- [ ] 1.1 Menu enxuto
- [ ] 1.2 Configurações › WhatsApp
- [ ] 2.1 Vários números oficiais por campanha
- [ ] 2.2 Prévia e criação pelo assistente (RPC)
- [ ] 2.3 Tela do assistente
- [ ] 2.4 Evolution fora da criação
- [ ] 3.1 Conversas no formato WhatsApp
- [ ] 4.1 Tabela de vagas
- [ ] 4.2 Tela de vagas
- [ ] 4.3 PDF das 7h
- [ ] 5.1 Base da VPS + fila
- [ ] 5.2 Foto do CFM
- [ ] 6 Tela da campanha para o dono + objeções
- [ ] 7.1 Universo CFM normalizado
- [ ] 7.2 Classificação das conversas
- [ ] 7.3 Funções do Raio-X
- [ ] 7.4 Tela Raio-X + PDF
- [ ] 8.1 IA nunca para em silêncio
- [ ] 8.2 Persona do Maikon
- [ ] 8.3 Roteiro por situação
- [ ] 8.4 Medição da conversão
- [ ] 9.1 Canais no modelo
- [ ] 9.2 Kanban com canais
- [ ] 9.3 Fila assistida LinkedIn/Instagram
