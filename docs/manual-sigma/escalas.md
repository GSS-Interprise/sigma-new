---
area: escalas
titulo: Escalas e furos
modulo: escalas
telas: [/escalas, /bi]
---
# Escalas e furos
Mostra os plantões dos hospitais vindos do Dr. Escala, onde falta médico (furo) e quem é avisado no WhatsApp.

## Onde fica
- Menu "Escalas" (rota /escalas). Título da tela: "Escalas". Subtítulo: "Visualize escalas sincronizadas do Dr. Escala (read-only)".
  - Aba "Calendário": filtros, botão "Sincronizar Dr. Escala" e as visões "Calendário" e "Lista".
  - Aba "Importação" (só admin): "Importar Escalas (Contingência)" por planilha.
  - Aba "Configurações" (só admin): "Status da Integração" e "Tokens de API".
- BI (rota /bi), grupo "Operacional", módulo "Escalas" (endereço direto: /bi?tab=escalas).
  - No topo: cartão "Furos de escala" e cartão "Aviso de furo no WhatsApp".
  - Abaixo: filtro "Fonte de Dados" ("Escalas Internas" ou "Dr. Escala"), KPIs e gráficos.

## De onde vem a escala
- O Dr. Escala é o sistema de escalas da GSS. Ele é a fonte da verdade.
- O Sigma só lê. Para mudar um plantão, a equipe muda no próprio Dr. Escala.
- Um robô do Sigma lê o Dr. Escala três vezes por dia: 6h, 12h e 18h (horário de Brasília).
- Cada leitura traz hospitais, setores e plantões de 7 dias atrás até 30 dias à frente.
- Plantão que sumiu do Dr. Escala é apagado do Sigma na leitura seguinte.
- Valores dos plantões não vêm para o Sigma. A escala não traz dinheiro.
- Locais de teste do Dr. Escala ("local teste") ficam de fora das telas.
- O cartão "Furos de escala" mostra a hora da última leitura em "Lido às ...".

## O que é furo
- Furo é um plantão sem médico alocado no Dr. Escala.
- No Dr. Escala ele aparece como "Sem Profissional Alocado".
- "Anunciado" quer dizer que o plantão está marcado como anunciado no Dr. Escala. "Sem anúncio" quer dizer que não está.

## Como fazer: ver os furos dos próximos dias
1. Abra o BI e escolha "Escalas" no grupo "Operacional".
2. Leia o cartão "Furos de escala" no topo. Ele cobre os próximos 14 dias.
3. Veja os três números: "Furos hoje", "Furos em 7 dias" e "Cobertura em 7 dias".
4. Abaixo, os furos aparecem por dia ("Hoje", "Amanhã", depois o dia da semana).
5. Cada linha mostra horário, hospital, setor, cidade e se está "Anunciado" ou "Sem anúncio".
6. Se não houver furo, aparece "Nenhum furo nos próximos 14 dias."

## Como fazer: ligar ou desligar o aviso de furo no WhatsApp
1. No BI, módulo "Escalas", vá ao cartão "Aviso de furo no WhatsApp".
2. Use a chave ao lado do título. Ligada, o texto diz "Ligado. Sai depois de cada leitura do Dr. Escala (6h, 12h e 18h)...".
3. Desligada, o texto diz "Desligado: ninguém recebe aviso de furo."
4. O Sigma confirma com a mensagem "Aviso de furo ligado. Sai na próxima leitura do Dr. Escala." ou "Aviso de furo desligado."

## Como fazer: escolher quem recebe o aviso de furo
1. No cartão "Aviso de furo no WhatsApp", clique em "Adicionar pessoa".
2. Preencha "Nome" e "WhatsApp" (com DDD, ex.: (47) 99999-0000).
3. Em "Hospitais", escolha os hospitais que a pessoa cuida. Vazio quer dizer "Todos os hospitais".
4. A chave no fim da linha liga ou desliga o envio só para essa pessoa.
5. O ícone de lixeira tira a pessoa da lista.
6. Clique em "Salvar lista". Para voltar ao que estava salvo, clique em "Desfazer".
7. A lista aceita até 20 pessoas. O mesmo telefone não pode entrar duas vezes ("Esse telefone já está na lista.").

## Como fazer: ver a escala em calendário ou lista (/escalas)
1. Abra "Escalas" e fique na aba "Calendário".
2. Escolha "Mês", "Ano", "Local (Hospital)" e "Setor". Em "Profissional", digite parte do nome ("Buscar por nome...").
3. Troque entre as visões "Calendário" e "Lista".
4. O total aparece como "N plantão(ões) encontrado(s)".
5. Se houver plantões com dados faltando, aparece o botão "N plantões incompletos". Clique para ver só esses.

## Como fazer: importar escala por planilha (contingência)
1. Abra "Escalas" e a aba "Importação" (só admin).
2. Clique em "Baixar Modelo" para pegar a planilha no formato certo.
3. Campos obrigatórios: ID Externo, Nome do Profissional, Setor, Data (YYYY-MM-DD), Hora Início (HH:MM), Hora Fim (HH:MM).
4. Envie o arquivo (.xlsx, .xls ou .csv).
5. Confira a prévia e clique em "Importar N Escalas". "Cancelar" limpa a importação.
6. Registro com o mesmo ID externo é atualizado, não duplicado.

## Filtros e KPIs da aba Escalas do BI
- Cartão "Furos de escala": sem filtro. Sempre os próximos 14 dias.
  - "Furos hoje": furos com início hoje.
  - "Furos em 7 dias": furos de hoje até daqui a 6 dias.
  - "Cobertura em 7 dias": plantões com médico dividido pelo total de plantões dos 7 dias.
- "Fonte de Dados" = "Escalas Internas": filtros "Mês", "Ano", "Local (Hospital)", "Setor" e "Profissional".
  - "Visão Executiva": "Total Plantões", "Horas Escaladas", "Profissionais", "Média Horas/Prof", "Plantões/Dia", "Dados Completos".
  - Bloco de furos: "Total Furos", "% Furos", "Horas Descobertas", "Dias com Furo". Compara com o mês anterior.
  - Aqui, furo é o plantão sem nome de profissional ou com nome como "vago", "a definir", "disponível" ou "sem profissional".
  - Sub-abas: "Distribuição", "Profissionais", "Operacional" e "Furos Detalhado".
- "Fonte de Dados" = "Dr. Escala": filtros "Mês", "Ano" e "Local". Sub-abas "Visão Geral", "Por Profissional" e "Detalhes".

## Regras e situações
- O aviso de furo sai cerca de 20 minutos depois de cada leitura do Dr. Escala.
- Cada pessoa recebe dois avisos por furo, no máximo, cada um uma vez só:
  - "novo": o furo aparece nos próximos 7 dias.
  - "véspera": o furo continua aberto a menos de 24 horas do início.
- Furo que já nasce a menos de 24 horas gera só o aviso de véspera.
- Furo que já começou não gera aviso.
- Quem tem hospitais escolhidos só recebe furos desses hospitais.
- A mensagem lista os furos em uma linha. Se forem muitos, termina com "+N no Sigma".
- Modo de teste: quando aparece a faixa amarela "Teste interno ligado: os avisos vão para ..., não para a lista abaixo.", ninguém da lista recebe. Os avisos vão só para o número de teste interno.
- O aviso foi criado em modo de teste. Só sai para a lista quando a equipe técnica desligar o teste. Enquanto a faixa amarela estiver na tela, o teste continua ligado.
- "Último aviso: ..." mostra a hora do último envio.
- Situação conhecida: a tela /escalas, o botão "Sincronizar Dr. Escala" e a fonte "Escalas Internas" usam a integração antiga. Segundo o registro técnico, essa base parou de ser atualizada em 31/03/2026. Para furos atuais, use o cartão "Furos de escala" no BI.

## Quem pode
- Tela /escalas: quem tem o módulo "escalas" liberado. As abas "Importação" e "Configurações" são só para admin.
- BI: quem tem o módulo "bi" liberado.
- Dados do Dr. Escala (cartão "Furos de escala"): só admin, diretoria e coordenador de escalas. Outros papéis podem ver o cartão vazio.
- Cartão "Aviso de furo no WhatsApp": só admin, diretoria e coordenador de escalas. Para os demais, o cartão não aparece.

## Perguntas frequentes
**P:** Posso corrigir um plantão no Sigma?
**R:** Não. O Sigma só lê. Corrija no Dr. Escala. A mudança chega na próxima leitura (6h, 12h ou 18h).

**P:** Por que um furo que já resolvi ainda aparece?
**R:** O Sigma só atualiza nas leituras de 6h, 12h e 18h. Confira o horário em "Lido às ..." no cartão "Furos de escala".

**P:** Ninguém recebeu o aviso de furo. Por quê?
**R:** Veja se a chave do cartão está ligada, se a pessoa está na lista com a chave dela ligada e se aparece a faixa amarela de teste interno. Com o teste ligado, só o número de teste recebe.

**P:** Como faço para alguém receber só os furos de um hospital?
**R:** Na linha da pessoa, escolha o hospital em "Hospitais" e clique em "Salvar lista".

**P:** Eu não vejo o cartão "Aviso de furo no WhatsApp".
**R:** Ele aparece só para admin, diretoria e coordenador de escalas.

**P:** Qual a diferença entre "Furos de escala" e "Total Furos"?
**R:** "Furos de escala" usa a leitura atual do Dr. Escala, nos próximos 14 dias. "Total Furos" fica no bloco "Escalas Internas", usa a base antiga e segue o mês escolhido no filtro.
