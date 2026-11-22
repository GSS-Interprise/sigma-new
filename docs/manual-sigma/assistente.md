---
area: assistente
titulo: Perguntar ao Sigma
modulo: todos
telas: []
---
# Perguntar ao Sigma
Painel de IA que responde dúvidas com os dados do Sigma e monta propostas de criar ou mudar campanhas.

## Onde fica
- Botão "Perguntar ao Sigma" no cabeçalho, no alto à direita das telas. Em telas menores aparece só o ícone.
- Atalho de teclado: Ctrl+J abre e fecha o painel (no Mac, Cmd+J).
- O painel abre na lateral direita com o título "Assistente do Sigma".

## Como fazer: fazer uma pergunta
1. Clique em "Perguntar ao Sigma" ou aperte Ctrl+J.
2. Escreva em "Escreva sua pergunta…" e aperte Enter (ou clique em "Enviar"). Shift+Enter quebra a linha.
3. Ou clique numa das sugestões. Elas mudam conforme a tela (ex.: "Como estão as campanhas ativas?", "Onde tem furo na escala esta semana?", "Quais disputas temos esta semana?").
4. Enquanto busca, o painel mostra "Consultando o Sigma…".
5. Para começar do zero, clique em "Nova conversa".

## Como fazer: criar uma campanha pelo assistente
1. Peça em português, por exemplo: "cria uma campanha de pediatria no RS com o modelo de plantão".
2. Se faltar algo obrigatório (especialidade ou modelo da mensagem), o assistente pergunta antes.
3. Ele mostra um cartão com o resumo: público, médicos que entram, mensagem, números, envios por número por dia, quem conversa depois do 1º contato e quando começa.
4. Confira e clique em "Confirmar" para gravar, ou em "Descartar" para não fazer nada.
5. Depois de confirmar, o cartão diz se a campanha foi criada disparando ou pausada, e com quantos médicos. O botão "Abrir campanha" leva até ela.

## Como fazer: mudar uma campanha pelo assistente
1. Peça a mudança dizendo o nome (ou parte do nome) da campanha, por exemplo: "pausa a campanha X" ou "muda o limite da campanha X para 80 por número".
2. Se o nome casar com mais de uma campanha, o assistente pergunta qual.
3. O cartão mostra cada item com o valor de antes riscado e o valor novo.
4. Clique em "Confirmar" ou "Descartar". Depois de confirmar, aparece "Feito. A campanha já está com as mudanças."

## Regras e situações
- Responde sobre os assuntos ligados ao assistente: campanhas de prospecção, escalas e plantões, licitações e contratos. Dúvidas de como usar o Sigma são respondidas pelo manual; sem página que responda, ele diz que não sabe.
- Só vê o que a pessoa já vê nas telas. Quem não abre um módulo também não recebe resposta sobre ele: campanhas seguem o módulo "disparos", escalas o "escalas", licitações o "licitacoes" e contratos o "contratos". O bloqueio de módulo por pessoa também vale aqui.
- Quem tem só papel de licitação (e não é admin) não recebe respostas de contratos, igual à tela.
- Todo número que o assistente afirma vem de uma consulta feita na hora. Ele diz a hora do dado.
- A IA nunca grava nada. Criar ou mudar campanha gera só um cartão com "Confirmar" e "Descartar". Nada muda sem o clique.
- O clique em "Confirmar" grava com o login da pessoa, pelas mesmas regras da tela. A permissão é conferida de novo nesse momento.
- A proposta vale 2 horas. Depois disso aparece "A proposta venceu (2 h). Peça de novo ao assistente."
- Cada proposta só pode ser decidida uma vez ("Essa proposta já foi decidida.").
- "Descartar" não muda nada: o cartão mostra "Descartada. Nada foi mudado."
- Campanha criada pelo assistente sai sempre com o 1º contato pelo Sigma, pela API oficial. Campanha com 1º contato pelo celular só se cria pela tela /prospeccao/nova.
- Se a pessoa não pedir para começar, a campanha nasce pausada.
- O aviso de médico respondendo vai para os destinatários gerais da equipe. Para escolher pessoas, use a tela de nova campanha.
- Sem números indicados, entram todos os números disponíveis que têm o modelo aprovado.
- O que dá para mudar conversando: nome, pausar ou retomar, envios por número por dia (1 a 250), números, modelo e dados da vaga (hospital, cidade, tipo, valores, instruções para a IA e se a IA informa o valor).
- Não dá para mudar campanha finalizada ou arquivada. Campanha de 1º contato pelo celular não tem número, modelo nem limite para mudar.
- Excluir campanha não é feito pelo assistente.
- A mensagem tem até 2.000 caracteres.
- Toda pergunta, consulta e ação confirmada fica registrada.

## Quem pode
- Abrir o painel e perguntar: qualquer pessoa logada. Cada uma só recebe resposta do que já vê.
- Criar campanha pelo assistente: quem tem o módulo "disparos" (as mesmas pessoas que usam a tela "Nova campanha").
- Mudar campanha pelo assistente: quem tem o módulo "disparos" e é admin, diretoria, gestor_marketing ou gestor_captacao.
- Quem não pode recebe "Você não tem acesso a isso."

## Perguntas frequentes
**P:** O assistente criou a campanha sozinho?
**R:** Não. Ele só monta o cartão. A campanha só é criada quando você clica em "Confirmar".

**P:** Por que o assistente não responde sobre licitações para mim?
**R:** Ele só responde o que você já vê nas telas. Sem acesso ao módulo de licitações, ele diz que você não tem acesso.

**P:** Cliquei em "Confirmar" e deu erro.
**R:** A proposta pode ter vencido (vale 2 h), já ter sido decidida, ou um número não ter o modelo aprovado. Peça de novo ao assistente.

**P:** Posso pedir para excluir uma campanha?
**R:** Não. O assistente não exclui campanha. Use o menu "Mais ações" do cartão da campanha em /prospeccao.

**P:** Os números que ele dá batem com a tela?
**R:** Sim. Ele consulta o Sigma na hora e informa a hora do dado.

**P:** Como abro o painel pelo teclado?
**R:** Ctrl+J abre e fecha (Cmd+J no Mac).
