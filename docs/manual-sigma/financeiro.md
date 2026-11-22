---
area: financeiro
titulo: Financeiro
modulo: financeiro
telas: [/financeiro, /financeiro/aprovacoes, /financeiro/comprovantes, /financeiro/notas-fiscais, /nf/:token, /aprovacao/:token]
---
# Financeiro
Área do contas a pagar dos médicos: fechamento do mês, pedido de nota fiscal, aprovação da diretoria e comprovantes de pagamento.

## Onde fica
- Menu lateral, grupo "Gestão": itens "Financeiro" (/financeiro), "Aprovações" (/financeiro/aprovacoes) e "Comprovantes" (/financeiro/comprovantes).
- A tela de notas fiscais abre pela aba "Notas fiscais" do Financeiro ou pelo botão "Notas fiscais" da aba Fechamento (/financeiro/notas-fiscais).
- No topo do Financeiro há os filtros "Mês", "Ano", "Profissional" e "Status" (Todos, Pendente, Aprovado, Pago).
- Abas do Financeiro: "Fechamento", "Resumo", "Contas a Pagar", "Notas fiscais", "Contas a Receber", "Painéis", "SigFinc" e "Valores".
- Páginas públicas, sem login: /nf/:token (o médico manda a nota) e /aprovacao/:token (o aprovador vê o relatório do fechamento).

## O processo em 4 fases
A aba "Fechamento" mostra uma trilha com as 4 fases. A fase atual tem o selo "agora".
1. "Fechamento": importar, ajustar e liberar.
2. "Notas fiscais": pedir, receber e cobrar.
3. "Aprovação": a diretoria autoriza o pagamento.
4. "Pagamento": pagar e comprovar.

Papéis do fluxo: Mavi confere e libera o fechamento; a diretoria (João) aprova o pagamento; Thais paga e sobe os comprovantes.

## Como fazer: importar o fechamento do mês
1. Em /financeiro, escolha o mês e o ano no topo e abra a aba "Fechamento".
2. Clique em "Importar fechamento".
3. Escolha a "Fonte / contrato", confira "Mês" e "Ano" e selecione o "Arquivo (.xlsx)".
4. Clique em "Importar".
5. Se o mês do arquivo for diferente do mês escolhido, o sistema avisa. Use o botão "Usar MM/AAAA (do arquivo)" ou "Cancelar".
6. Se o arquivo já foi importado, aparece "Importar mesmo assim". Os ajustes já lançados são preservados.
- O resultado mostra quantos médicos entraram e quantos foram casados com o cadastro.
- Médico com plantões mas sem valor no relatório entra com zero e sem pedido de nota. Lance o valor como ajuste.
- Quando o total da planilha difere do calculado, vale o calculado. Lance a diferença como ajuste, se for o caso.

## Como fazer: conferir e lançar ajuste
1. Na aba "Fechamento", use "Buscar fechamento…" para escolher um arquivo ou deixe "Todos os fechamentos".
2. Use "Buscar médico ou CRM…" para achar alguém.
3. Clique na linha do médico para ver os plantões.
4. Clique em "Lançar ajuste". Preencha "Categoria", "Tipo" ("Acrescentar (+)" ou "Descontar (−)"), "Valor (R$)", "Horas" (opcional) e "Justificativa" (obrigatória).
5. Clique em "Salvar".
- O círculo à esquerda de cada linha marca o lançamento como conferido. O selo "sem cadastro" indica médico não achado no cadastro.
- O botão "Baixar" gera um CSV da lista.
- Ajustes só podem ser feitos na fase 1.

## Como fazer: liberar e pedir as notas
1. Na aba "Fechamento", clique em "Conferir e liberar".
2. Confira "A pagar" e "Médicos".
3. Deixe marcada a opção de pedir as notas (padrão) e clique em "Liberar e pedir as notas". Sem a opção, o botão vira "Liberar sem pedir as notas".
- Com um fechamento escolhido no filtro, libera só ele. Os outros do mês ficam como estão.
- Cada médico com valor a pagar recebe o pedido pelo WhatsApp. Quem não tem telefone recebe por e-mail.
- Quem fica sem contato aparece no filtro "Sem contato" da aba Notas fiscais.
- Se entrar outro arquivo depois de liberar, aparece uma faixa amarela com o botão "Liberar todos e pedir as notas" (ou "Liberar <fechamento> e pedir as notas").

## Como fazer: acompanhar e cobrar as notas fiscais
1. Abra a aba "Notas fiscais" (ou /financeiro/notas-fiscais).
2. Escolha o mês, o ano, o fechamento e o canal ("Por e-mail" ou "Por WhatsApp").
3. Use os filtros: "Médicos", "A pedir", "Aguardando nota", "Atrasadas (+48h)", "Sem resposta (3 cobranças)", "Recebidas", "Conferir" e "Sem contato".
4. Marque os médicos na lista. Na barra de baixo, use "Pedir NF" para pedir ou "Cobrar" para cobrar de novo.
5. Antes de enviar, "Ver prévia" mostra o texto. "Enviar teste" manda a mesma mensagem para um destinatário seu, sem mexer no status do médico.
- Só aparecem médicos de fechamentos já liberados.
- Para corrigir telefone ou e-mail, clique no contato do médico. A correção vale para os próximos pedidos.
- Ícones da linha: "Copiar link de envio", "Anexar a nota que chegou por fora", "Ver a nota", "Mover a nota para outro local deste médico" e "Desconsiderar este arquivo (não é a nota)".
- "Baixar notas do mês" baixa todas as notas recebidas da competência num .zip.

## Como o médico envia a nota
- Pelo link do pedido (/nf/:token): ele vê o nome, a unidade e o "Valor da nota", toca em "Toque para escolher o arquivo" e clica em "Enviar nota fiscal".
- Aceita PDF, XML ou foto, até 15 MB. Depois aparece "Nota recebida. Obrigado!".
- Link inválido ou expirado mostra "Este link não é válido ou já expirou."
- Pelo WhatsApp do financeiro: a nota pode entrar sozinha. Foto ou valor diferente vai para o filtro "Conferir".
- Pela equipe: o ícone "Anexar a nota que chegou por fora".

## Como fazer: conferir uma nota com divergência
1. No filtro "Conferir", clique no selo da conferência da nota.
2. No diálogo "Conferência da nota", use "Conferir de novo" para refazer a checagem.
3. Para seguir mesmo assim, clique em "Aceitar esta nota". Se a leitura não achou o valor líquido, preencha-o antes.
- Selos da conferência: "Nota conferida", "Nota aceita", "Divergência" e "Conferir à mão".

## Como fazer: enviar para aprovação da diretoria
1. Com as notas em mãos, na aba "Fechamento" clique em "Enviar para aprovação de pagamento".
2. Confira "Total" e "Médicos". O PDF do fechamento é gerado sozinho. Anexe um PDF próprio só se quiser.
3. Clique em "Enviar para aprovação de pagamento".
- Só entram lançamentos já liberados.
- A mensagem vai para o canal de aprovação da Comunicação, com botão de aprovar. O pedido também vai pelo WhatsApp aos aprovadores cadastrados.
- Se entrar lançamento depois do envio, aparece uma faixa vermelha com "Reenviar para aprovação". O mês inteiro volta para aprovação com o total novo.

## Como fazer: aprovar ou rejeitar o pagamento (diretoria)
1. Abra "Aprovações" (/financeiro/aprovacoes). Cada mês pendente mostra "Total", "Médicos" e a data do fechamento.
2. Clique em "Aprovar pagamento", ou em "Rejeitar".
3. Para rejeitar, escreva o motivo (opcional) e clique em "Confirmar rejeição". O motivo fica nas observações do fechamento.
- Também dá para aprovar no canal da Comunicação, pelo botão "Aprovar pagamento" da mensagem. "Ver relatório" abre o PDF.
- Pelo WhatsApp, o aprovador toca em "Aprovar pagamento" ou "Não aprovar". O link "Ver relatório" abre /aprovacao/:token, que só mostra o fechamento e não aprova nada.
- Ao aprovar, o canal de Comprovantes recebe o aviso para a Thais.
- O "Histórico" no fim da tela mostra os últimos meses aprovados, pagos ou rejeitados.

## Como fazer: subir os comprovantes de pagamento
1. Abra "Comprovantes" (/financeiro/comprovantes).
2. Em "Enviar comprovantes", selecione um ou vários arquivos (PDF, JPG ou PNG).
3. Clique em "Enviar N comprovantes".
4. Veja o "Resultado": os casados viram pagos e o comprovante segue por e-mail para o médico e a contabilidade.
5. Na "Fila de revisão", clique em "Ver" e escolha o médico em "Casar com médico (marca pago):".
- O sistema lê o nome do médico no PDF. Só casa com pagamentos de meses aprovados e ainda não pagos.
- No canal de Comprovantes, o botão "Enviar comprovantes" faz o mesmo.
- Também dá para usar "Marcar como pago" na aba Notas fiscais, informando a "Data do pagamento".

## Regras e situações
Status do fechamento do mês:
- Sem status: "ainda não liberado" (fase 1).
- `em_nf`: "Liberado — solicitando notas fiscais" (fase 2).
- `aguardando_aprovacao`: "Aguardando aprovação da diretoria" (fase 3).
- `aprovado`: "Aprovado pela diretoria" (fase 4).
- `pago`: o mês fecha sozinho quando o último pagamento com valor vira pago. Se um pagamento for reaberto, volta para aprovado.
- `cancelado`: aparece como "Rejeitado". O mês volta para a fase 1 na aba Fechamento.

Status da nota fiscal de cada médico:
- "A pedir": ainda não pedida.
- "Pedida": pedido enviado, aguardando a nota.
- "Recebida": a nota chegou.
- "Conferida": a nota foi conferida.
- "Sem nota · nada a pagar": valor a pagar zerado, não há nota a pedir.

Status do pagamento de cada médico: Pendente, Aprovado ou Pago.

Cobrança automática: quem não mandou a nota é cobrado a cada 48 h, no máximo 3 vezes, pelo mesmo canal do pedido.

Exclusões:
- "Excluir importação" apaga só o arquivo escolhido no filtro, com os ajustes dele. Funciona até a fase 2.
- "Excluir fechamento" apaga o mês inteiro. Exige digitar a competência (MM/AAAA). Não aparece em mês pago. Não dá para desfazer.

## Quem pode
- As telas do Financeiro exigem o módulo "financeiro" com a ação Visualizar.
- Aprovar o pagamento: só Administrador ou Diretoria, na tela Aprovações e no canal.
- Subir comprovantes pelo botão do canal: só Administrador ou Gestor Financeiro.
- /nf/:token e /aprovacao/:token abrem sem login, para quem tem o link.

## Perguntas frequentes
**P:** Por que um médico não aparece na aba Notas fiscais?
**R:** Só aparecem médicos de fechamentos liberados. Libere o fechamento dele na aba Fechamento.

**P:** O médico disse que não recebeu o pedido. O que faço?
**R:** Veja se ele está em "Sem contato" ou se a coluna "Mensagem" mostra "Falhou". Corrija o contato clicando nele e use "Pedir NF" de novo. Também dá para mandar o link por "Copiar link de envio".

**P:** O médico mandou a nota por WhatsApp pessoal. Como registro?
**R:** Na linha dele, use o ícone "Anexar a nota que chegou por fora".

**P:** Posso alterar valores depois de liberar?
**R:** Não. Ajustes só na fase 1. Se a diretoria rejeitar, o mês volta para a fase 1.

**P:** Lancei um médico depois de enviar para a diretoria. E agora?
**R:** Ele fica fora do total aprovado e não pode ser pago. Use "Reenviar para aprovação" na faixa vermelha da aba Fechamento.

**P:** Por que não consigo aprovar o pagamento?
**R:** A aprovação é só de Administrador ou Diretoria.

**P:** Um comprovante não casou com ninguém. O que faço?
**R:** Ele fica na "Fila de revisão" da tela Comprovantes. Escolha o médico em "Casar com médico (marca pago):".
