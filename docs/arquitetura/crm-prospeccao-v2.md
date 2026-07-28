# Sigma — arquitetura alvo de prospecção e CRM

## Princípio

Listas, templates e campanhas são entidades independentes. A campanha referencia uma versão
imutável da lista e do template usados no envio. O histórico não muda quando uma lista ou
template é editado depois.

## Módulos

### 1. Listas

- Origem: filtro salvo da base, importação de arquivo ou seleção manual.
- Importação nunca descarta silenciosamente uma linha.
- Resultado obrigatório: novos, atualizados, já existentes, inválidos, bloqueados e duplicados
  no arquivo.
- Todo contato válido entra na lista escolhida, inclusive se já existia na base.
- Lista guarda versão, origem, autor, data e relatório da importação.
- Lista pode ser dinâmica, mas a campanha congela um snapshot no momento da ativação.

### 2. Templates

- Editor compatível com os recursos permitidos pela API oficial: corpo, cabeçalho, mídia,
  rodapé, botões e variáveis com exemplos.
- Prévia em celular antes de criar na Twilio.
- Estados: rascunho, em análise, aprovado, rejeitado e desativado.
- Template aprovado não é editado em lugar: uma alteração cria nova versão e nova aprovação.
- Campanhas oficiais selecionam somente templates aprovados para o sender e idioma escolhidos.

### 3. Campanhas

Modo de operação e transporte são escolhas independentes. Os formulários não devem misturar
essas decisões:

- **Modo manual:** a equipe realiza o primeiro envio e conduz a conversa no CRM.
- **Modo automatizado:** o sistema realiza o primeiro envio e, opcionalmente, a IA conduz até
  o handoff.
- **Transporte oficial:** sender Twilio e template aprovado pela Meta.
- **Transporte não oficial:** chip Evolution, pacing e regras de segurança.

As combinações válidas são manual + oficial, manual + Evolution, automatizada + oficial e
automatizada + Evolution. Em manual + oficial, o primeiro envio usa um template aprovado e as
respostas continuam no Sigma pelo mesmo sender oficial.

Antes de ativar, uma tela de revisão mostra público, exclusões, transporte, conteúdo, capacidade
diária, previsão de conclusão e bloqueios. Campanha com bloqueio não pode ser ativada.

## IA de prospecção

A IA não deve ser um prompt grande acoplado ao webhook. O fluxo alvo possui:

1. ingestão idempotente da mensagem;
2. janela curta de agrupamento das mensagens do médico;
3. validação de elegibilidade da campanha e do estado humano/IA;
4. recuperação do briefing e conhecimento da oportunidade;
5. decisão estruturada: responder, perguntar ao gestor, transferir ou não responder;
6. geração de uma resposta curta;
7. verificador de política, repetição, tom e fatos;
8. envio idempotente;
9. avaliação de conversão e registro para supervisão.

Invariantes:

- sem campanha automatizada ativa, a IA não responde;
- uma sequência recebida gera no máximo um turno de resposta;
- uma pessoa assumiu, a IA permanece pausada até devolução explícita;
- dúvida sem fonte vira pergunta interna, nunca invenção;
- resposta repetida ou fora do objetivo é bloqueada antes do envio;
- todo envio registra motivo, versão do prompt, contexto usado e resultado.

## CRM operacional

### Conversa

Uma timeline canônica reúne mensagens Evolution, Twilio e aparelho. O estado de envio é explícito:
pendente, aceito pelo provedor, entregue, lido ou falhou. “Enviado” nunca significa apenas que o
Sigma colocou a mensagem numa fila.

### Tarefas

Tarefas precisam ter responsável, prazo, prioridade, origem, estado e vínculo com lead/campanha.
A equipe trabalha por uma fila pessoal (“Hoje”, “Atrasadas”, “Próximas”), não por tarefas soltas
dentro de cards. Mudanças relevantes geram atividade na timeline.

### Lead 360

O lead possui identidade única, contatos normalizados, listas, campanhas, estratégia, conversas,
tarefas, oportunidades, consentimento/opt-out e histórico de responsáveis.

## Entrega por fases

### Fase 0 — estabilização

- inventário de rotas, funções, crons e estados quebrados;
- telemetria por mensagem e campanha;
- catálogo de erros com causa e ação;
- testes de contrato nos fluxos Evolution, IA e Twilio;
- feature flags para impedir funcionalidades incompletas em produção.

### Fase 1 — listas confiáveis

- entidade de lista e membros;
- importação auditável;
- snapshot de audiência;
- relatório de inclusão e exclusão.

### Fase 2 — templates oficiais

- catálogo por aprovação;
- editor rico e versões;
- sincronização Twilio;
- seleção apenas de aprovados.

### Fase 3 — campanhas separadas por modo

- três assistentes de criação;
- pré-validação de capacidade;
- máquina de estados única;
- execução e observabilidade.

### Fase 4 — conversa e transporte

- timeline canônica;
- callbacks Twilio;
- reconciliação Evolution;
- status real de entrega e reprocessamento seguro.

### Fase 5 — IA orientada à conversão

- agrupamento de mensagens;
- base de conhecimento por oportunidade;
- novo tom de voz;
- avaliação offline com conversas reais;
- supervisão, métricas e experimento controlado.

### Fase 6 — CRM e tarefas

- fila pessoal;
- SLA e lembretes;
- lead 360;
- funil e relatórios de conversão.

## Métricas mínimas

- mensagens aceitas, entregues, lidas e falhas por provedor;
- tempo de sincronização aparelho → Sigma;
- respostas da IA por turno recebido;
- taxa de intervenção humana;
- conversão por estratégia, template, lista e campanha;
- contatos descartados em importação por motivo;
- tarefas vencidas e tempo até primeira ação;
- incidência de duplicidade e reprocessamento.
