# Robô PNCP × Effecti — como a comparação funciona

**Objetivo:** decidir com dado, não com opinião, se o robô próprio pode
substituir a Effecti na GSS.

**Três perguntas** (definidas pelo Raul em 01/08/2026):

1. O robô capta **mais** editais bons que a Effecti?
2. O robô pega **tudo** que a Effecti pega?
3. **Falta algum** de verdade?

## Como está montado

### Dois kanbans

| | Board Effecti | Board Robô |
|---|---|---|
| Rota | `/licitacoes` | `/licitacoes/robo` |
| Menu | "Licitações" | "Licitações (Robô)" |
| Fonte | captadores n8n → Effecti | espelho `pncp_mirror` |
| Cards | ~1.512 | 9.291 |

Mesma página, mesmo componente de kanban, parametrizados por
`licitacoes.board` (`'effecti'` | `'robo'`). **Não** são telas duplicadas: se
divergissem, a equipe compararia UI em vez de comparar a fonte dos editais.

`board` é `NOT NULL DEFAULT 'effecti'` com `CHECK` travando o domínio. Card sem
board declarado não existe — foi o que vazou 5 cards do robô pro kanban da
equipe em 24/07.

### Isolamento — o que já mordeu

`useLicitacoesBI` puxava a tabela inteira sem filtrar board. Com 9.291 cards do
robô contra 1.512 da Effecti, **todo indicador da diretoria viraria robô**.
Corrigido em `ffaf3ed` antes da carga.

Não é hipotético: no CRM da AGES exatamente isso aconteceu — 46% do dashboard
era card de robô, descoberto só quando alguém foi olhar.

**Ao criar qualquer consulta nova sobre `licitacoes`, filtre `board`.** As
consultas por `id` são seguras (já estão dentro de um board).

### Crons

| Job | Horário | O que faz |
|---|---|---|
| `promover-board-robo` (49) | 05:30 BRT | promove até 500 editais novos do espelho pro board do robô |
| `analise-robo-effecti` (48) | 06:00 BRT | grava o retrato do dia em `analise_robo_effecti` |

Leitura: `select * from analise_robo_effecti_resumo;`

## A armadilha do denominador

**"A equipe manteve" NÃO é "a equipe quer."**

Dos 61 editais mantidos em 30 dias, **12 eram lixo que ninguém descartou**:
materiais elétricos, brinquedos infláveis, bandeiras da Marinha, higienização
de ar-condicionado, revitalização de praça, inscrição em congresso.

Medir recall contra o universo sujo **subestima o robô em ~11 pontos** (45,9%
bruto contra 57,1% limpo). Por isso a análise separa os dois números.

O filtro `tem_sinal_medico()` testa o objeto do **espelho**, não o do card — o
card da Effecti vem sem descrição em 84% dos casos.

## ⚠️ A chave de casamento — três medições erradas pela mesma causa

Casar o card da Effecti com o registro do espelho é o ponto mais frágil de tudo
isto, e errei três vezes seguidas:

| Reportei | Era | Causa |
|---|---|---|
| recall 90,7% | **cobertura**, não recall | media "o edital está no espelho?" e chamava de recall |
| recall 59,4% | denominador sujo | contava guindaste e transformador como "a equipe quer" |
| recall 60% | chave quebrada | comparava número como INTEIRO |

**A causa raiz das duas últimas:** o número do edital vem como texto com barras
e sufixos, e eu extraía só os dígitos iniciais.

```
card "CRE 012/2026"                → espelho numeroCompra "012/2026"
card "CRE 002/2026/FMS/SEMSA/2026" → espelho "002/2026/FMS/SEMSA"
```

O número **sempre bateu**. Minha normalização é que transformava `012/2026` em
`122026` e nunca casava.

**Regra:** `numero_do_titulo_effecti()` extrai a partir do primeiro dígito e
compara como **texto, por prefixo**, ancorado em município + UF.
**Nunca converter para inteiro.**

Um segundo bug na mesma função: `^[A-Za-z]+` não cobre acento, então "Pregão"
parava em "Preg" e sobrava `ÃOELETRÔNICO20/2026`. Eram 7 dos 18 não-casados.

## Onde estamos (01/08/2026, janela de 30 dias)

```
universo mantido pela equipe      61
  lixo não descartado            -12
universo limpo                    49

  robô pegou                      28   → recall limpo 57,1%
  falha de classificação           6   → corrigível (padrões nomeados abaixo)
  falha de cobertura              15   → a investigar
```

**Fluxo diário:** robô 83 editais relevantes contra **1** da Effecti (31/07).

### Os 6 misses de classificação — todos nomeáveis

- psiquiatria (score 2)
- neuropediatria (score 2)
- procedimentos ambulatoriais / diagnósticos (score 1)
- consultas de fonoaudiologia (score 1)
- serviços multidisciplinares: psicopedagogia, terapia ocupacional (score 1)

São especialidades e modalidades de atendimento que o classificador atual não
pontua o bastante. Corrigir leva dias, não semanas.

### Os 15 de cobertura — cuidado antes de concluir

Amostrei 5 e **2 eram erro meu de casamento**, não falha do robô (Conselheiro
Lafaiete estava no espelho com score 10; Uarini com score 6). **2 são buraco
real** — Serra do Salitre/MG e Pindaí/BA não existem nem no espelho nem no PNCP,
que é a cauda de municípios pequenos publicando fora do portal (art. 176 da Lei
14.133/2021, expira em 01/04/2027). **1 em aberto** (Tuparendi/RS).

Se a proporção se mantiver, boa parte dos 15 são falso alarme. **Não usar esse
número como definitivo sem investigar caso a caso.**

## O que ainda falta para decidir o corte

1. **Corrigir os 6 padrões do classificador** — dias
2. **Investigar os 15 de cobertura** um a um — horas
3. **Operação paralela**: a equipe trabalhando o board do robô por ~3 semanas.
   É o único item que não dá para acelerar, e o único que responde se a
   qualidade presta — recall mede se o edital chegou, não se ele é útil.

A decisão 35 (`cofre-obsidian/Decisoes/`) exige duas pernas verdes: captação
limpa **e** consumo verificado (o anexo abre? o card mostra o que a equipe
precisa?). A segunda nasceu de três defeitos que ficaram semanas no ar com todas
as rodadas de captura verdes.
