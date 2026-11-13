# Sigma GSS: proposta de redesenho (resumo para a apresentação)

Figma: https://www.figma.com/design/Fvd8GUHX8Xe7ziaBChhjgm
Páginas: Antes · Raio-X · Depois (Campanhas, com as variações) · Depois · as 7 telas · Mapa · telas e painéis possíveis.
Todas as telas usam dados fictícios.

## A ideia em uma frase
Hoje o Sigma mostra tudo o que sabe. A proposta mostra primeiro **o que espera cada pessoa**: o médico que
respondeu e ninguém assumiu, a conversa sem resposta, a campanha parada.

## Por que agora
- O funil da Pediatria trava no fim, não no começo: 5.407 médicos alcançados, 517 responderam, 78
  interessados e 8 contratados.
- Há 30 médicos quentes esperando dono há mais de 12 horas; o mais antigo, há 6 dias.
- A tela de acompanhamento abre cerca de 7 mil cards e mais de 900 requisições, e chega a travar o
  navegador.

## Antes e depois

| Tela | Antes | Depois | O que muda |
|---|---|---|---|
| Campanhas | 5 | 8 | "Espera você" no topo com a ação de cada caso; campanha com a régua do funil; 14 controles viram 5 |
| Quentes e Kanban | 3 | 8 | Uma fila de quentes sem dono, do mais antigo, com "Assumir"; Kanban cabe na tela e carrega 50 por coluna; espera em dias |
| LinkedIn | 7 | 8 | Um botão faz o caminho comum; a confiança do perfil diz o que confere |
| Conversas | 6 | 8 | Painel do médico ao lado da conversa (etapa, campanha, cidade, próximo passo); mover etapa no cabeçalho |
| Leads | 5 | 8 | Segmentos salvos e "Pôr em campanha" em lote; nomes em caixa normal |
| Início | 4 | 8 | "Hoje para você": uma lista com quentes, tarefas, campanhas e conversas, cada uma com a sua ação |
| BI · Raio-X | 7 | 9 | Abre com a frase do gargalo; o ponto que trava fica em destaque |
| Vagas | 6 | 8 | Sem cartões zerados; a vaga mais antiga primeiro; o vazio diz o que fazer |

Nota de 0 a 10: pergunta da tela respondida no topo, ações que competem, informação por linha, estados e
defeitos de layout medidos em 1440 e 1024 px. Antes: 15 falhas de corte e transbordo nas 6 telas. Depois:
0 falhas em todas as telas e larguras.

## O que fica igual
- O **menu verde**, que a equipe já conhece (decisão do Raul). Muda só o conteúdo: grupos que recolhem e
  contador só onde algo espera a pessoa.
- As fontes do Sigma (Sora e Manrope) e o verde da GSS.
- As regras de negócio e os dados: o redesenho mexe em layout, hierarquia e texto de tela.

## A assinatura: a régua do funil
As mesmas 5 etapas, sempre na mesma ordem e na mesma cor (Novo, Contatado, Respondeu, Atendimento,
Convertido), na campanha, no Kanban, na conversa e no BI. A etapa onde o funil trava fica em âmbar.

## Próximos painéis possíveis com os dados de hoje
Mapa completo na última página do Figma e em `mapa-telas-e-paineis.md`. Os cinco de maior valor:
1. Início da captadora (já desenhado).
2. Saúde da Máquina: ritmo de envio e números de envio, toda manhã.
3. Funil por campanha (já desenhado no Raio-X).
4. **Furos de escala e "Cobrir o furo"**: cruza os plantões descobertos do Dr. Escala com a base de 828 mil
   médicos e diz quem chamar.
5. Painel dos sócios: contratados, plantões cobertos e funil numa tela.

## O que precisa da GSS
1. Usar "Assumir" e mover a etapa do lead: sem isso, conversão e produtividade por captadora não aparecem.
   O redesenho põe essas duas ações no caminho natural.
2. Autorizar o Conta Azul (Mavi), para a receita entrar no painel dos sócios.
3. Validar com 2 captadoras a tela de Quentes e a de Conversas antes de virar código.

## Como vira produto
Se aprovado, o redesenho entra por telas, numa branch, passando pelos mesmos portões (layout em 1440 e
1024, UX, tipos e build) antes de ir para a produção. Ordem sugerida: Quentes e Kanban (resolve também a
lentidão), Conversas, Campanhas, Início, Leads, BI e Vagas.
