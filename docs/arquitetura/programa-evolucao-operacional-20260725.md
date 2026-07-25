# Programa de evolução operacional do Sigma — 2026-07-25

Fonte: reunião presencial com a equipe de captação, consolidada em 25/07/2026.

## Objetivo

Transformar o Sigma na fonte confiável da operação de prospecção: mensagens,
estado dos chips, contexto do médico, tarefas, campanhas e incidentes devem ser
rastreáveis no CRM sem depender de aparelho, planilha, post-it ou memória.

## Princípios

1. Corrigir causa raiz antes de criar atalhos de interface.
2. Não alterar sem evidência uma regra de negócio já usada pela operação.
3. Telefone identifica o médico; chip identifica o canal, não uma nova pessoa.
4. Opt-out global é diferente de perda em uma oportunidade.
5. Campanha representa a oportunidade; estratégia representa um recorte testável.
6. Toda entrega precisa de critério de aceite, evidência técnica e validação visual.

## Matriz de entrega

| ID | Capacidade | Estado auditado | Critério de aceite |
|---|---|---|---|
| E01 | Histórico unificado entre chips | Parcial; `vw_lead_timeline` existe, mas 17.378 conversas estavam órfãs em 25/07 | Conversa de qualquer chip aparece no mesmo médico; auditoria informa zero conversas vinculáveis pendentes |
| E02 | Importação após reconexão | Parcial; worker ativo, 21 jobs em catch-up, 2 live e 1 instância aberta sem job | Toda instância ativa tem job; reconexão reinicia catch-up; worker sem erros |
| E03 | Outbox resiliente | Implementado, ainda em alterações locais | Envio aceito pela Evolution nunca duplica; desconexão não esgota tentativas; número inexistente falha terminal |
| E04 | Estados detalhados do chip | Implementado localmente; aguarda publicação | UI diferencia operacional, desconectado, restrições temporárias/web, banido e indisponibilidade do aparelho |
| E05 | Histórico de restrições | Implementado localmente; aguarda publicação | Cada transição registra tipo, início/fim, reincidência, campanha, proxy e operadora |
| E06 | Contingência pelo aparelho | Implementado localmente; aguarda publicação | Operador abre contingência, informa motivo e recebe pendência automática de sincronização |
| E07 | Monitor coerente de campanha | Implementado localmente; aguarda publicação | Uma fonte de verdade para configurada, pronta, rodando, pausada, sem chip, restrita e finalizada |
| C01 | Campanha × estratégia | Implementado localmente; aguarda publicação | Campanha possui estratégias próprias com público, ordem, abordagem, período e status |
| C02 | BI por estratégia | Implementado localmente; aguarda publicação | Funil e esforço filtram e comparam estratégias |
| C03 | Adição direta de médicos | Implementado localmente; aguarda publicação | Busca por nome/CRM/UF/cidade/especialidade, seleção individual/massa e associação à estratégia |
| C04 | Ordem de regiões | Implementado localmente; aguarda publicação | Prioridade configurada controla a entrada real na fila |
| C05 | Reutilizar briefing | Implementado localmente; aguarda publicação | Campanha importa briefing existente sem copiar texto manualmente |
| C06 | Duplicação correta | Implementado localmente; aguarda publicação | Duplica contexto e permite trocar região, estratégia, público e status sem perder histórico |
| C07 | Campos por modalidade | Implementado e revalidado localmente | Campanha manual não exige campos exclusivos da IA |
| C08 | Filtros de campanha | Implementado localmente; aguarda publicação | Filtro direto por modalidade, estado operacional e erro |
| P01 | Status Sem WhatsApp | Implementado localmente; aguarda migração/publicação | Sai de pendentes sem contar como perda; sugere canal alternativo |
| P02 | Motivos de encerramento | Implementado localmente; aguarda migração/publicação | Aposentado, distância, sem WhatsApp, opt-out, inválido, indisponível e sem interesse |
| P03 | Opt-out global | Implementado no backend | “Não contatar” bloqueia campanhas futuras e fica auditável |
| P04 | Tags controladas | Implementado localmente; aguarda publicação | Catálogo administrável, sem explosão de etiquetas equivalentes |
| P05 | Anotação global no atendimento | Implementado localmente; aguarda publicação | Criar e ler sem sair da conversa; autor e data visíveis |
| P06 | Busca no perfil do médico | Implementado localmente; aguarda publicação | Busca estruturada por região, modalidade, residência, disponibilidade e remuneração |
| P07 | Tarefa/follow-up no médico | Implementado localmente; aguarda publicação | Responsável, data/hora, lembrete, origem e vínculo com campanha/estratégia |
| P08 | E-mail integrado | Implementado localmente; aguarda publicação | Botão no card, template da campanha e registro na timeline |
| P09 | Importação de bloqueios | Implementado localmente; aguarda publicação | Planilha classifica opt-out, aposentado e perda sem misturar escopos |
| P10 | Reaproveitar perdidos | Implementado localmente; aguarda publicação | Nova campanha inclui perdidos elegíveis e exclui blacklist, opt-out, aposentado e inválido |
| I01 | Supervisão da IA | Implementado localmente; aguarda publicação | Fila de interessados sem próximo passo, motivo da pausa e revisão humana |
| I02 | Handoff humano/IA | Implementado localmente com guarda pré-envio; aguarda publicação | Estado explícito; IA não retorna após humano assumir; retomada é ação consciente |
| S01 | Incidente formal | Implementado localmente; aguarda publicação | Mensagem vira ticket com categoria, evidência, objeto afetado, responsável e recorrência |
| S02 | Validação operacional | Já existe no suporte; revalidado localmente | Resolvido técnico → aguardando validação → validado; reincidência reabre |
| S03 | Rotina de chips | Implementado localmente; aguarda publicação | Checklist diário, responsável e indicadores registrados no Sigma |

## Ondas de implementação

### Onda 1 — integridade e estabilidade

- E01–E07.
- Evidência mínima: SQL de cobertura, testes das Edge Functions, build, execução
  controlada do worker e validação com contatos reais.

### Onda 2 — produtividade no atendimento

- P01–P10 e I02.
- Evidência mínima: testes de estado, RLS, fluxo desktop e mobile a partir de 360px.

### Onda 3 — campanhas e inteligência

- C01–C08 e I01.
- Evidência mínima: migração de campanhas atuais sem perda, funil por estratégia,
  comparação com totais anteriores e E2E do cadastro ao BI.

### Onda 4 — suporte operacional

- S01–S03.
- Evidência mínima: incidente criado a partir da comunicação, resolução técnica,
  validação da operação, reabertura e painel de recorrência.

## Catraca de qualidade

O baseline de 25/07 é:

- `npm run build`: verde.
- `npm run lint`: vermelho por 2.504 erros históricos, principalmente
  `no-explicit-any`; não é aceitável aumentar a contagem nos arquivos alterados.
- Edge Functions da sincronização: `deno check` verde.

Cada onda exige:

1. `git diff --check`;
2. lint direcionado nos arquivos alterados;
3. `deno check` nas funções alteradas;
4. build de produção;
5. teste de migração em transação ou ambiente controlado;
6. validação visual desktop e 360px;
7. evidência de dados antes/depois;
8. deploy somente após confirmação do Raul.

## Plano seguro de publicação

> **Não usar `supabase db push` neste projeto.** A auditoria de 25/07/2026
> encontrou divergência histórica entre migrations locais e remotas. O comando
> amplo poderia tentar aplicar migrations antigas que não pertencem a esta
> entrega.

A publicação deve ocorrer em janela controlada e somente após autorização:

1. capturar os indicadores pré-deploy: mensagens das últimas 24 horas, filas da
   outbox, jobs de histórico por estado, instâncias sem job, conversas
   vinculáveis sem `lead_id`, chips por estado e campanhas em execução;
2. aplicar exclusivamente as migrations `20260725120000` a `20260725163000`,
   em ordem crescente, parando na primeira falha;
3. executar smoke tests SQL de existência, RLS, backfills e invariantes antes de
   liberar qualquer código consumidor;
4. publicar as Edge Functions alteradas e novas, preservando os secrets atuais;
5. publicar o frontend;
6. executar E2E autenticado em desktop e 360 px;
7. testar com contatos controlados: envio manual, recebimento, outbox,
   sincronização pós-reconexão, handoff humano/IA e idempotência;
8. comparar os indicadores pós-deploy com o snapshot inicial e manter
   monitoramento reforçado.

Critérios de parada:

- qualquer migration falhar;
- aumento de mensagens `failed` ou redução inesperada de mensagens registradas;
- duplicidade de `wa_message_id`;
- IA enviar após handoff humano;
- campanha ativa perder chip ou mudar de estado sem causa registrada;
- regressão de permissão/RLS nas telas operacionais.

Rollback funcional:

- frontend e Edge Functions voltam à versão anterior;
- recursos novos ficam ocultos se o schema já tiver sido aplicado;
- migrations aditivas não são revertidas destrutivamente durante a operação;
- filas permanecem preservadas e são retomadas somente após diagnóstico.

## Evidência inicial da Onda 1

Em 25/07/2026:

- 433 mensagens registradas nas últimas 24h;
- 23 jobs de sincronização, sendo 21 em catch-up e 2 live;
- zero jobs em erro;
- uma instância aberta sem job;
- 17.378 conversas sem `lead_id`.

A migração `20260725120000_sigzap_lead_phone_identity.sql` implementa a identidade
canônica do médico usando telefone principal, adicionais e WhatsApp. Ela só faz
o vínculo automático quando a chave pertence a exatamente um médico.

As migrações `20260725130000_chip_operational_state.sql` e
`20260725143000_chip_device_contingency.sql` estruturam a situação real do chip e
a operação temporária pelo aparelho. Ao encerrar uma contingência, todas as
instâncias do chip voltam para `catchup` e a importação do histórico é agendada.
A migração `20260725143100_chip_event_context.sql` congela em cada transição o
proxy dedicado, as campanhas ativas/pausadas e a pessoa que classificou o chip.

A view `vw_campanha_operational_state` passa a ser a fonte única usada pelo
monitor operacional e pelo dashboard. Ela separa configuração administrativa de
atividade real e classifica a campanha como configurando, pronta, rodando,
pausada, sem chip, restrita, desconectada ou finalizada, sempre com o motivo.

## Evidência inicial da Onda 3

A migração `20260725150000_campaign_strategies.sql` cria estratégias como recortes
da campanha e vincula leads, tarefas e touches. Campanhas atuais recebem uma
“Estratégia principal” por backfill, preservando os totais históricos. A tela de
configuração permite cadastrar público, ordem regional, abordagem, período e
status; `vw_campaign_strategy_funnel` entrega o funil e esforço por estratégia.
O dashboard ganhou comparação filtrável de base, contatos, conversas, quentes,
conversões e esforço manual/automático por estratégia.
A RPC `selecionar_leads_estrategia` restringe o público às regiões configuradas e
ordena a fila pela prioridade salva. Um teste transacional com SP → RJ retornou
os dez primeiros médicos em SP, comprovando que a ordem deixou de ser decorativa.
O wizard permite escolher uma campanha anterior e importar todo o briefing como
cópia editável, incluindo locais, objeções, handoff, valores e benefícios. O fluxo
manual mantém obrigatórios apenas serviço, unidade e cidade; campos exclusivos da
IA continuam condicionais à modalidade.

A migração `20260725152000_ai_response_turn_guard.sql` fecha a corrida entre a
geração da IA e o clique humano em “Assumir”: o turno usa lease curto, o handoff
o invalida atomicamente e a função valida novamente imediatamente antes do envio.
O teste de concorrência retornou `may_send_after_human_assumed = false`.
A view `vw_ai_supervision_queue` e o painel no Acompanhamento expõem conversas
sem próximo passo, interessados sem responsável e casos aguardando resposta
humana. Na fotografia transacional do banco atual, apareceram 64 conversas sem
próximo passo, 26 interessados sem responsável e um caso aguardando humano.

A migração `20260725154000_controlled_lead_tags.sql` transforma as 38 tags
encontradas na base em catálogo controlado, preservando as legadas. O atendimento
só aceita valores ativos e administradores ganham uma tela para criar ou
desativar tags sem apagar o histórico.
A ação “Reaproveitar perdidos” usa a estratégia e a mesma ordem regional da fila,
mas exige perda local anterior e repete explicitamente as barreiras de blacklist,
opt-out e indisponibilidade global. Uma amostra real encontrou 17 elegíveis.

A migração `20260725160000_structured_lead_search.sql` cria uma busca estruturada
que combina cadastro e perfil aprendido: nome, CRM, telefone, UF, cidade,
especialidade, modalidade de contratação, região de interesse, disponibilidade
e remuneração mínima. A operadora pode selecionar até 100 resultados e
adicioná-los em massa diretamente à estratégia; opt-out, blacklist e
indisponibilidade global continuam excluídos. A listagem de campanhas também
ganhou filtros independentes por modalidade, estado operacional canônico e erro.

## Evidência inicial da Onda 2

As migrações `20260725140000_add_sem_whatsapp_status.sql` e
`20260725141000_lead_contactability.sql` separam três conceitos antes misturados:

- status operacional `sem_whatsapp`;
- indisponibilidade global (`sem WhatsApp`, aposentado ou contato inválido);
- opt-out LGPD, que continua na blacklist;
- perda local, válida somente para uma campanha.

O Kanban ganhou a coluna “Sem WhatsApp” e um diálogo responsivo de classificação
que informa claramente se o efeito é global ou apenas naquela oportunidade.

O painel de acompanhamento ganhou a aba “Notas”, alimentada pela tabela global
`lead_anotacoes`. A operadora cria e consulta contexto do médico sem sair da
conversa; cada entrada mantém autor e data. Em telas estreitas, as cinco áreas do
card usam navegação horizontal rolável, preservando alvos de toque de 44 px.

As tarefas manuais passaram a registrar responsável, prazo, lembrete, origem e
autor da criação. A migração também adiciona a policy de `INSERT` autenticado que
faltava, causa raiz para o botão “Adicionar tarefa” falhar em alguns perfis.
O estado vazio agora permite criar o primeiro follow-up, em vez de esconder a ação.

O suporte já possuía o fluxo técnico previsto na reunião: os estados
`aguardando_confirmacao`, `em_analise` e `concluido` exigem confirmação do
solicitante; quando o problema persiste, o ticket volta para análise e recebe um
comentário automático. Portanto, S02 não exige um segundo fluxo. O trabalho
de S01 foi incorporado ao mesmo módulo: categoria operacional, tipo e referência
do objeto afetado entram no ticket; uma chave canônica agrupa ocorrências em 30
dias e a reabertura após validação negativa é contabilizada. A migração
`20260725162000_support_incident_recurrence.sql` foi validada integralmente no
banco remoto dentro de transação e revertida com sucesso.

A migração `20260725161000_chip_daily_checklist.sql` internaliza a rotina diária
que antes vivia em planilha. Cada chip registra aparelho disponível, bateria,
sinal, WhatsApp, Evolution e teste de envio/recebimento, preservando responsável,
horário e observação. A tela de Saúde mostra a cobertura do dia e permite
registrar ou corrigir a conferência. A migração foi executada integralmente em
transação no banco remoto e revertida com sucesso.

O card de acompanhamento ganhou envio de e-mail explícito, com destinatário do
cadastro, assunto da campanha, mensagem editável e confirmação antes do disparo.
O fluxo reutiliza `campanha-email-sender`, mantém o rodapé LGPD e registra sucesso
ou falha em `lead_historico`, que já alimenta a timeline unificada. O sender
passou novamente por `deno check`; nenhum e-mail real foi disparado durante o
teste local.

A duplicação deixou de mover os leads e apagar o contexto da origem. A RPC
`duplicate_campaign_context` cria uma campanha independente, permite escolher
nome, modalidade, região e status, copia opcionalmente estratégias/públicos/
ordem/abordagens e replica somente os leads frios solicitados. Um teste funcional
transacional comprovou que a contagem da origem permaneceu idêntica, a cópia
recebeu de um a cinco leads e manteve estratégias; tudo foi revertido ao final.

A importação Excel ganhou colunas opcionais de classificação, motivo e campanha.
`opt_out`, `aposentado`, `sem_whatsapp` e `contato_invalido` são aplicados no
escopo global correto; `perda_local` exige `Campanha_ID` e altera somente o
vínculo daquela oportunidade. Valor desconhecido ou perda sem campanha rejeita
a linha com motivo explícito, em vez de bloquear o médico inteiro. Todas as
classificações aceitas entram em `lead_historico`. A Edge Function passou por
`deno check`.
