# Raio-X em modo apresentação: de onde vem cada número (13/11/2026)

O protótipo (`prototipos/t-bi-apresentacao.html`, Figma "Depois · as 7 telas", linha 7) foi feito para o
Maikon mostrar ao diretor de um hospital: escassez, esforço da equipe, funil, motivos de recusa, preço de
mercado e proposta. Este documento liga cada bloco ao que o Sigma já tem.

Levantamento pelo código e pelo esquema: RPCs `bi_raiox_*` (`supabase/migrations/20261109120000_bi_raiox.sql`
e ajustes de 12/11), `src/integrations/supabase/types.ts` e as migrations de `vagas`,
`conversa_classificacao` e `drescala_*`. Não consultei a produção; volumes e cobertura precisam de uma
contagem antes de virar tela.

## Resumo

| Bloco | Situação | O que falta |
|---|---|---|
| Capa (4 números) | **pronto** | nada: sai de `bi_raiox_funil` |
| 1. Mercado escasso | **parcial** | recorte por UF já existe; por cidade ou raio e por 100 mil habitantes, não |
| 2. Esforço da equipe | **parcial** | os totais existem; a série por semana e o LinkedIn pedem uma RPC nova |
| 3. Funil até o contrato | **pronto, com ressalva** | "contratados" depende da equipe marcar o lead como convertido |
| 4. Por que dizem não | **pronto** | nada: sai de `bi_raiox_objecoes` (com o trecho da fala) |
| 5. Quanto o mercado paga | **parcial** | o que o médico pede e o que a GSS oferece existem; o preço de licitação precisa de normalização |
| 6. O que propomos | **novo** | campos para o Maikon preencher por hospital |
| (sugestão) 7. Seu contrato hoje | **pronto para montar** | plantões cobertos e furos do hospital, vindos do Dr. Escala |

## Conferência com a produção (14/11/2026)

Os números do protótipo são fictícios, como manda a regra do Figma. Em 14/11 conferi na produção, só com leitura,
quanto dado real existe para cada bloco. Usei contagens agregadas e as próprias RPCs `bi_raiox_*` chamadas pelo
PostgREST.

| Bloco | O que a produção tem hoje | Dá para apresentar? |
|---|---|---|
| Capa e funil | Anestesiologia: 8.688 alcançados (2.526 WhatsApp, 7.260 e-mail), 437 responderam, 254 interessados, 12 campanhas desde 14/05. **Pediatria: `bi_raiox_funil` estoura o tempo (erro 57014, statement timeout)** | Anestesiologia sim; Pediatria, a maior especialidade (3.572 contatados), não abre |
| Contratados | 1 em Anestesiologia. `campanha_leads` tem 42 `convertido` no total; `contratos` tem 109 linhas, mas **`medico_id` está vazio em todas** | Não. O cruzamento com `contratos` que o doc propõe não existe hoje |
| 2. Esforço | WhatsApp: 12.226 leads com 1º contato desde 29/04 e 6.902 mensagens nossas ligadas a campanha. E-mail: 35.766 entregues desde 14/10. **LinkedIn e Instagram: 0 toques** em `campanha_lead_touches` (só `whatsapp` e `email`) | Sim, para WhatsApp e e-mail. LinkedIn e Instagram ficam fora até a fila nova rodar em produção |
| 4. Por que dizem não | 969 conversas classificadas, **só desde 09/11**. Motivo preenchido em 91. Por especialidade: 24 em Pediatria, 35 em Anestesiologia | Com ressalva: amostra de 5 dias e 24 a 35 respostas. Dizer o tamanho da amostra na tela |
| 5. Quanto o médico pede | `valor_pedido` em **3 de 969** classificações (2 em Anestesiologia, 0 em Pediatria) | Não |
| 5. Quanto a GSS oferece | `vagas` tem **2 linhas** | Não |
| 5. Setor público | 159 itens de licitação, 189 concorrentes, 121 resultados, sem filtro por especialidade | Não, por enquanto |
| 1. Mercado | CFM: 751.800 médicos; `mercado_brasil` sai (25.379 anestesiologistas). Cidade preenchida em 312.626 de 833.019 leads (38%) | Brasil e UF sim; região por raio só "na base da GSS" e com 38% de cidade |
| 7. Seu contrato hoje | `drescala_plantoes`: 2.025 plantões de 06/11 a 14/12, 46 furos | Sim, para os próximos dias, depois do de-para local × contrato |
| RPC do esforço | `bi_raiox_esforco` ainda **não existe** na produção (migration no branch, não aplicada) | Depende do OK do Raul |

### O que isso muda na ordem
1. **Tempo do `bi_raiox_funil`.** Investigado em 14/11: com cache quente, Pediatria abre em 2,8 s (3,5 s com as 4
   RPCs da tela em paralelo, 5,5 s com 3 especialidades); a 1ª chamada, com cache frio, passou dos 8 s. A causa é
   `_raiox_leads`: o OR impede índice e cada chamada varre os ~833 mil leads, 3 vezes por funil. Correção em
   `supabase/migrations/20261114100000_raiox_leads_sem_seq_scan.sql` (UNION com índice, 171 ms contra 526 ms, mesmo
   resultado). Não aplicada: espera o OK do Raul.
2. **Contratados:** preencher `contratos.medico_id` (ou ligar contrato ao lead) e pedir à equipe que marque
   `convertido`. Sem isso, a frase "para cada contratado, abordamos N" sai com N = 8.688.
3. **Valor pedido:** a classificação raramente acha valor na conversa. Para o bloco 5, ou a equipe registra o valor
   pedido no fechamento, ou o bloco sai da primeira versão.
4. **Motivos de recusa:** a classificação começou em 09/11; em 2 a 3 semanas a amostra fica apresentável.
5. LinkedIn e Instagram entram no esforço só quando houver toques registrados.

## Bloco a bloco

### Capa: médicos abordados, semanas, campanhas, contratados
- `bi_raiox_funil(p_especialidade_ids, p_ufs, p_desde)` devolve `alcancados`, `campanhas`, `desde` (as
  semanas saem daqui) e `contratados`.
- "Preparado para o Hospital X": `clientes` (nome_fantasia, uf) ou `hospitais` (nome, cidade, uf).

### 1. O mercado é escasso
- **Já existe:** `mercado_brasil` e `mercado_regiao` em `bi_raiox_funil`, contados em `cfm_medicos_staging`
  (CFM, situação ativa, por especialidade) com `sg_uf`. Também `mv_especialidade_uf_universo` (especialidade ×
  UF).
- **Falta 1, por 100 mil habitantes:** tabela pequena de população por UF e município (IBGE, dado público).
  Uma migration com cerca de 5.570 linhas.
- **Falta 2, região do hospital ou raio de 150 km:** o CFM só traz a UF, sem cidade. Dá para fazer de dois
  jeitos:
  - pela base da GSS: `leads.cidade` e `leads.cep` existem, mas ficam incompletos para quem nunca foi
    enriquecido;
  - por distância: tabela de municípios com latitude e longitude (IBGE) e a cidade do hospital
    (`hospitais.cidade`, `escalas_locais.cidade`).

  Proposta: "região" = municípios a até 150 km da cidade do hospital, contando só os médicos da base com cidade
  preenchida, e dizer na tela "na base da GSS".
- **Não existe:** "médicos com menos de 3 vínculos". O CFM não traz vínculos; só o CNES traria. Sai do
  protótipo, ou vira um projeto à parte de importar o CNES.

### 2. O esforço da equipe
- **Já existe (totais):** `alcancados_whatsapp` e `alcancados_email` em `bi_raiox_funil`.
- **Série por semana (falta a RPC):**
  - WhatsApp: `_raiox_contatos` já traz `primeiro_em` por médico, então basta agrupar por
    `date_trunc('week', primeiro_em)`. Para contar toda mensagem enviada e não só o primeiro contato, use
    `sigzap_messages` (`from_me`, `sent_at`, `campanha_lead_id`).
  - E-mail: `email_envios.entregue_em`, por semana.
  - LinkedIn: `campanha_lead_touches` com `canal = 'linkedin'` e `executado_em`. Só tem dado desde 11/11.
  - Proposta: `bi_raiox_esforco(p_especialidade_ids, p_ufs, p_desde)` devolvendo
    `[{semana, whatsapp, email, linkedin}]`, com os mesmos filtros das outras RPCs.
- **Conversas atendidas:** `responderam` em `bi_raiox_funil`. Mensagens trocadas podem sair de
  `sigzap_messages` nas conversas do escopo.
- **Ressalva:** o legado da Evolution (jun a ago/2026) só tem `data_primeiro_contato`, sem recibo. Entra na
  série como contato, mas sem os follow-ups daquela época.

### 3. Do contato ao contrato
- **Já existe:** `alcancados`, `responderam`, `interessados` e `contratados` em `bi_raiox_funil`
  (`campanha_leads.status` + `conversa_classificacao.resultado`). "Para cada contratado, abordamos N" é a conta
  `alcancados / contratados`.
- **Ressalva:** `contratados` conta `status = 'convertido'`, que a equipe quase não marca, e
  `leads.data_conversao` está quase vazio. Antes de levar a um diretor, confira o número com a lista real de
  contratados da especialidade. O mais seguro é cruzar com `contratos.medico_id` e `especialidade_contrato`.

### 4. Por que dizem não
- **Já existe:** `bi_raiox_objecoes` devolve os motivos com contagem e percentual e um `trecho` de fala por
  motivo, de `conversa_classificacao`. `bi_raiox_destrava` traz as regras do que destrava (distância, agenda,
  valor, indicação).
- **Cuidado:** o trecho é fala real de médico. Na apresentação a um hospital, mostrar sem nome, cidade ou
  qualquer coisa que identifique, e revisar o texto antes, porque pode conter nome de outro hospital ou de
  colega.

### 5. Quanto o mercado paga
Três números possíveis, e a tela fica mais forte com os três lado a lado:
- **O que o médico pede:** já existe. `bi_raiox_objecoes.valores` traz a mediana de `valor_pedido` por
  `valor_unidade`, de `conversa_classificacao`.
- **O que a GSS oferece hoje:** já existe. `bi_raiox_destrava` traz `oferta_atual`, a mediana de `vagas.valor`.
  O campo é texto livre ("R$ 1.800 / 12 h"); a RPC pega o primeiro número.
- **O que o setor público paga:** parcial.
  - Fontes: `licitacao_item_concorrentes` (`valor_ofertado`, `is_vencedor`, `empresa_nome`),
    `licitacao_itens` (`descricao`, `unidade_medida`, `vlr_und_deliberado`), `licitacao_resultados`
    (`valor_homologado`) e `licitacoes.municipio_uf`.
  - Falta 1: separar os itens da especialidade. A `descricao` é texto livre, então é preciso um filtro por
    palavra-chave, como o classificador do PNCP.
  - Falta 2: normalizar a unidade (hora, plantão de 12 h, plantão de 24 h, mês).
  - Falta 3: cobertura. Só entram as licitações que a GSS acompanhou e cuja ata foi lida. Contar quantas existem
    por especialidade e UF antes de prometer o gráfico.

### 6. O que propomos
- **Não existe:** a proposta é por hospital e quem escreve é o Maikon. Basta uma tabela
  `raiox_apresentacoes` (cliente, especialidade, região, valor proposto, condições em texto, data) ou campos
  editáveis no próprio modo apresentação, salvos por cliente.

### 7. (sugestão) Seu contrato hoje
O diretor quer saber como está o hospital dele. Desde 13/11 dá para mostrar:
- plantões do mês, cobertos e com furo, de `drescala_plantoes` (coluna `furo`), ligados por
  `drescala_locais` à unidade do contrato;
- contrato e vigência, de `contratos` (cliente_id, data_fim, especialidade_contrato).

Falta só o de-para entre `drescala_locais` e `clientes`/`contratos.unidade_id`. Histórico: só a partir de
13/11, então "cobrimos 94% em outubro" ainda não sai, mas "nos próximos 7 dias, 2 furos" já sai.

## Ordem sugerida para virar código
1. `bi_raiox_esforco` (série por semana e por canal): a RPC nova que mais muda a apresentação.
2. Conferir `contratados` contra `contratos` e ajustar a contagem.
3. População por UF e município (IBGE) para "por 100 mil habitantes".
4. Campos da proposta por hospital.
5. Preço de licitação normalizado (depois de contar a cobertura).
6. Região por raio (municípios com latitude e longitude) e "Seu contrato hoje".
