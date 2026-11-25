# Arquitetura — Tempo de resposta da equipe no WhatsApp (painel em tempo real e avisos)

> Item 2 da tabela da Ramone ("Claude GSS: telefones", 25/11). Tarefa no Pulse OS: "Claude GSS: telefones da equipe no
> Sigma e tempo de resposta com avisos". Origem: reuniões presenciais em Itajaí em 17/11/2026 (Ramone, Vini, Maikon) e o
> caso do colaborador que não respondia médico e cliente — o mesmo que levou o Heron a pedir o Claude dos sócios.
> Operador: Raul (com agente). Escrito em 22/11/2026.

## 1. Problema
A Ramone não consegue ver quem está esperando resposta. A equipe conversa pelo celular (WhatsApp Business conectado à API
oficial pela Chakra, modo coexistence), então as mensagens já chegam ao Sigma, mas nada mostra "fulano está há 40 min sem
responder este cliente". Ela disse na reunião: "eu não posso ver nada ali esperando"; e se ela responder no lugar, ela
assume a conversa. O Maikon quer o mesmo para os sócios ("tu não ter acesso à informação é a pior coisa").

## 2. O que precisa funcionar
1. **Painel em tempo real** (tela nova): cada conversa esperando resposta, quanto tempo, em qual número, de quem é o
   número, se é cliente marcado, se a IA está conduzindo. Ordenado pela maior espera, com cor por faixa (3, 10, 60 e
   180 min). Números do dia por pessoa: aguardando agora, maior espera, tempo mediano de resposta, % respondidas em 10 min.
2. **Avisos em escada** pelo WhatsApp: 3 e 10 min para quem está com o número; 60 min para a coordenação (Ramone);
   180 min para coordenação e diretoria. Faixas, destinos e horário de atendimento configuráveis.
3. **Clientes e contatos importantes marcados com nome** ("Hospital X — diretor clínico"), para aparecerem em destaque e
   com prioridade.
4. **Encerrar sem responder** ("ok, obrigado" não precisa de resposta): tira a conversa do painel até chegar mensagem nova.
5. **Claude dos sócios e assistente** respondem "quem está sem responder agora?" pelo mesmo dado (domínio novo).

## 3. A solução desenhada

### 3a. Fonte do dado (já existe)
- `sigzap_messages` + `sigzap_conversations` + `sigzap_instances` (provider `chakra`): 9 números conectados, todas as
  mensagens entram (inclusive as enviadas pelo celular, que chegam como echo `smb_message_echo`).
- `whatsapp_chakra_connections`: `responsavel_id` e `uso` (prospeccao, escalas, clientes, ambulatorio, financeiro,
  pessoal; ver §3g)
  são editados em Números WhatsApp. Em 24/11 nenhum número tinha responsável.
- IA conduzindo = o contato é lead de campanha ativa com `tipo_envio` `ia`/`ambos`, na etapa contatado/em_conversa/
  aquecido e sem `humano_assumiu` (mesma regra do `campanha-ia-responder`).

### 3b. Regras (definições que o painel, os avisos e o agente usam iguais)
- **Conversa esperando** = num número Chakra conectado, a última mensagem é do contato (não `from_me`) e a conversa não
  foi encerrada depois dela.
- **Espera** = agora − hora da **primeira** mensagem do contato depois da última resposta nossa (quem mandou 3 mensagens
  seguidas está esperando desde a primeira).
- **De quem é** = responsável atual do número. Número sem responsável aparece como "Sem responsável" (e o aviso vai para a
  coordenação).
- **IA conduzindo**: aparece com a etiqueta "IA atuando" e **não** gera aviso de pessoa (quem responde é a IA). Se a IA
  falhar, a espera continua visível.
- **Resposta** (para o tempo de resposta por pessoa) = primeira mensagem nossa depois da espera, venha do celular (echo)
  ou do Sigma. Tempo mediano do dia, não média (uma conversa esquecida no fim de semana não distorce).

### 3c. Banco (migration `atendimento_tempo_resposta`)
- `atendimento_contatos` — contatos marcados: `telefone` (só dígitos, único), `nome`, `tipo` (`cliente`, `medico`,
  `parceiro`, `outro`), `prioridade` (bool), `observacao`, quem marcou.
- `atendimento_encerradas` — `conversation_id`, `encerrada_em`, `encerrada_por`, `motivo`. Mensagem nova do contato
  depois de `encerrada_em` reabre sozinha (a regra compara as horas; nada a apagar).
- `atendimento_config` (linha única): faixas em minutos `{3,10,60,180}`, destino de cada faixa, horário de atendimento
  (dias e horas), destinos da coordenação e da diretoria (nome + telefone), `avisos_ativos`, `modo_teste` + telefone de
  teste.
- `atendimento_avisos` — um aviso por (`conversation_id`, início da espera, faixa, telefone): é o que impede aviso
  repetido.
- `atendimento_aguardando()` — RPC com as regras da §3b, uma linha por conversa esperando.
- `atendimento_indicadores(p_dia)` — por pessoa: respondidas, mediana, % em 10 min, aguardando agora, maior espera.
- Permissão: ver = `pode_modulo(uid, 'disparos', 'visualizar')` (Ramone e prospecção); marcar contato, encerrar e
  configurar = admin, diretoria, gestor_captacao. `GRANT` explícito depois de cada `CREATE TABLE`.

### 3d. Avisos
- Edge `alertas-equipe` ganha a ação `atendimento` (mesmo molde do aviso de furo): roda a cada 2 min pelo `pg_cron`,
  lê `atendimento_aguardando()`, aplica faixa + horário + destino, grava em `atendimento_avisos` e manda pelo template
  `gss_atendimento_espera_v1` (precisa de aprovação da Meta).
- Modo teste ligado por padrão: tudo vai para o telefone de teste, com o destino real escrito no texto.

### 3e. Tela
- Rota `/tempo-de-resposta`, no menu de Prospecção. Cockpit: no topo "N conversas esperando · maior espera X"; abaixo a
  fila ordenada (contato, número/pessoa, espera ao vivo, etiquetas Cliente / IA atuando), com "Abrir conversa" e
  "Encerrar sem responder"; à direita os números do dia por pessoa. Atualiza sozinha (Realtime em `sigzap_messages` +
  relógio local para os minutos).
- Aba "Contatos marcados" e aba "Avisos" (faixas, horário, destinos, modo teste).
- Portão visual 1440 e 1024 px (ninguém usa o Sigma no celular).

### 3g. Tipo do número e onde a GSS cadastra cada coisa (24/11)
Prospecção, escalas e clientes são operações diferentes; um tempo de resposta só misturava tudo. O tipo de cada número
fica em `whatsapp_chakra_connections.uso` (check `whatsapp_chakra_connections_uso_check`, migration
`20261124180000_whatsapp_uso_escalas_clientes`):

| `uso` | Rótulo na tela | O que é |
|---|---|---|
| `prospeccao` | Prospecção de médicos | Chips que falam com médicos para captar. Os únicos que entram em campanha. |
| `escalas` | Escalas (médicos escalados) | Números da equipe de escalas (Danilo e outros) que conversam com os médicos já escalados. |
| `clientes` | Clientes | Números que atendem os clientes (hospitais). |
| `ambulatorio` | Ambulatório (consultas dos municípios) | Números que atendem as consultas ambulatoriais dos municípios (25/11, migration `20261125101000_whatsapp_uso_ambulatorio`). Nunca entram em campanha. |
| `financeiro` | Financeiro | Automações financeiras (o da Amni). |
| `pessoal` | Pessoal | Número pessoal conectado. |

Onde a GSS cadastra:
- **Números WhatsApp** (`/numeros-whatsapp`): o **tipo** e o **responsável** de cada número, nos campos Tipo e
  Responsável de cada linha; a tela agrupa os números por tipo. Grava pela RPC `whatsapp_numero_atualizar`
  (admin ou permissão `seigzaps_config`, igual a antes).
- **Tempo de resposta › Contatos marcados**: quem é cliente (e contatos importantes), com nome e prioridade.
- **Tempo de resposta › Avisos**: coordenação, diretoria, horário de atendimento, faixas e modo teste.

No painel, o seletor **Todos / Prospecção / Escalas / Clientes / Ambulatório** filtra a fila (`uso` que `atendimento_aguardando`
já devolvia) e os indicadores e gráficos (`atendimento_indicadores` e `atendimento_serie` ganharam `p_uso`; `null` =
todos, que é o mesmo resultado de antes). Número que não está em `whatsapp_chakra_connections` só entra em "Todos".
A meta e os avisos não dependem do tipo do número: dependem do tipo de CONTATO (§3h).

### 3h. Regras por tipo de contato (reunião com os sócios, 24/11; migration `20261125100000_atendimento_regras_por_tipo`)
Uma escada e uma meta só para todo mundo não servia: pessoa-chave cobra mais rápido; cliente e médico têm prazo maior.
- `atendimento_regras` — uma linha por `categoria` (`padrao`, `prioridade`, `cliente`, `medico`, `parceiro`, `outro`):
  `meta_min`, `pessoa_min int[]` (avisos para quem está com o número), `coordenacao_min`, `diretoria_min` (null = não
  avisa). Ler = quem vê a tela; mudar = admin, diretoria, gestor_captacao (mesmo molde de `atendimento_config`).
- **Categoria da conversa** = `prioridade` se o contato marcado tem prioridade; senão o tipo do contato marcado; senão
  `padrao` (função `atendimento_categoria`). Categoria sem linha cai na `padrao`.
- Valores iniciais (sugestão; a GSS ajusta em Tempo de resposta › Avisos):

  | Categoria | Meta | Pessoa | Coordenação | Diretoria |
  |---|---|---|---|---|
  | padrao (não marcado) | 10 | 3, 10 | 60 | 180 |
  | prioridade | 10 | 3, 10 | 30 | 60 |
  | cliente | 30 | 10, 30 | 60 | 180 |
  | medico | 60 | 30, 60 | 120 | 240 |
  | parceiro, outro | 10 | 3, 10 | 60 | 180 |

  `padrao` = o comportamento de antes: para contato não marcado nada mudou (conferido por hash antes/depois em
  `atendimento_aguardando_base`, `atendimento_indicadores_base` e `atendimento_serie_base`).
- `atendimento_aguardando` devolve `categoria` e `meta_min` no fim de cada linha; `atendimento_indicadores` ganhou
  `em_meta` (dentro da meta da categoria; `em_10min` continua fixo em 10 min, que é o que o agente lê);
  `atendimento_serie.em_meta`/`depois` passaram a usar a meta de cada conversa.
- Avisos: `_shared/atendimento.ts` (`escadaDe`) usa a escada da categoria; `atendimento_config.faixas` e
  `meta_minutos` ficam no banco só como reserva (sem regra nenhuma, a escada única de antes vale).
- Painel: a linha da fila mostra a categoria (menos Padrão) e a meta; fica âmbar ao passar da meta da categoria e
  vermelha ao passar do aviso da coordenação. A aba **Sem resposta há mais de 24 h** lista as conversas esquecidas,
  da maior espera para a menor; o topo mostra quantas são e leva até ela.

### 3f. Agente
- Domínio `atendimento` no protocolo (`_shared/agente/dominios/atendimento.ts`): `atendimento_aguardando` e
  `atendimento_indicadores`, com casos na bateria. Nasce sem papel no MCP; no assistente vale pelo módulo `disparos`.

## 4. Fora de escopo
- Integração com a Zenvia (webhook de envios para o BI): capacidade separada, combinada na reunião de 17/11 com a Zenvia.
- Responder a conversa pelo painel (o botão abre a tela Conversas, que já existe).
- Números Evolution (não oficiais) e o WhatsApp pessoal que não está na Chakra.
- Avaliar a qualidade do conteúdo da resposta com IA (só tempo, nesta capacidade).
- Histórico de quem estava com cada número em cada dia (troca de chip): o painel usa o responsável atual; o histórico
  entra se a Ramone pedir indicador por pessoa de semanas atrás.

## 5. Riscos, pegadinhas e dependências
- **Ninguém é responsável por número hoje.** Sem isso, todo aviso cai na coordenação. Vini precisa preencher em
  Números WhatsApp, junto com o tipo (e trocar quando o chip muda de mão). Sem o tipo, todo número conta como
  prospecção e as abas Escalas e Clientes ficam vazias.
- **Números que ainda não estão na Chakra** (3 que não conectaram + o da Ramone, desvinculando de outro portfólio):
  sem eles, as conversas desses números não aparecem.
- **LGPD:** números de uso pessoal gravam todas as conversas. A chave `somente_leads` existe por número; está desligada
  em todos. Contato marcado precisa passar mesmo com ela ligada (ajuste no `chakra-webhook`, só se ligarem a chave).
- **Fim de conversa sem resposta** ("ok", figurinha, "obrigado") viraria espera eterna: por isso "Encerrar sem
  responder" e o horário de atendimento nos avisos.
- **Template na Meta:** o aviso só sai depois de aprovado. Até lá o painel funciona e o aviso fica em teste.
- **Destinos e horário são suposições até o alinhamento** (padrão: seg a sex, 8h–18h; coordenação = Ramone).

## 6. Plano de execução
- [x] T1 — Banco: tabelas, `atendimento_aguardando()`, `atendimento_indicadores()`, permissões; conferência com SQL. (22/11: a mensagem nossa ganhou `raw_payload.origem` = celular ou api no `chakra-webhook`, com o histórico preenchido pelos eventos da Chakra — sem isso a resposta da IA contava como resposta de pessoa; "SAIR" não conta como espera)
- [x] T2 — Avisos: ação `atendimento` no `alertas-equipe`, cron de 2 min, template na Meta, modo teste. (22/11: regras em `_shared/atendimento.ts`, escada em minutos úteis; modelo `gss_atendimento_espera_v1` em análise na Meta; avisos desligados até o alinhamento)
- [x] T3 — Tela `/tempo-de-resposta`: fila ao vivo, números do dia, encerrar, contatos marcados, configuração dos avisos.
- [x] T4 — Domínio `atendimento` no agente (assistente e Claude dos sócios) + casos da bateria. (22/11: protocolo v1.5.0, bateria 29/29; no MCP liberado só para admin)
- [x] T6 — Tipo do número (escalas e clientes) e painel separado por tipo (§3g). (24/11)
- [x] T7 — Regras por tipo de contato (§3h), lista "Sem resposta há mais de 24 h" e tipo de número Ambulatório (§3g).
      (25/11, pedido dos sócios em 24/11; valores iniciais a confirmar com a GSS)
- [ ] T5 — Alinhamento com a Ramone: destinos, horário, faixas, lista de clientes; responsáveis dos números; desligar
      o modo teste.

## 7. Critério de pronto
- Uma mensagem de teste de um contato num número conectado aparece no painel em até 1 min e some quando respondida pelo
  celular.
- A espera do painel, a do Claude dos sócios e a contagem em SQL independente batem (bateria ok).
- Aviso de 3 min sai uma vez só por conversa e faixa (em modo teste, para o telefone de teste).
- Portão visual 0 falhas em 1440 e 1024.
