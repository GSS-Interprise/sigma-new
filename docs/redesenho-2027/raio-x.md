# Sigma GSS: raio-X das telas (13/11/2026)

Escopo combinado com o Raul: as 6 telas de uso diário (Campanhas com o acompanhamento e a aba LinkedIn,
Conversas, Leads, Home, BI Raio-X e Vagas). Capturas em 1440 e 1024 px, tiradas da produção com os dados
pessoais trocados por fictícios na resposta da API, antes de a tela desenhar. Ninguém usa o Sigma no
celular, então 390 px fica de fora.

Figma: https://www.figma.com/design/Fvd8GUHX8Xe7ziaBChhjgm (página "Antes").

## Inventário: fatos da GSS que a tela precisa respeitar

1. A GSS aloca médicos em plantões de hospitais e prefeituras. O Sigma é o CRM da captação: achar o médico,
   abordar, levar até o contrato.
2. A base tem cerca de 828 mil médicos (CFM). Cerca de 509 mil estão sem WhatsApp e 395 mil sem especialidade.
3. Há 59 campanhas, das quais 4 estão ativas hoje (Ginecologia e Obstetrícia, Pediatria, Anestesiologia e
   Ultrassom SC), e cerca de 9.500 leads em acompanhamento.
4. Desde 08/11 a prospecção usa só a API oficial (Chakra). Há 9 números oficiais; em 12/11, 8 enviavam e
   recebiam.
5. O primeiro contato é manual, feito pela equipe; a IA conversa depois e entrega o lead quente para alguém
   assumir.
6. O gargalo está no fim do funil, não no topo. Exemplo da Pediatria: 5.407 alcançados, 517 responderam, 78
   interessados e 8 contratados. Há 30 leads quentes esperando dono há mais de 12 h; o mais antigo, há 186
   dias.
7. Quem usa: captadoras e equipe comercial o dia todo (Campanhas, Conversas, Kanban). Maikon e a diretoria
   olham o BI e a supervisão. O setor de licitações usa a Home pelas pendências.
8. O LinkedIn é assistido: até 15 convites por dia, com o convite pronto para copiar.
9. Vagas em aberto está vazia hoje: o fluxo ainda não pegou.
10. Telas lentas travam o uso. O acompanhamento abre cerca de 7 mil cards e faz mais de 900 requisições.

## Notas por tela

Critérios, nesta ordem: a pergunta respondida no topo, os cartões zerados, as ações que competem no topo
(Hick), as informações por linha (Miller), os sinais de cara de IA, o portão visual e os estados.

| # | Tela | Nota | Portão visual (1440 / 1024) |
|---|---|---|---|
| 1 | Campanhas | 5 | 0 / 6 falhas |
| 2 | Acompanhamento (Quentes e Kanban) | 3 | 5 / 5 falhas + Kanban rolando de lado |
| 3 | Aba LinkedIn | 7 | 0 / 0 |
| 4 | Conversas | 6 | 0 / 0 (faixa de números rola de lado) |
| 5 | Leads | 5 | 0 / 6 falhas + tabela rolando de lado |
| 6 | Home (Demandas) | 4 | 3 / 3 falhas |
| 7 | BI · Raio-X do mercado | 7 | 0 / 0 |
| 8 | Vagas em aberto | 6 | 0 / 0 |

### Problemas que se repetem em todas as telas
- Cabeçalho de três andares (ícone, título, subtítulo e trilha "Home > X") gasta cerca de 80 px e repete o
  que o menu já mostra.
- O menu tem 26 itens, todos com ícone. Em 900 px de altura, "Radiologia" fica cortado no fim e o "Sair"
  fica preso embaixo.
- Rodapé "Sistema Integrado de Gestão Médica — GSS © 2026" em toda tela, sem função.
- Fileiras de cartões de indicador iguais (Campanhas, Leads, Vagas) mostram números da máquina, sem meta e
  sem ação.
- O roxo marca a IA (Supervisão da IA, selo "IA"): é a cor que mais denuncia tela gerada por IA.
- Texto vindo do banco sem tratamento: especialidade e nome em caixa alta, "LICITACOES" sem acento, HTML cru
  num cartão da Home.

### 1. Campanhas: nota 5
Pergunta da tela: qual campanha precisa de mim hoje?
- Nada no topo responde a pergunta. Os 4 cartões são contagens (4 ativas, 9.792 leads, 20 quentes, 2
  convertidos) e não dizem o que fazer.
- São 14 controles antes da primeira campanha: 6 abas, 4 pílulas de situação, 2 de responsável, a busca, 2
  seletores, "Modo avançado" e "Nova Campanha" (Hick).
- O cartão da campanha tem 8 elementos: situação, engrenagem, menu, selo IA, especialidade, leads, quentes e
  convertidos (Miller), mais uma barra de progresso sem rótulo.
- Inconsistência: o topo diz 20 quentes; o cartão da Ginecologia diz "0 quentes".
- Em 1024 px, a pílula de especialidade e a linha de métricas vazam do cartão (6 falhas).
- Não mostra o que importa para a campanha andar: número de envio ligado, ritmo do dia e quentes sem dono.

### 2. Acompanhamento (Quentes e Kanban): nota 3
Pergunta da tela: quais leads quentes estão esperando alguém, e quem pega?
- O Kanban começa a 770 px do topo, abaixo da dobra. Antes dele vêm três avisos sobre os mesmos leads:
  Supervisão da IA (200), a faixa "Crítico" (30 leads) e o limite "Alertar quentes esperando há mais de 12
  horas".
- Os cartões da supervisão mostram "há 6 meses" como se fossem urgentes. Lead parado há 6 meses é caso
  perdido ou de limpeza, não de alerta vermelho.
- Espera medida em horas ("4469h"): ninguém converte 4469 h em 186 dias de cabeça.
- Os filtros quase não filtram: Todos 9.482, Sem dono 9.423, Aguarda Maikon 9.482 e Aguarda equipe 9.482.
- O Kanban tem 2.200 px de largura numa área de 1.232: as colunas da direita ficam escondidas na rolagem
  lateral. "Ver toda" também fica cortado na borda.
- Desempenho: cerca de 7 mil cards e mais de 900 requisições ao abrir; a página chega a travar o navegador.
- Roxo na Supervisão da IA.

### 3. Aba LinkedIn: nota 7
Pergunta da tela: quem eu convido agora, e com qual texto?
- Funciona: o contador "0 de 15" e uma linha por lead com o convite pronto.
- A linha tem 4 ações de peso parecido (Abrir perfil, Copiar convite, Feito e Pular). O caminho natural é
  abrir, copiar e marcar feito, e pode virar um botão só.
- "Buscar perfis dos leads" divide o topo com o contador e traz uma linha de apoio longa.
- A confiança do perfil ("perfil 85% confiável") aparece em letra de 11 px, e é ela que decide se o perfil
  é o certo.

### 4. Conversas: nota 6
Pergunta da tela: quem está esperando resposta minha?
- A lista é boa e já abre em "Precisa de resposta".
- A faixa de números (9 cartões com telefone e contador "999+") rola de lado e identifica o número pelo
  telefone, não pelo nome ou pela campanha.
- Com a conversa aberta, o cabeçalho mostra o telefone duas vezes e nenhum contexto do lead (campanha,
  especialidade, etapa do funil). Para decidir a resposta, a captadora precisa abrir outra tela.
- A única ação do topo é "Assumir"; mover a etapa, marcar como convertido ou agendar não aparecem aqui.

### 5. Leads: nota 5
Pergunta da tela: quem eu ainda não abordei e posso pôr numa campanha?
- Seis cartões de indicador iguais no topo (827.926 na base, 509.042 sem WhatsApp...) são números da
  máquina. Em 1024 px, os números vazam dos cartões (6 falhas).
- A tabela lista 825 mil médicos em ordem alfabética, todos com o selo "Novo" e a mesma especialidade em
  caixa alta. Não há segmento salvo, ação em lote nem "pôr em campanha".
- Nome em caixa alta em todas as linhas, o que deixa a leitura lenta.
- "Ver perfil" com ícone de olho em toda linha. A linha inteira poderia abrir o perfil.

### 6. Home (Demandas): nota 4
Pergunta da tela: o que espera por mim hoje?
- O título é "Demandas", mas a rota é a Home. As abas Home, Minha Área e Kanban dividem a mesma linha do
  título.
- O calendário ocupa um terço da tela, vazio. "Minhas tarefas" ocupa outro terço, também vazio ("0
  abertas").
- As pendências do setor são 20 cartões quase iguais ("Captação de edital – T..." cortado, todos "MÉDIA",
  todos "LICITACOES" sem acento). Um deles mostra HTML cru (`<div class="ql-advanced-banner"...`).
- O seletor "Todos os setores" vaza do cabeçalho do cartão (3 falhas).

### 7. BI · Raio-X do mercado: nota 7
Pergunta da tela: onde a prospecção está travando, e por quê?
- É a melhor tela do escopo: conta a história em 5 blocos e cita a fala do médico.
- No topo competem 6 botões de área, 3 filtros, o seletor Apresentação/Gestão, "Apresentar" e "Baixar PDF".
- Rótulos numerados em caixa alta ("1. O MERCADO"), e todas as barras no mesmo verde, inclusive a de
  Contratados, que fica em 0%: o gargalo, que é o ponto da tela, não se destaca.

### 8. Vagas em aberto: nota 6
Pergunta da tela: qual vaga está mais atrasada, e quem cuida dela?
- O estado vazio é bom: diz "Nenhuma vaga aberta" e oferece "Cadastrar a primeira".
- Mas os 3 cartões de indicador mostram 0 e os filtros aparecem sem dado para filtrar.
- "Relatório de hoje" aparece desabilitado sem dizer por quê. O subtítulo fala da máquina ("O resumo sai por
  e-mail às 7h nos dias úteis").
