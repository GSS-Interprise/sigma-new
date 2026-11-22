---
area: prospeccao
titulo: Prospecção e campanhas
modulo: disparos
telas: [/prospeccao, /prospeccao/nova, /conversas, /vagas, /numeros-whatsapp, /prospeccao/templates-whatsapp]
---
# Prospecção e campanhas
Aqui a equipe cria campanhas de WhatsApp para oferecer vagas a médicos, acompanha o resultado e conversa com quem respondeu.

## Onde fica
- Menu lateral, grupo "Prospecção": "Campanhas" (/prospeccao), "Templates WhatsApp" (/prospeccao/templates-whatsapp), "Conversas" (/conversas) e "Números WhatsApp" (/numeros-whatsapp).
- "Vagas em aberto" (/vagas) fica no grupo "Operação clínica".
- A tela "Máquina de Prospecção" (/prospeccao) tem as abas "Campanhas", "Quentes (IA)", "LinkedIn", "Instagram", "Dashboard", "Status" e "E-mail".
- Na aba "Campanhas" ficam os cartões de resumo ("Campanhas Ativas", "Leads no Pipeline", "Leads Quentes", "Convertidos"), os filtros "Ativas", "Rascunhos", "Pausadas", "Todas", o filtro "Responsável: Todas / Minhas", a busca "Buscar campanha..." e os botões "Modo avançado" e "Nova Campanha".

## Como fazer: criar uma campanha
O botão "Nova Campanha" abre o assistente em /prospeccao/nova. Ele faz uma pergunta por vez. Cada resposta aparece à direita, com o botão "Mudar" para voltar nela. O quadro "Rascunho da campanha" mostra o que já foi respondido.
1. Em /prospeccao, clique em "Nova Campanha".
2. "Público": escolha a "Especialidade" e os "Estados". Sem estado, o público é o Brasil todo. O Sigma mostra quantos médicos o CFM tem dessa especialidade. Clique em "Continuar".
3. "Lista": escolha de onde vêm os médicos.
   - "Montar agora": monta do CRM pela especialidade e estados.
   - "Usar uma lista pronta": escolha a lista em "Escolha a lista".
   - "Extrair do Life's Hub": clique em "Extrair agora". O robô busca médicos com telefone e leva cerca de 1 minuto. Só funciona com uma única especialidade escolhida. Quando termina, a lista entra como lista pronta.
   - O Sigma mostra quantos médicos entram. Ficam de fora quem já está em outra campanha, quem pediu para sair, bloqueados e sem WhatsApp.
4. "Vaga": preencha "Cidade da vaga" (obrigatório), "Hospital (opcional)", "Tipo" (Plantão, Ambulatório, Vaga fixa, Sobreaviso) e "Valor (opcional)" com a unidade (por plantão de 12 h, 24 h, por hora, por turno, por mês). A IA usa isso quando o médico pergunta valor e local.
   - Opcional: em "Algo especial nesta campanha?", escreva a regra (ex.: não citar hospital nem cidade) e clique em "Entender com IA". Confira o "Entendi:" e clique em "Aplicar" ou "Descartar". Para tirar depois, use "Tirar a regra".
5. "1º contato": escolha "Pelo Sigma, sozinho" (modelo aprovado pela API oficial, das 7h às 17h em dias úteis) ou "Pela equipe, no celular" (o Sigma não envia nada; cada pessoa chama do próprio WhatsApp).
6. "Mensagem":
   - Pelo Sigma: escolha um modelo aprovado pela Meta. A caixa "Como o médico recebe:" mostra a prévia. Sem modelo, use o link "Criar um modelo novo".
   - Pelo celular: edite o texto sugerido. Escreva {nome} onde entra o nome do médico.
7. "Números":
   - Pelo Sigma: marque os números oficiais. Cada um mostra "Pronto", "Atenção", "Não usar" ou "Sem este modelo". Defina "Até ... primeiros contatos por número, por dia" (de 1 a 250; padrão 50).
   - Pelo celular: marque quais celulares da equipe vão chamar. Dá para incluir alguém com "Nome", "WhatsApp com DDD" e "Adicionar".
8. "Conversa" (só no 1º contato pelo Sigma): escolha "A IA, como o Maikon" ou "A equipe, pelo Sigma". Depois marque quem recebe o aviso no WhatsApp.
9. Resumo: confira, ajuste o "Nome da campanha" e clique em "Criar e começar" (no celular, "Criar e liberar para a equipe") ou em "Criar pausada".
10. O Sigma abre a campanha criada.

Também dá para começar pela tela de vagas: em /vagas, o botão "Criar campanha" de uma vaga abre o assistente com especialidade, estado e vaga já preenchidos.

## Como fazer: escolher entre IA e equipe
- "A IA, como o Maikon": a IA responde sozinha. O aviso no WhatsApp vai quando o médico quer fechar.
- "A equipe, pelo Sigma": a IA fica de fora. Quando o médico responde, quem foi marcado recebe o aviso e responde pela tela "Conversas".
- Nos dois casos o primeiro contato sai sozinho pela API oficial.
- Se ninguém for marcado, o aviso vai para os destinatários gerais da equipe.
- No cartão da campanha aparece a etiqueta "IA" ou "Manual".

## Como fazer: pausar, reativar, finalizar ou excluir
1. Em /prospeccao, no cartão da campanha, clique em "Mais ações" (três pontinhos).
2. Escolha "Pausar campanha" (campanha ativa) ou "Reativar campanha" (campanha pausada).
3. "Finalizar campanha" pede confirmação. A campanha para de disparar e sai das ativas.
4. "Excluir campanha" é permanente. Pede que você digite EXCLUIR. Remove o vínculo dos médicos e o histórico; os médicos continuam na base. Para só parar de disparar, use "Finalizar".
- No mesmo menu: "Resumo executivo (IA)" e "Duplicar pra manual".
- O ícone de engrenagem "Configurar campanha" abre as abas "Canal", "Tarefas", "Equipe", "Estratégias" e "Ativação".

## Como fazer: ver o funil de uma campanha
1. Em /prospeccao, clique no cartão da campanha.
2. Na visão "Resumo" aparece o funil: "Mercado (CFM)", "Na lista", "Enviados", "Entregues", "Responderam", "Interessados" e "Convertidos", cada um com a porcentagem da etapa anterior.
3. Abaixo ficam: quantos ainda aguardam o primeiro envio, a tabela "Por canal" (por número e e-mail), "Por que ... não receberam" (motivos de falha) e "O que os médicos estão respondendo".
4. A visão "Kanban" mostra os médicos por coluna: "Pendentes", "Aguardando Resposta", "IA Conversando" (na campanha manual, "Respondeu"), "Aquecidos", "Leads Quentes", "Convertidos", "Sem resposta", "Sem WhatsApp" e "Descartados".
- O resumo se atualiza sozinho a cada 2 minutos.

## Como fazer: colocar mais médicos numa campanha
1. Abra a campanha.
2. Clique em "Selecionar leads e estratégia" para escolher uma lista, importar uma planilha ou selecionar médicos pelo nome.
3. "Reaproveitar perdidos" inclui só perdas elegíveis; opt-out, lista de bloqueio e indisponíveis continuam bloqueados.

## Como fazer: marcar um médico como convertido
1. Abra a campanha e vá para a visão "Kanban".
2. Arraste o cartão do médico para a coluna "Convertidos".
- Arrastar para "Sem WhatsApp" ou "Descartados" abre "Classificar saída do médico", com "Motivo" e "Observação".

## Como fazer: conversar com o médico
1. Abra "Conversas" (/conversas). A tela mostra os números oficiais da GSS no formato do WhatsApp Web.
2. No topo, escolha um número ou todos. Use os filtros "Precisa de resposta", "Não lidas", "Todas", "Minhas" e "Sem dono", ou a busca "Buscar nome ou telefone".
3. Clique na conversa. Para ficar com ela, clique em "Assumir". A partir daí a IA não responde mais esse médico.
4. Escreva em "Digite uma mensagem" e envie. Quem responde pela tela assume a conversa automaticamente.
5. Se o médico não escreve há mais de 24 h, ou ainda não respondeu, a Meta só aceita modelo aprovado. Use "Enviar modelo", escolha o modelo, preencha os campos e envie.

## Como fazer: cadastrar e acompanhar vagas
1. Em /vagas ("Vagas em aberto"), clique em "Nova vaga".
2. Preencha "Hospital ou cliente", "Especialidade", "Tipo", "Cidade", "UF", "Carga, dias e horário", "Valor", "Quantas vagas", "Aberta desde" e "Responsável". Hospital, especialidade e cidade são obrigatórios.
3. Clique em "Abrir vaga".
- A lista começa pela vaga mais antiga. A coluna "Aberta há" fica âmbar de 16 a 30 dias e vermelha acima de 30.
- No menu de ações da vaga: "Por que está difícil?", "Marcar preenchida", "Em negociação" ou "Voltar para aberta", "Editar" e "Cancelar vaga".
- "Marcar preenchida" pede o "Médico que assumiu" e fecha com "Fechar vaga".
- "Relatório de hoje" gera o PDF. O resumo também sai por e-mail às 7h nos dias úteis.

## Como fazer: criar um modelo (template) de mensagem
1. Abra "Templates WhatsApp" (/prospeccao/templates-whatsapp) e clique em "Novo template".
2. Preencha "Nome interno", "Mensagem" (variáveis sequenciais {{1}}, {{2}}, {{3}}) e o exemplo de cada variável.
3. Escolha a "Categoria": "Marketing" para primeira abordagem; "Utility" só quando o médico já tem solicitação, cadastro ou atendimento em andamento.
4. Opcional: "Botões de resposta (até 3)", com até 25 caracteres cada. "Usar botões de interesse" preenche os padrões.
5. Clique em "Enviar para aprovação". Vai para todas as contas conectadas e a Meta analisa (de algumas horas a um dia).
- A tela mostra "Aprovados", "Em análise" e "Rejeitados". Template rejeitado mostra o "Motivo da rejeição".
- "Sincronizar Chakra" atualiza a situação dos templates.

## Como fazer: conferir os números oficiais
1. Abra "Números WhatsApp" (/numeros-whatsapp).
2. O topo mostra quantos números estão prontos para campanha. Clique em "Conferir com a Meta" para atualizar.
3. Cada número tem a situação "Pronto", "Atenção" ou "Não usar", com o motivo. Dá para escolher o responsável.
4. "Enviar teste" manda um modelo aprovado para um celular. Só ele prova que o número consegue fazer o primeiro contato.
5. No menu do número, "Usar este número para" muda o uso: Prospecção, Financeiro ou Pessoal.
6. "Conectar um número novo" fica no fim da tela. "Baixar lista" gera a lista dos números.

## Regras e situações
- Número oficial é um número de WhatsApp ligado à API oficial da Meta, pelo provedor Chakra. O primeiro contato de campanha nova pelo Sigma sai só por número oficial.
- Template (modelo) é uma mensagem aprovada pela Meta. Fora da janela de 24 h desde a última mensagem do médico, só modelo aprovado pode ser enviado.
- Todo número escolhido precisa ter o modelo aprovado. Se não tiver, a criação falha com "Um dos números não tem esse modelo aprovado".
- A campanha criada pelo assistente dispara das 7h às 17h, em dias úteis. O limite diário é o limite por número vezes a quantidade de números.
- "Criar e começar" deixa a campanha ativa: o primeiro contato sai no próximo horário. "Criar pausada" não envia nada até você ligar.
- No 1º contato pelo celular o Sigma não envia nada e não faz acompanhamento automático. Ao abrir o médico, a pessoa usa "Abrir no WhatsApp" e depois clica em "Chamei": o médico passa para "Contatado".
- Um médico que já está em campanha ativa ou pausada não entra em outra.
- Campanha sem médicos não dispara. O cartão mostra "Sem leads — clique pra adicionar".
- Campanha ativa sem número ou template oficial aparece com "Falta configurar" e não dispara.
- Se um número escolhido estiver com atenção na Meta e ela recusar, o número sai da rodada e os outros seguem.
- Enviados: mensagens que não falharam. Responderam: médicos que escreveram depois do primeiro envio.
- Interessados: médicos em "quente" ou "convertido", ou classificados como interessados na conversa.
- Convertido: médico com o status "convertido" na campanha. No Kanban a coluna diz "Negócio fechado"; na aba "Quentes (IA)" a coluna "Convertido" diz "Enviado para Contratos".
- Na aba "Quentes (IA)", as etapas "Novo", "Contatado", "Respondeu" e "Em atendimento" mudam sozinhas, conforme contato, resposta e assunção.
- Cancelar uma vaga tira ela da lista e do relatório. A campanha ligada a ela não para sozinha.

## Quem pode
- As telas desta área exigem o módulo "disparos".
- A lista de campanhas (/prospeccao) também exige a permissão de captação "disparos_zap". Admin, líder de captação e gestor_captacao têm todas as permissões de captação.
- Criar campanha pelo assistente: quem tem o módulo "disparos". O banco confere de novo na criação.
- Pausar, reativar, finalizar, editar e excluir gravam direto na campanha. Pelas regras do banco, isso vale para admin, diretoria, gestor_marketing e gestor_captacao.
- "Números WhatsApp": admin ou quem tem a permissão de captação "seigzaps_config".
- Vagas: todos veem a lista. "Nova vaga", "Criar campanha" e o menu de ações aparecem só para admin, diretoria, gestor_contratos, gestor_captacao, coordenador_escalas, lideres e líder de captação.

## Perguntas frequentes
**P:** Criei a campanha e ninguém recebeu mensagem. Por quê?
**R:** Confira se ela foi criada pausada, se está fora do horário (7h às 17h, dias úteis), se tem médicos e se os números têm o modelo aprovado. O cartão avisa "Falta configurar" ou "Sem leads".

**P:** Qual a diferença entre "Enviados" e "Entregues"?
**R:** Enviados são as mensagens que não falharam no envio. Entregues são as que chegaram ao médico. Os motivos de falha aparecem em "Por que ... não receberam".

**P:** Respondi o médico pelo Sigma. A IA continua falando com ele?
**R:** Não. Quem responde pela tela "Conversas" assume a conversa, e a IA para de responder esse médico.

**P:** Por que não consigo escrever texto livre para o médico?
**R:** A janela de 24 h fechou ou o médico ainda não respondeu. A Meta só aceita modelo aprovado: use "Enviar modelo".

**P:** O modelo que eu quero não aparece no assistente.
**R:** Só aparecem modelos aprovados pela Meta, com até 3 variáveis. Crie um em "Templates WhatsApp" e espere a aprovação.

**P:** Posso desfazer uma exclusão de campanha?
**R:** Não. Excluir é permanente. Para só parar de disparar, use "Finalizar campanha".

**P:** Como faço uma campanha em que a equipe chama do próprio celular?
**R:** No passo "1º contato", escolha "Pela equipe, no celular". O Sigma monta a lista e o texto; cada pessoa usa "Abrir no WhatsApp" e marca "Chamei".
