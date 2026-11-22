---
area: radiologia
titulo: Radiologia
modulo: radiologia
telas: [/radiologia]
---
# Radiologia
Área do SLA de laudos (prazo dos exames do PACS do Hospital Marieta) e dos controles de agendas, produção, pendências, laudos e ECG.

## Onde fica
- Menu lateral, grupo "Operação clínica", item "Radiologia" (rota /radiologia).
- Abas: "SLA ao vivo", "Escala de plantão", "Avisos", "Coordenação", "Agendas", "Produção", "Pendências e Atrasos", "Revisão de Laudos", "Controle de ECG" e "Histórico de Imports".
- A aba aberta fica na URL (?aba=). O link do e-mail de alerta abre direto no SLA.
- Os filtros de cliente e de data do topo valem só para as abas de importação. Nas abas do SLA eles somem.

## O que é o SLA de laudos
- Um robô lê a fila de exames não laudados no PACS do Hospital Marieta.
- Cada exame tem um prazo de laudo pela origem: Pronto-socorro, Internado ou Externo.
- O robô avisa o médico de plantão antes do prazo vencer, pela sequência da aba "Avisos".
- Se ninguém assumir, avisa os contatos da aba "Coordenação" depois do vencimento.
- O médico assume o laudo tocando em "Assumir laudo" no WhatsApp ou apertando 1 na ligação. Aí os avisos daquele exame param.

## Como fazer: acompanhar a fila (SLA ao vivo)
1. Abra a aba "SLA ao vivo".
2. Veja os contadores "Vencidos" e "Perto do prazo".
3. Escolha "Precisam de atenção" ou "Fila inteira".
4. Cada linha mostra a origem (cor do PACS), paciente e exame, a barra do prazo e a situação do aviso.
5. Clique em "Abrir" para ver o detalhe do exame.
- Situações possíveis: "Sem aviso ainda", "Avisado às HH:MM", "Aviso falhou às HH:MM", "Ninguém na escala (e-mail às HH:MM)", "Assumido por ... às HH:MM" e "Não precisa de laudo".
- O quadro "Últimos avisos" lista os avisos enviados: para quem, por qual canal e se falhou ou foi assumido.
- Se o robô parar de ler a fila, aparece o alerta "A fila não está sendo lida desde ...".

## Como fazer: registrar uma ação num exame
1. Na aba "SLA ao vivo", clique em "Abrir" no exame.
2. Use uma ação rápida:
   - "Avisei o médico": os avisos automáticos deste exame param.
   - "Não precisa de laudo": o exame sai da atenção e os avisos param.
   - "Problema no PACS": fica registrado no histórico do exame.
3. Para uma anotação livre, escreva no campo e clique em "Salvar anotação".
- O "Histórico" do exame junta os avisos do robô e as anotações da equipe.

## Como fazer: montar a escala de plantão
1. Abra a aba "Escala de plantão".
2. O quadro "De plantão agora" mostra quem o robô avisa neste momento.
3. O quadro "Próximos 14 dias" mostra os plantões cadastrados.
4. Em "Adicionar plantão extra", preencha "Nome", "WhatsApp", "Começa em", "Repetir por" (dias) e "Horário".
5. Horários prontos: "Noturno (19h às 7h)", "Diurno (7h às 19h)", "24 horas (7h às 7h)" ou "Outro horário".
6. Clique em "Adicionar plantão" (ou "Adicionar N plantões").
- Para remover, use o botão de remover da linha e confirme em "Remover". O robô deixa de avisar essa pessoa nesse horário.
- "Copiar semana anterior" copia os plantões extras da semana passada para "Esta semana" ou "Próxima semana". Não duplica plantão que já existe e pula horário que já passou.
- Sobreaviso de TC e US vem do Dr. Escala a cada 30 minutos. Linhas com "DrE" vêm de lá. Troca desses plantões se faz no Dr. Escala.
- Plantão do Dr. Escala não é copiado pelo "Copiar semana anterior".

## Como fazer: configurar os avisos ao médico de plantão
1. Abra a aba "Avisos".
2. Use a chave de "Avisos ao médico de plantão" para ligar ou desligar. Desligado, ninguém é avisado.
3. Em cada aviso, escolha o canal ("WhatsApp" ou "Ligação"), os minutos e "antes do prazo" ou "depois do prazo".
4. Use "Adicionar aviso" para incluir outro. Cada aviso tem sua chave e um ícone para remover.
5. Clique em "Salvar avisos". "Desfazer" volta ao que estava salvo.
- A linha "Na prática:" mostra a sequência na ordem em que o robô vai fazer.
- No máximo 12 avisos.
- O robô não avisa exame vencido há mais de 120 minutos. Antes do prazo, o limite é 48 horas.

## Como fazer: mudar o prazo do laudo
1. Na aba "Avisos", no quadro "Prazo do laudo", clique em "Mudar prazos".
2. Em "Horas até o laudo vencer", preencha as horas de Pronto-socorro, Internado e Externo. Aceita "2", "2,5" ou "2.5".
3. Clique em "Salvar prazos".
- O prazo novo vale também para os exames que já estão esperando laudo.

## Como fazer: definir quem é avisado se ninguém assumir
1. Abra a aba "Coordenação" (quadro "Se ninguém assumir o laudo").
2. Clique em "Adicionar contato".
3. Preencha "Nome", "Função" ("Coordenação", "Equipe" ou "Diretoria"), "Avisar por" ("WhatsApp", "Ligação" ou "E-mail") e o telefone ou e-mail.
4. Informe quantos minutos depois do prazo avisar.
5. Clique em "Salvar contatos".
- Cada contato é uma pessoa fixa. Não depende da escala.
- Cada contato recebe uma vez por exame, só se ninguém assumiu o laudo.
- Sem contato cadastrado, o exame vencido sem dono vai só para o e-mail da coordenação.

## Regras e situações
- O robô só avisa quem está na escala no horário.
- Ninguém de plantão agora: os avisos de prazo vão só por e-mail para a coordenação.
- Com sobreaviso de TC e US ao mesmo tempo, o exame avisa quem é da modalidade dele. Sem ninguém da modalidade, avisa todos os plantonistas.
- Cada aviso vai uma vez por exame. Exame que entra atrasado na fila não recebe o 1º e o 2º aviso juntos.
- Robô parado (fila velha) não gera aviso a médico. A queda tem um aviso próprio por e-mail.
- Na ligação, o robô pede "Aperte 1 para assumir o laudo". Sem tecla, diz que vai avisar o próximo da escala.
- Há um e-mail de resumo às 7h com o período das 7h de ontem às 7h de hoje.

## Outras abas
- "Agendas": agendas por dia, botão "Nova Agenda".
- "Produção": compara relatórios do hospital com os da GSS, botões "Importar Excel" e "Nova Comparação".
- "Pendências e Atrasos": botões "Importar Excel" e "Novo Registro".
- "Revisão de Laudos": registro de ajuste de laudos.
- "Controle de ECG": liberações de ECG, botão "Novo ECG".
- "Histórico de Imports": lista as importações feitas.

## Quem pode
- Ver a tela /radiologia exige o módulo "radiologia" com a ação Visualizar.
- Mexer no SLA (escala, avisos, coordenação, prazos e anotações nos exames) é só para Administrador ou Gestor de Radiologia.

## Perguntas frequentes
**P:** Quem é avisado quando o médico não responde?
**R:** Os contatos da aba "Coordenação", nos minutos definidos depois do prazo. Sem contato cadastrado, só o e-mail da coordenação.

**P:** Como paro os avisos de um exame?
**R:** O médico toca em "Assumir laudo" ou aperta 1 na ligação. Na tela, use "Avisei o médico" ou "Não precisa de laudo" no detalhe do exame.

**P:** Por que ninguém foi avisado?
**R:** Veja se os avisos estão ligados na aba "Avisos" e se há alguém em "De plantão agora" na aba "Escala de plantão". Veja também se o robô está lendo a fila.

**P:** Como troco um plantão de TC ou US?
**R:** Esses plantões vêm do Dr. Escala. A troca se faz lá. Chega ao Sigma em até 30 minutos.

**P:** Mudei o prazo. Vale para os exames que já estão na fila?
**R:** Sim. O prazo novo é recalculado para a fila que já espera laudo.

**P:** Não consigo salvar a escala ou os avisos. Por quê?
**R:** Só Administrador ou Gestor de Radiologia podem mexer no SLA.
