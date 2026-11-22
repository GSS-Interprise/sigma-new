---
area: licitacoes
titulo: Licitações
modulo: licitacoes
telas: [/licitacoes, /licitacoes/triagem, /licitacoes/robo, /licitacoes/comparativo]
---
# Licitações
Quadro (Kanban) onde a equipe acompanha cada edital, da captação até arrematar, perder ou reprovar.

## Onde fica
- Menu lateral, grupo "Operação clínica", item "Licitações" (rota /licitacoes).
- As telas /licitacoes/robo ("Licitações (Robô PNCP)"), /licitacoes/triagem ("Triagem de Licitações (PNCP)") e /licitacoes/comparativo ("PNCP × Effecti") saíram do menu. Elas só abrem digitando o endereço.
- No topo do quadro ficam: a busca "Buscar licitação", o seletor de período, o botão "Filtros", os ícones "Agenda: disputas e tarefas", "Relatório e concorrentes", "Editais arquivados", "Adicionar por ID Effect", "Sincronizar" e o botão "Novo Edital".

## De onde vêm os editais
- A captação da GSS usa a API oficial do Effecti. Um robô (edge `effecti-captacao`) roda a cada 30 minutos e lê só o perfil GSS.
- Edital novo entra na primeira coluna ("Editais").
- Se a equipe já lançou o mesmo edital à mão (mesmo número + UF + cidade, ou CNPJ do órgão), o robô liga o aviso ao card existente e não cria outro.
- Os anexos do edital são baixados aos poucos, depois do card criado.
- A AGES tem captador próprio. O mesmo edital pode virar um card para a GSS e outro para a AGES.
- Também dá para criar o card à mão ("Novo Edital") ou mandar um ID do Effecti pelo ícone "Adicionar por ID Effect".

## Colunas do quadro (ordem atual)
1. Editais
2. Credenciamento
3. Em análise
4. Deliberação
5. Esclarecimentos/Impugnações
6. Cadastrar proposta
7. Suspenso/Revogado
8. Aguardando sessão
9. Recurso/Contrarrazão
10. Não arrematados/fracassados
11. Arrematados
12. Reprovados

Esses são os nomes definidos em outubro/2026. A equipe pode renomear, reordenar e criar colunas, então o nome na tela pode ter mudado.

Colunas com regra no Sigma (só podem ser renomeadas, não excluídas): Editais, Arrematados, Reprovados, Não arrematados/fracassados e Suspenso/Revogado.
- "Editais": onde a captação coloca os editais novos.
- "Reprovados": edital descartado. Pede motivo ao entrar.
- "Não arrematados/fracassados": perdemos ou fracassou. Pede o resultado ao entrar.
- "Arrematados": ganhamos. Pede requisitos, resultado e gera o pré-contrato.
- "Suspenso/Revogado": segue a regra dos 30 dias do arquivamento.

A coluna "Reprovados" não carrega os cards de início. Clique em "Carregar descartadas (N)" para ver.

## Como fazer: editar as colunas
1. Clique duas vezes no nome da coluna para renomear.
2. Arraste a coluna pelo cabeçalho para mudar a ordem.
3. No botão "Opções da coluna": "Renomear", "Cor", "Mover para a esquerda", "Mover para a direita", "Nova coluna à direita" e "Excluir coluna".
4. Ao excluir, escolha para qual coluna os cards vão.
5. No fim do quadro, "Adicionar coluna" cria uma coluna nova.

## Como fazer: criar um edital à mão
1. Clique em "Novo Edital".
2. Preencha os campos (Nº Edital, Órgão, CNPJ, Município/UF, Data Disputa etc.).
3. Se aparecer "Este edital parece já existir", clique em "Abrir o existente" para conferir.
4. Clique em "Criar Edital". Se o Sigma perguntar "Edital repetido?", escolha "Abrir" ou "Criar mesmo assim".
5. O card continua aberto ("Edital criado. Já pode anexar o edital e os prints.").

## Como fazer: abrir e editar um card
1. Clique no card. Abre "Detalhes da Licitação". Duplo clique abre a edição rápida.
2. Clique no ícone de lápis para entrar em edição.
3. Edite os campos. As etiquetas ficam no topo do card. O "Responsável" fica junto dos outros campos.
4. Clique em "Salvar". Ao fechar o card, o Sigma também salva o que foi escrito.
- Abas do card: "Detalhes", "Competitividade", "Itens", "Objeto", "Histórico" e "Converter em Contrato".
- O painel lateral "Atividades" mostra o histórico e recebe comentários ("Adicionar comentário... (@ para mencionar)"). Quem comentou pode editar o próprio comentário (aparece "editado").
- Se outra pessoa estiver editando, o card abre em modo visualização.

## Como fazer: etiquetas
1. Entre em edição no card.
2. Use o menu de etiquetas para marcar, criar, mudar a cor ou excluir uma etiqueta.
3. Clique numa etiqueta marcada para tirá-la.

## Como fazer: pedir a análise do edital por IA
1. Anexe o edital e o termo de referência em PDF no card.
2. No bloco "Análise do edital", clique em "Analisar edital".
3. Aguarde de 1 a 3 minutos. Pode continuar usando o card.
4. Com a análise pronta, use "Corrigir texto" para ajustar (o que você escreve fica grifado em amarelo).
5. Use "Levar para a Decorrência" para copiar a análise para o campo "Decorrência de Análise".
6. "Analisar de novo" refaz a análise.
- A IA lê até 3 arquivos (até 30 MB). O que o edital não informa aparece como "Não consta no edital". Cada ponto cita item e página do edital.
- A IA apoia. A decisão é da equipe.

## Como fazer: registrar a deliberação
1. Entre em edição no card.
2. Escreva no campo "Deliberação" o que foi combinado na reunião (participar ou não, valor, condições, quem faz o quê).
3. Clique em "Salvar".

## Como fazer: criar tarefas e prazos
1. No bloco "Prazos e tarefas", clique em "Tarefa".
2. Escolha o "Tipo": Esclarecimento/Impugnação, Recurso, Contrarrazão, Mandado de segurança, Envio de documentos, Deliberação ou Outra (escrever).
3. Informe "Data", "Hora" e "Responsável".
4. Em "Avisar antes", deixe "Padrão de cada pessoa" ou marque 15 min, 1 hora, 3 horas, 1 dia, 2 dias ou 3 dias.
5. Clique em "Salvar".
- Com data de disputa, o Sigma sugere esclarecimento/impugnação 3 dias úteis antes (feriado não conta). Clique em "Criar tarefa" na sugestão.
- Marque "Fase invertida" quando a habilitação vem antes. Aí a data de envio dos documentos passa a ser cobrada.
- "Meus avisos" define sua antecedência padrão. O padrão inicial é 1 dia e 1 hora.
- O responsável e quem criou recebem o aviso no sino e por e-mail.

## Como fazer: mover um card de coluna
1. Arraste o card para a coluna nova.
2. Para "Reprovados": preencha "Descarte de Edital" com o "Motivo do Descarte" e a justificativa (mínimo 10 caracteres).
3. Para "Não arrematados/fracassados" ou "Arrematados": se ainda não houver resultado, abre o diálogo de resultado.
- No resultado dá para escolher ou enviar a ata ("Enviar ata") e pedir a leitura por IA. A IA preenche o arrematante, as empresas à frente da GSS e a GSS por lote. Confira antes de salvar.
- Em "Não arrematados/fracassados" o motivo escrito é obrigatório.

## Como fazer: arrematar e virar contrato
1. Abra o card e vá na aba "Converter em Contrato".
2. Confira os campos obrigatórios: Nº Edital, Órgão, Município/UF, CNPJ, Objeto do Contrato e Serviços do Contrato (cada serviço com nome e valor maior que zero).
3. Marque as 3 verificações: "Documentação verificada e completa", "Valores e condições conferidos" e "Responsável técnico definido".
4. Clique em "Salvar Dados de Conversão".
5. Arraste o card para "Arrematados". Sem os requisitos, o Sigma recusa e diz o que falta.
6. O card aparece em Clientes e Contratos › aba "Licitações arrematadas". O "Virar contrato" é feito lá (veja o manual de Contratos).

## Avisos ao arrematar
- O Sigma mostra "Contrato rascunho criado/atualizado automaticamente!" e copia os anexos da licitação.
- Quem está em "Avisos: arrematada" (tela de Contratos) recebe aviso no sino e por e-mail. Vale só para o quadro da GSS.

## Arquivamento automático
- Nada é excluído. O card arquivado sai do quadro, mas a busca do quadro ainda o acha.
- "Não arrematados/fracassados" arquiva na hora, salvo se houver tarefa aberta com prazo futuro (aí espera o prazo).
- "Reprovados" fica 30 dias no quadro e depois arquiva.
- As demais colunas arquivam 30 dias depois da última data do card (disputa, data limite, última edição, reabertura ou tarefa).
- Card que ganha nova data de disputa futura volta sozinho ao quadro.
- A regra vale só para os cards da GSS.

## Como fazer: achar e reabrir um arquivado
1. Clique no ícone "Editais arquivados".
2. Busque por "Número do edital, cidade ou órgão".
3. Reabra o card. No quadro, o card arquivado mostra o selo "Arquivado" e a opção "Reabrir (tirar do arquivo)".
- Reabrir dá mais 30 dias ao card.

## GSS × AGES
- O quadro abre com os cards da GSS. Em "Filtros" › "Empresa" dá para ver "AGES" ou "GSS e AGES".
- O quadro da AGES tem colunas próprias. Mudar as colunas da GSS não muda as da AGES.
- O menu do card tem "Duplicar → AGES" (ou "→ GSS"). O botão "Card gêmeo" abre o card da outra empresa.

## Filtros, agenda e relatório
- Período: Tudo, Hoje, 7 dias, 15 dias, 30 dias. "Abrir sempre assim" fixa o período para você.
- "Filtros": Etiquetas, Responsável, Empresa, Tipo de prazo, Data início e Data fim.
- "Agenda: disputas e tarefas" mostra disputas e tarefas por dia.
- "Relatório e concorrentes" tem as abas "Período" e "Concorrentes".

## Telas do PNCP (fora do menu)
- /licitacoes/robo: o mesmo quadro, com editais captados direto do PNCP, em validação ao lado do Effecti.
- /licitacoes/triagem: abas "Revisar" e "Alta confiança". "Aprovar" cria o card no Sigma com o edital. O X descarta.
- /licitacoes/comparativo: compara o robô com o Effecti em 30 dias, 90 dias ou 6 meses (abas "Só o robô", "Os dois", "Só a Effecti").

## Quem pode
- Ver as quatro telas: quem tem permissão de ver o módulo `licitacoes`. Sem ela, o Sigma volta para a Home.
- O botão de gerenciar status do quadro aparece só para admin e `lider_licitacao`.
- Editar colunas no quadro da GSS: admin, `lider_licitacao`, `licitador`, `gestor_contratos` e `lideres`.
- Quem tem só o papel `gestor_ages` vê só os cards da AGES.

## Perguntas frequentes
**P:** Sumiu um edital do quadro. Foi excluído?
**R:** Não. O Sigma não exclui. Ele foi arquivado. Use a busca do quadro ou "Editais arquivados".

**P:** Por que não consigo arrastar para Arrematados?
**R:** Falta algo na aba "Converter em Contrato": campos obrigatórios, serviço com nome e valor, ou as 3 verificações.

**P:** Como uno duas colunas?
**R:** No botão "Opções da coluna" (no cabeçalho), use "Excluir coluna" e escolha para qual coluna os cards vão.

**P:** Quem recebe o aviso de tarefa?
**R:** O responsável e quem criou a tarefa, no sino e por e-mail, na antecedência escolhida.

**P:** A IA pode decidir se participamos?
**R:** Não. A análise apoia a leitura do edital. A decisão é da equipe, registrada em "Deliberação".
