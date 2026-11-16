# Card do Kanban e painel do lead (proposta, 16/11/2026)

Pedido do Raul: redesenhar o card do Kanban de Campanhas e o painel que abre ao clicar num lead. É só desenho; o
código (`CampanhaProspeccaoKanban.tsx` › `LeadCard`, `acompanhamento/AcompanhamentoCard.tsx` e
`acompanhamento/AcompanhamentoLeadPainel.tsx`) não mudou.

- Protótipos: `prototipos/x-kanban-cards.html`, `x-lead-quente.html`, `x-lead-atendimento.html` (gerador
  `prototipos/gerar_lead.py`, dados fictícios).
- Figma: página "Depois · card do Kanban e painel do lead (16/11)", em 1440 e 1024.
- Portão visual: 0 falhas e 0 avisos nos 3 protótipos, em 1440 e 1024.

## Card: pergunta e regra
Pergunta: "quem desta coluna espera alguém, e o quê?". O card mostra no máximo 4 informações:
1. nome e dono (iniciais, "IA", ou "Sem dono" em âmbar);
2. especialidade e cidade, numa linha;
3. a frase do médico (coluna Respondeu) ou a barra de validação com até 2 etiquetas (Em atendimento);
4. uma linha de situação, uma só, pela prioridade: falha de envio (vermelho) > mensagens novas e há quanto tempo
   espera (âmbar) > janela de 24 h > quem conduz.

Hoje o card chega a 11 elementos: faixa "Precisa de atenção", nome, especialidade, faixa de canais, cidade,
campanha, selo de outras campanhas, selo de estratégia, selo IA/humano/equipe, selos do perfil IA, barra 0/4,
contagem de mensagens, idade, "sem dono" e o editor de etiquetas com alvos de 44 px dentro do card.
Saem do card e ficam no painel: campanha, outras campanhas, estratégia, perfil IA e o editor de etiquetas.
A borda esquerda vira âmbar ("espera você") em vez de vermelha; o vermelho fica só para o que quebrou.

## Painel: pergunta e regra
Pergunta: "o que eu faço agora com este médico?".
- Topo: nome, uma linha com especialidade, cidade, telefone e campanha; a régua do funil com a etapa atual.
- Uma ação principal por etapa, no topo à direita, no mesmo lugar: Assumir lead → Encaminhar para oportunidade
  (x/4) → Confirmar envio a Contratos. Ao lado só "Marcar perdido"; E-mail, Editar contato e Prontuário vão
  para o menu "…".
- "Próximo passo" logo abaixo, em uma frase ("Falta 1 validação para encaminhar: Validação equipe").
- Abas Validação, Tasks, Histórico e Notas como hoje; a validação mostra os 4 itens com o que cada um pede.
- Conversa sempre à vista à direita, com a janela de 24 h no cabeçalho. Com a IA conduzindo, um aviso diz que
  Assumir lead pausa a IA e a caixa de resposta fica bloqueada até assumir.
- Sai: o selo indigo do Perfil IA (vira uma linha "Perfil (IA)"), o subtítulo "cross-campanha" e o rodapé com
  8 botões.

## Se for para o código: o que muda no vídeo 3 (Do interessado ao contrato)
O vídeo replica o card e o painel de hoje. Implementado este desenho, refazer estes trechos:
- card quente sem dono: borda vermelha e chama viram borda âmbar e "Sem dono";
- os botões Assumir lead, Encaminhar para oportunidade e Confirmar envio a Contratos saem do rodapé e vão para o
  topo do painel (mesmos nomes);
- "Perdido" vira "Marcar perdido"; "Iniciar qualificação" só deixa de ser botão se o Raul aprovar a decisão 1;
- a conversa perde o título "Conversa unificada".
Ficam iguais: nomes das abas, os 4 itens da validação, as etapas e as colunas.

## Decisões para o Raul
1. Hoje Assumir lead (`prospeccao_assumir`) só marca o dono e pausa a IA; a etapa continua "quente" até alguém
   clicar em "Iniciar qualificação". Proposta: Assumir lead também move para Em atendimento, e o botão sai.
   Isso muda regra de negócio, então só com o seu ok; sem ele, o botão fica no menu "…".
2. Etiquetas: no card, só as 2 primeiras visíveis e o editor dentro do painel. Serve para a equipe?
