---
area: contratos
titulo: Clientes e Contratos
modulo: contratos
telas: [/contratos]
---
# Clientes e Contratos
Tela para cadastrar e acompanhar contratos, clientes, licitações arrematadas e documentos com validade.

## Onde fica
- Menu lateral, grupo "Operação clínica", item "Clientes e Contratos" (rota /contratos).
- Abas, nesta ordem: "Contratos", "Dr. Escala", "Dr. Oportunidade", "Licitações arrematadas", "Clientes", "Documentos da empresa" e "Vencimentos dos médicos".
- Na aba "Contratos", o topo tem os botões "Avisos: arrematada", "Avisos: assinado", "Avisos: início do serviço", "Avisos: médico vinculado" e "Novo Contrato".

## Cartões da aba Contratos
Os cartões no topo contam os contratos. Clique num cartão para filtrar a lista. Clique de novo para tirar o filtro.
- "Contratos Ativos": status do contrato Ativo.
- "Contratos Inativos": status Inativo ou Encerrado.
- "A Vencer (30 dias)": contrato Ativo que termina nos próximos 30 dias.
- "Contratos Vencidos": contrato Ativo com data de término já passada.
- "Com Pendência": status Pendente ou assinatura Pendente.
- "Sem Anexo": contrato Ativo sem nenhum arquivo anexado.

## Regra da data de término
- Se o contrato tem aditivos, vale a data de término do último aditivo (a mais distante).
- Sem aditivo, vale a data de término do próprio contrato.
- Essa regra é usada nos cartões "A Vencer (30 dias)" e "Contratos Vencidos" e no cartão "Contratos a Vencer" da aba Clientes.

## Como fazer: buscar um contrato
1. Na aba "Contratos", use o campo "Buscar por ID, cliente ou médico...".
2. Só números: busca pelo ID interno (o número do contrato).
3. Texto: busca no código do contrato, no nome do cliente e no nome do médico.
4. "Exportar PDF" exporta a lista filtrada.

## Como fazer: cadastrar um contrato
1. Na aba "Contratos", clique em "Novo Contrato".
2. Aba "Cadastro": dados do cliente (CNPJ, Unidade, Nome Fantasia, Razão Social, Endereço, contatos), "Tipo de Contratação", "Estado" e "Dados do Contrato".
3. Em "Dados do Contrato": "Código do Contrato", "Tipo de Serviço (Multi-seleção)", "Objeto do Contrato", "Data de Início *", "Prazo (meses)", "Condição de Pagamento", "Valor Estimado", "Status do Contrato" e "Status Assinatura".
4. A "Data de Término (calculada)" sai da data de início mais o prazo.
5. Aba "Itens do Contrato": em "Adicionar Novo Item", preencha "Descrição do Item", "Quantidade" e "Valor Unitário" e clique em "Adicionar Item".
6. Aba "Renovação": em "Adicionar Nova Renovação", preencha "Data de Vigência", "Percentual de Reajuste (%)" e "Valor" e clique em "Adicionar Renovação".
7. Em "Anexar Documentos", arraste ou escolha os arquivos (até 50 MB cada).
8. Clique em "Salvar".
- "Telefone Contrato *" é obrigatório.
- O campo "ID (gerado automaticamente)" fica "Gerado ao salvar". Ninguém digita o número.

## Como fazer: editar ou ver um contrato
1. Na lista, use o olho ("Visualizar") para só ver, ou o lápis ("Editar") para mudar.
2. O diálogo tem as abas "Cadastro", "Itens do Contrato" e "Renovação".
3. Para admin e líderes, o painel lateral "Atividades" mostra o histórico de alterações do contrato.
4. "Enviar resumo por e-mail" manda um resumo do contrato.
5. Clique em "Salvar" (ou "Fechar", no modo visualização).

## Como fazer: lançar um aditivo de prazo
1. Abra o contrato em edição, aba "Cadastro".
2. Clique em "+ Adicionar aditivo". O Sigma sugere a data de início logo após o fim do período anterior.
3. Informe "Data de Início" e "Prazo (meses)". A "Data de Término" é calculada.
4. Clique em "Confirmar aditivo" e depois em "Salvar".
- Aditivos prorrogam a vigência sem mudar a data de início do contrato.
- Para tirar um aditivo, use "Excluir aditivo".

## Status do contrato e da assinatura
- "Status do Contrato": Ativo, Inativo, Suspenso ou Em Processo de Renovação.
- "Status Assinatura": Assinado, Pendente, Em Análise ou Aguardando Retorno. Há o campo "Motivo de Pendência".
- "Dias de Antecedência para Aviso de Vencimento": entre 30 e 60 dias. Padrão 60.

## Licitações arrematadas (pré-contrato)
- Quando um card vai para "Arrematados" no quadro de Licitações, ele aparece nesta aba com tudo o que foi anexado.
- As colunas são as etapas: "Adjudicação", "Homologação", "Aguardando assinatura" e "Assinado". Troque a etapa no seletor do cartão. A troca fica no histórico da licitação.
- O número do contrato só nasce quando a arrematada vira contrato. O pré-contrato não consome número.

## Como fazer: virar contrato
1. Na aba "Licitações arrematadas", clique em "Virar contrato" no cartão.
2. Abre o "CONTRATO TEMPORÁRIO". Se a licitação mudou, use "Sincronizar c/ Licitação".
3. Clique em "Consolidar Contrato".
4. Em "Verificar Dados da Licitação", complete o que faltar e clique em "Avançar para Consolidação".
5. Abre o formulário "Consolidar Licitação em Contrato", já preenchido com os dados, serviços e anexos da licitação.
6. Confira e clique em "Salvar". O contrato ganha o próximo número.
- Se o contrato já existe, use "Vincular a Contrato Existente". Os dados desse contrato não são alterados.

## Como fazer: encerrar uma arrematada sem contrato
1. No cartão, clique no ícone "Encerrar sem contrato".
2. Escolha um atalho (ex.: "Revogação pelo órgão", "Desistência após reanálise do edital", "Anulação", "Outra empresa convocada") ou escreva o motivo.
3. Clique em "Encerrar".
- O motivo vai para o histórico da licitação. "Ver encerradas sem contrato" lista as últimas.

## Avisos automáticos
Cada botão "Avisos: ..." abre a lista "Quem recebe" e a chave "Também por e-mail". Clique em "Salvar".
- "Avisos: arrematada": quando uma licitação entra em Arrematados.
- "Avisos: assinado": quando o contrato passa para assinado ("Status Assinatura" = Assinado).
- "Avisos: início do serviço": quando alguém marca o início do serviço na lista.
- "Avisos: médico vinculado": quando um médico é vinculado a cliente, unidade ou contrato.
- O aviso chega no sino e, se marcado, por e-mail.

## Como fazer: marcar o início do serviço
1. Na lista de contratos, clique no ícone "Marcar início do serviço (avisa o financeiro)".
2. Escolha a data e clique em "Salvar".
3. O financeiro é avisado em até 10 minutos. "Remover" apaga a data.

## Documentos da empresa
- Certidões e documentos da GSS com validade.
1. Clique em "Documento".
2. Preencha "Tipo" (da lista ou um tipo novo), "Complemento (opcional)", "Emissor", "Emissão", "Validade", "Arquivo" e "Observação".
3. Clique em "Salvar".
- "Renovar" anexa a versão nova. A antiga vai para o histórico ("Ver versões antigas").
- Filtro: "Todos os vigentes" ou "Vencidos e vencendo".

## Vencimentos dos médicos
- Lista os documentos dos médicos com validade (CRM, RQE, certidões).
- Filtros: "Vencidos e vencendo (60 dias)", "Sem validade preenchida", "Todos", e por tipo. Busca por "Médico ou arquivo".
- A validade é preenchida na própria linha.
- A lista mostra os 300 primeiros. Use os filtros para achar o resto.

## Como fazer: configurar avisos de vencimento
1. Em "Documentos da empresa" ou "Vencimentos dos médicos", clique em "Avisos".
2. Em "Avisar quantos dias antes", marque 60, 30, 15, 7, 3 ou 1 dia.
3. Em "Quem recebe", marque as pessoas.
4. Ligue ou desligue "Também por e-mail" e clique em "Salvar".
- O Sigma confere todo dia às 8h e manda um resumo por pessoa. Documento vencido também gera aviso.

## Dr. Escala, Dr. Oportunidade e Clientes
- "Dr. Escala" e "Dr. Oportunidade" têm lista e cartões próprios, com os botões "Novo Contrato Dr. Escala" e "Novo Contrato Dr. Oportunidade".
- "Clientes": cartões "Clientes Ativos", "Clientes Inativos", "Com Contrato Vigente", "Sem Contrato" e "Contratos a Vencer", filtros e "Exportar PDF".

## Quem pode
- Ver a tela: quem tem permissão de ver o módulo `contratos`.
- Editar, marcar início do serviço e excluir contrato: admin ou quem tem permissão de editar/excluir no módulo `contratos`.
- Quem tem só papel de licitação (`licitador` ou `lider_licitacao`, sem admin) vê só "Licitações arrematadas" (sem mudar etapa, virar contrato ou encerrar) e "Documentos da empresa".
- Painel "Atividades" do contrato: admin e líderes.

## Perguntas frequentes
**P:** O contrato aparece como vencido, mas tem aditivo. Por quê?
**R:** O Sigma usa a data de término do último aditivo. Confira se o aditivo foi lançado com a data certa e salvo.

**P:** Como escolho o número do contrato?
**R:** Não escolhe. O número é gerado ao salvar, e só quando a arrematada vira contrato.

**P:** A licitação foi revogada depois de arrematada. E agora?
**R:** Use "Encerrar sem contrato" no cartão da arrematada e escreva o motivo.

**P:** Quem é avisado quando o contrato é assinado?
**R:** As pessoas marcadas em "Avisos: assinado".

**P:** Sou licitador e não vejo a aba Contratos. É erro?
**R:** Não. Quem tem só papel de licitação vê apenas "Licitações arrematadas" e "Documentos da empresa".
