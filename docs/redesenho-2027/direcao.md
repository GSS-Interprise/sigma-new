# Sigma GSS: direção visual do redesenho (proposta, 13/11/2026)

Base: o raio-X (`raio-x.md`). Esta direção vale para as 6 telas do escopo e, se aprovada, vira tema para
o resto do Sigma. O redesenho mexe em layout, hierarquia, texto de tela e estados. Consultas e regras de
negócio ficam como estão.

## Ideia central
O Sigma hoje mostra tudo o que sabe. O redesenho mostra primeiro **o que espera a pessoa**: o lead quente
sem dono, a conversa sem resposta, a campanha parada. Os números da máquina (base total, sem WhatsApp, fonte
do dado) saem do topo e só aparecem quando quebram ou quando alguém pede.

## Cor
- **Verde GSS** (`hsl(123 63% 23%)`, o primário de hoje) continua como cor da marca: botão principal, item
  ativo do menu, a etapa "convertido".
- **Uma cor por significado, em todas as telas:**
  - âmbar = espera você (lead quente sem dono, conversa sem resposta, vaga atrasada);
  - vermelho = quebrou (número sem permissão, campanha parada sem número de envio);
  - verde = feito, convertido;
  - cinza = neutro, a máquina.
- **Sai o roxo da IA.** A IA vira um rótulo de texto pequeno e neutro ("IA respondeu"), sem cor própria.
- **Menu verde de hoje, mais enxuto (decisão do Raul, 13/11):** o verde-escuro fica, porque a equipe usa o
  Sigma há muito tempo e um menu claro causaria estranheza. Muda o conteúdo: grupos recolhíveis, item ativo
  com texto forte e barra verde-clara fina, contador âmbar só onde algo espera a pessoa.
- **Padrão escolhido:** a variação A da tela Campanhas com o menu verde (protótipo
  `prototipos/campanhas-A2.html`, Figma página "Depois", linha "Escolhida"). As outras telas seguem esse
  padrão.

## Tipografia
- Mantém o par que o Sigma já usa: **Sora** nos títulos e **Manrope** no texto. Ele tem personalidade e já
  está carregado.
- Números sempre em Manrope com `tabular-nums`, nunca em fonte de código.
- Nome de pessoa em caixa normal ("Ana Ribeiro", não "ANA RIBEIRO"); especialidade em caixa normal
  ("Ginecologia e obstetrícia"). Só a exibição muda; o banco fica como está.
- Rótulos e cabeçalhos de tabela em frase normal, peso médio, sem caixa alta espaçada.

## Espaço, raio e caixas
- Escala curta de 4, 8, 12, 16, 24 e 32 px. Denso onde se trabalha (Kanban, Leads, Conversas); folgado onde
  se decide (BI).
- Menos caixas: o conteúdo fica num plano só, sem cartão dentro de cartão. Borda só onde agrupa uma ação.
- Raio de 8 px nos controles e de 12 px nos painéis.

## Estrutura de toda tela
1. **Uma linha de cabeçalho:** título curto à esquerda e a ação principal à direita. Sai a trilha "Home >
   X", que o menu já mostra, e sai o subtítulo explicativo.
2. **"Espera você"** logo abaixo: de 1 a 3 itens acionáveis, com o tempo de espera em dias ou horas
   legíveis ("há 6 dias", nunca "4469h").
3. O trabalho (lista, Kanban, conversa).
4. A máquina (totais da base, fonte e hora de leitura) por último, em texto pequeno, ou atrás de um clique.

## Menu
- Os 26 itens viram grupos recolhíveis por tarefa: Prospecção, Operação clínica, Gestão e Sistema. Cada
  pessoa vê aberto só o grupo do seu papel.
- O ícone fica só no menu recolhido (trilho de ícones, com dica no mouse e no foco). Com o menu aberto, só
  texto.
- Busca Ctrl+K para pular para qualquer tela ou lead.
- Sai o rodapé com o nome do sistema.

## Assinatura da GSS: a régua do funil
Um elemento que só o Sigma tem: a **régua do funil GSS**, com as 5 etapas sempre na mesma ordem e na mesma
cor: Novo → Contatado → Respondeu → Em atendimento → Convertido.
- Aparece fina no cartão da campanha (onde os leads dessa campanha estão), no cabeçalho das colunas do
  Kanban, na conversa aberta (em que etapa está esse médico) e no BI.
- A etapa onde o funil trava ganha o âmbar. Hoje é "Respondeu → Em atendimento": quente sem dono.
- Uma assinatura; o resto fica quieto.

## Estados
- **Carregando:** esqueleto com a forma do conteúdo, só depois de 300 ms. O Kanban carrega por coluna e por
  página (50 cards), não os 7 mil de uma vez.
- **Vazio:** diz o que fazer, com um botão ("Nenhuma vaga aberta. Cadastrar vaga"). Sem cartão zerado ao
  lado.
- **Erro:** o que houve e como resolver ("O número (11) 90000-0000 perdeu a permissão na Meta. Reconectar").
- **Sem permissão:** diz quem libera o acesso.
- **Texto longo:** nome de hospital com 80 caracteres corta em uma linha, com o texto inteiro na dica.

## Motion
Tokens da casa (`trilhas/references/motion.md`): entrada em 150 a 250 ms com ease-out, saída mais curta,
nada anima no carregamento de tabela ou indicador, e o movimento reduzido é respeitado. A única animação com
intenção: o card que muda de etapa desliza para a coluna nova (200 ms).

## O que muda por tela (resumo)

| Tela | Topo novo ("espera você") | Três mudanças principais |
|---|---|---|
| Campanhas | "3 campanhas pedem você": quentes sem dono, sem número de envio, ritmo abaixo do dia | cartões de contagem saem; filtros viram uma linha; cartão da campanha com a régua do funil e no máximo 4 informações |
| Acompanhamento | a fila "Quentes sem dono", ordenada por espera, com "Assumir" em um clique | três avisos viram um; Kanban cabe na largura (colunas recolhíveis) e pagina; espera em dias |
| LinkedIn | "Faltam 15 convites hoje" e o próximo lead | um botão "Copiar e abrir perfil"; "Feito" e "Pular" ao lado; confiança do perfil legível |
| Conversas | "7 conversas esperam resposta" | faixa de números vira um seletor com nome e campanha; painel do lead ao lado da conversa (régua, campanha, especialidade); ações de etapa no cabeçalho |
| Leads | segmentos salvos ("Pediatria em SC sem contato") com "Pôr em campanha" | indicadores saem do topo; nome em caixa normal; seleção em lote; linha clicável |
| Home | "Hoje para você": tarefas, quentes e pendências do seu setor numa lista só | calendário vira faixa da semana; pendências agrupadas por tipo com contagem; HTML cru tratado |
| BI Raio-X | a frase do gargalo ("Só 8 de 78 interessados viraram contrato") | barra do gargalo em âmbar; rótulos sem numeração em caixa alta; filtros numa linha |
| Vagas | a vaga mais atrasada, ou o vazio com "Cadastrar vaga" | cartões zerados saem; filtros só aparecem com dado; "Relatório de hoje" diz por que está desligado |
