---
tags: [arquitetura, sigma, financeiro, fechamento, multifonte, dr-escala]
projeto: SigmaGSS
autor: Raul + Claude
data: 2026-08-04
status: em-execucao   # rascunho | pronto-pra-executar | em-execucao | entregue
operador: Raul
repo: sigma-new
parent: financeiro-fluxos-integracao-conta-azul.md
---

# Fechamento financeiro — fases + ingestão multi-fonte

> Consolida a conversa com Ramone/Mavi (04/08) e a análise do relatório real
> `relatorio_completo_previsao_financeiro.xlsx` (Dr. Escala, 01–31/07/2026, HRO Chapecó).
> Substitui a premissa do F1 anterior ("o relatório entra já consolidado; tratar o cru é
> outro projeto") — **o tratamento do relatório cru passa a ser dentro do Sigma**.

## 1. Princípio

O financeiro tem **três fases explícitas**, e o fechamento é o objeto que caminha entre elas:

```
[1] FECHAMENTO          → importa, trata, confere, ajusta          (Mavi)
[2] EM APROVAÇÃO        → aprovado vira pagamento pendente          (João)
[3] PAGAMENTO           → paga, comprovante, NF, contabilidade      (Thais)
```

Hoje só a fase 3 roda de verdade. A fase 1 existe como esqueleto vazio e a 2 tem o dialog
mas nunca foi alimentada. **A fase 1 é o trabalho deste doc.**

Regra que não muda: a Mavi **não mexe mais em planilha fora do Sigma**. O arquivo cru entra
como veio da origem e todo o tratamento acontece na tela.

## 2. Decisões travadas (Raul, 04/08)

| # | Decisão |
|---|---|
| D1 | `Tipo = A VISTA` no Dr. Escala significa **já pago**. Não gera pagamento a pagar — entra como já quitado e sai do valor a repassar. |
| D2 | Ajustes (+/-) são por **categoria fixa**, com tela pra Mavi **cadastrar categoria nova**. Justificativa obrigatória. |
| D3 | O fluxo do Dr. Escala segue pelo **relatório Completo**. O consolidado é aposentado. |

## 3. Por que o Completo e não o consolidado

Análise dos dois, com números reais:

| | Consolidado (o que a Mavi usou hoje) | **Completo (adotado)** |
|---|---|---|
| Grão | 1 linha por médico | **1 linha por plantão** (196 linhas / 11 médicos) |
| CPF | não | **sim** — chave de casamento confiável |
| À vista | não distingue | **coluna `Tipo`** — R$ 64.105 de R$ 316.160 (20,3%) |
| Período | não carrega | **linha 3**: `01/07/2026 - 31/07/2026` |
| Conferência | cega | soma bate 11/11 com o total impresso pelo próprio Dr. Escala |
| Alimenta `financeiro_pagamento_itens` | ❌ impossível | ✅ 1:1 com as colunas da tabela |

O import de hoje (04/08 14:16, 14 linhas, R$ 112.842,36) entrou **todo como 8/2026** sendo
julho, e um médico entrou com **R$ 0,00 / 10 plantões** — os dois defeitos são do consolidado
+ mês vindo de seletor. O Completo elimina os dois.

## 4. Estrutura do relatório Completo (parser)

Layout hierárquico, não é tabela plana — **não cabe em `mapa_colunas`**, precisa de parser
dedicado (`formato: 'dr_escala_completo'`), que serve pra qualquer export desse tipo:

```
linha 1   Emitido em: 04/08/2026, 11:33:34
linha 2   Completo - Previsão Financeiro
linha 3   01/07/2026 - 31/07/2026          ← MÊS/ANO DE REFERÊNCIA vem daqui
linha 4   HOSPITAL REGIONAL DO OESTE - CHAPECO     ← unidade (pode repetir p/ vários hospitais)
  linha   <Nome> - <CRM>/<UF>  |  <CPF>            ← início do bloco do médico
  linha   Data | Início | Fim | Duração | Local | Setor | Tipo | Qtd Itens | Vlr Unit | Somatório | Valor Hora | Valor Fixo | Valor Estimado
  linhas  ...plantões...
  linha   Total de <Nome> | Qtd Horas Total: 320:00 | ... | Valor Total Somado: R$ 57.500,00   ← usar como CHECKSUM
```

Regras do parser:
- **Mês/ano**: da linha 3. O seletor da tela vira apenas confirmação (mostra o que o arquivo
  diz e **bloqueia** divergência). Fim da classe de erro "julho virou agosto".
- **Checksum obrigatório**: soma das linhas × `Valor Total Somado` por médico. Divergiu →
  o import falha com o nome do médico. (Validei: 11/11 batem.)
- **`Tipo`**: `A VISTA` marca o item como já pago (D1). Atenção — `Tipo` é sobrecarregado:
  quando é `A VISTA` o relatório **perde** o turno (`Diurno`/`Noturno`). Aceitável; registrar
  `tipo_original` cru.
- **Casamento do médico**, em cascata: `CPF` → `CRM` (só dígitos) → `nome` normalizado
  (sem acento/caixa). Testado neste arquivo: **10/11**. Só falha quem não tem cadastro
  (Silvia Garcia Ambrosio, CRM 43301).
  ⚠️ O banco guarda CPF e CRM em **dois formatos** (`74982125953` e `008.283.202-17`;
  `26366` e `CRM/SC 26366`) — normalizar dos dois lados é o que leva de 5/11 pra 10/11.
- Itens por hora: `Valor Estimado`. Layout já prevê itens avulsos (`Qtd Itens` / `Vlr Unit`);
  neste arquivo vem tudo `-`, mas o parser trata os dois.

## 5. Modelo de dados

Aproveita o que já existe. Só o que está marcado **[novo]** precisa de DDL.

```
financeiro_fechamentos            (existe, vazia)  fase 1→2→3, status + aprovado_por/em
  └─ financeiro_pagamentos        (existe, em uso) 1 por médico por fechamento
       ├─ financeiro_pagamento_itens   (existe, vazia)  1 por plantão  ← o Completo alimenta
       │     + tipo               [novo]  text     'NORMAL'|'A VISTA'|'Diurno'|'Noturno'
       │     + pago_a_vista       [novo]  boolean  default false      (D1)
       └─ financeiro_pagamento_ajustes [NOVA TABELA]
             categoria_id, valor (+/-), justificativa (obrigatória), criado_por, criado_em
financeiro_ajuste_categorias      [NOVA TABELA]  nome, sinal_sugerido, ativo   (D2)
```

`financeiro_pagamentos.valor_total` passa a ser **derivado**:
`Σ itens (exceto os já pagos à vista) + Σ ajustes`. Guardar também `valor_a_vista` pra
Mavi ver "produziu X, já recebeu Y à vista, a pagar Z".

Categorias iniciais (seed, editáveis por ela): `Gestão`, `Bônus`, `Desconto`,
`Adiantamento`, `Reembolso`, `Correção de escala`.

⚠️ Lembrete de infra: `GRANT ... TO authenticated, service_role` logo após cada `CREATE TABLE`
— tabela criada por SQL direto não herda GRANT e derruba as edges com `42501`.

## 6. Telas (a lacuna que a conversa expôs)

1. **Lista de fechamentos** — por mês, com seletor de **fonte** (Dr. Escala Completo,
   Radiologia Marieta, CIS Navegantes, Ambulatório…) e o status da fase.
2. **Detalhe do fechamento** — médicos, valor produzido, à vista, ajustes, a pagar. Botão
   "Enviar para aprovação" (fase 1 → 2).
3. **Detalhe do médico** *(a tela que não existia)* — plantões linha a linha + bloco de
   **ajustes**: adicionar +/- por categoria com justificativa, editar, remover, com histórico
   de quem lançou. É aqui que entram os R$ 200 de gestão.

## 7. Ordem de entrega

| Fase | Escopo | Depende de |
|---|---|---|
| **E1** ✅ | Parser `dr_escala_completo`: mês do arquivo, checksum, à vista, itens por plantão, casamento CPF/CRM/nome normalizado | DDL das 2 colunas em `pagamento_itens` |
| **E2** ✅ | Ajustes: 2 tabelas novas + bloco de ajustes na tela do médico + `valor_total` derivado | E1 |
| **E3** ✅ | Fases: ativar `financeiro_fechamentos` de verdade (lista + detalhe + enviar p/ aprovação), seletor de fonte | E1 |
| **E4a** ✅ | Radiologia em matriz (Marieta + CEPON): parser `matriz_exames`, aba por competência, Acréscimos/Descontos viram ajustes | arquivos da Mavi (recebidos 05/08) |
| **E4b** ⏸️ | PDFs do CEPON: extração funciona e **confere com a planilha** (82/84) — ver §10 | de-para procedimento→coluna + PDFs que faltam |
| **E4c** ✅ | Carestream `RESUMO MÉDICO` → contas a **receber** (23 médicos, R$ 325.207,58, 0 divergência) | — |
| **E4d** | Produção individual (Carlos Cristofaro) — 1 médico, layout próprio | decisão de escopo |
| **E5** | Contas a receber consolidado a partir do fechamento (hoje `financeiro_receber` vem de contrato, não do fechamento) | E3 |

E1+E2+E3 entregues em 05/08. E4 depende dos arquivos que a Mavi vai mandar;
E5 depende de decisão sobre o grão do contas a receber (ver §8).

**Correção aplicada em 05/08:** as 14 linhas importadas como 08/2026 foram remanejadas para
07/2026 (R$ 112.842,36, São João Batista) — os plantões eram de julho.

## 8. Riscos / pontos abertos

- ~~Limpeza do import errado~~ — **resolvido em 05/08**: as 14 linhas foram remanejadas de
  08/2026 para 07/2026 (nenhum dado perdido, status `pendente` preservado).
- **`A VISTA` = já pago** vale pra todo hospital ou só pro contrato do HRO? Confirmar quando
  chegar relatório de outra unidade.
- **Médico sem cadastro** (Silvia Garcia Ambrosio): decidir se o import cria o cadastro
  automático ou fica pendente pra Mavi resolver. Sugestão: fica pendente, com botão "cadastrar".
- **CPF/CRM em dois formatos no banco** — normalizar na leitura resolve agora; padronizar a
  gravação é dívida técnica separada.
- Um médico com **R$ 0,00 e 10 plantões** no import de hoje sugere que o consolidado às vezes
  não traz valor. Mais uma razão pro Completo — lá o checksum pegaria.


## 9. Formatos de radiologia (análise dos arquivos de 05/08)

| Arquivo | O que é | Estado |
|---|---|---|
| `Marieta .xlsx` | Matriz médico × exame (TC, TC TOTAL, RX, USG, DOPPLER, ANGIO, RM, MMG, URETRO), aba por mês | ✅ importa (26 médicos em JUN, R$ 238.267,38, 0 divergências) |
| `CEPON Radiologia .xlsx` | Mesma matriz (ANGIO, TC, RX, USG, DOPPLER, BIÓPSIAS, MARCAÇÃO/CORE, DREN. BILIAR) + bloco pró-labore/INSS/distribuição | ✅ importa (21 médicos em JUN, 1 divergência real) |
| 5 PDFs do HEMOSC/CEPON | **Quantidade** por médico+CRM por tipo de exame no período. É a FONTE do que a Mavi digita na planilha CEPON — números conferidos e batem | ⏳ E4b |
| `PRODUÇÃO CARLOS CRISTOFARO .xlsx` | Produção individual, blocos por dia da semana, preços próprios (US 55, DOPPLER 110, BIÓPSIA 200) | ⏳ E4c |
| `Fechamento … GSS - ENVIO AJUSTE 2.xlsx` | Carestream cru: 13.352 laudos + abas de de-para (`EQUIVALÊNCIA` modalidade→tipo, `PROCEDIMENTOS` 681 códigos com preço, `MÉDICOS GSS` de-para de nomes, `LAUDOS` prazos) + `RESUMO MÉDICO` já calculado | ⏳ E4c |

**O circuito real da radiologia:** PDF (quantidade) → planilha da equipe (× preço) → Total À Pagar.
O E4a traz o resultado dessa conta pro Sigma; o E4b elimina a digitação.

### Pontos abertos da radiologia

- **Preço por médico no Marieta**: TC sai a 20,63 para uns e 25,00 / 23,00 para outros. Confirmar
  se a tabela de preço é por médico (contrato individual) ou se são subtipos misturados.
- **CEPON, o que se paga**: `Total À Pagar` (bruto) ou `Valor Total` (líquido, depois de
  pró-labore e INSS)? Hoje importo o bruto.
- **Carlos Cristofaro (CEPON)**: `Total À Pagar` é **número digitado à mão** (R$ 29.947,50) e não
  bate com as colunas de valor da própria planilha (R$ 9.383,96) nem com o arquivo de produção
  dele (R$ 10.540,17). Perguntar de onde vem.

### Vínculo com contrato (mínimo, como pedido)

`financeiro_import_config.cliente_id` já existia e nunca era preenchido — agora as 3 fontes
apontam para o cliente, e por ele chega-se ao contrato. Nada de estrutura nova.

| Fonte | Cliente | Contrato |
|---|---|---|
| Marieta Radiologia | Hospital e Maternidade Marieta Konder Bornhausen | CT 121/2023 (Exames) — **vence 30/08/2026** |
| CEPON Radiologia | FAHECE – Fundação de Apoio ao HEMOSC / CEPON | CT 014/2023 e CT 012/2023 |
| Dr. Escala (HRO) | Hospital Regional do Oeste de Chapecó | CT PSM30-102025 (Plantão Presencial) |

⚠️ Os dois contratos do CEPON estão com `data_fim` no passado (18/06/2024 e 08/05/2026) e
`status_contrato = Ativo` — ou o cadastro está desatualizado, ou houve aditivo não registrado.


## 10. E4b — os PDFs conferem; falta o de-para de procedimento

> **Correção (05/08).** A primeira análise concluiu que "a planilha não é transcrição fiel
> dos PDFs". Estava errada: eu comparava 1 PDF = 1 coluna. Um PDF agrega procedimentos que
> a equipe separa em colunas diferentes.

Com a agregação correta e nomes normalizados ignorando conectivos (de/da/do):

| PDF | Colunas da planilha |
|---|---|
| Radiografia | RX |
| Tomografia | TC |
| Ultrassonografia analítico | USG **+** DOPPLER |
| Biopsia (+ Biopsia próstata) | BIÓPSIAS **+** MARCAÇÃO/CORE |

**82 de 84 pares batem.** Os PDFs são fonte confiável.

As 2 diferenças que sobram:

- **Carlos Cristofaro** — PDF tem 44 biópsias (39 + 5 de próstata), a matriz conta 39. As 5 de
  próstata ficam fora. Provavelmente ligado ao total dele ser digitado à mão (§9).
- **Pedro Afonso Mori Carrilho** — 23 tomografias no PDF, 0 na planilha. Está no relatório do
  hospital e não entra no fechamento.

### O que falta para automatizar

1. **De-para procedimento → coluna.** O caso da biópsia mostra que é limpo e derivável:
   `Biópsia Percutânea Orientada por US, TC, ou RX` → BIÓPSIAS;
   `Punção de Mama por Agulha Grossa (Core Biopsy)` → MARCAÇÃO/CORE.
   É a mesma ideia das abas `EQUIVALÊNCIA`/`PROCEDIMENTOS` que o arquivo Carestream já traz.
2. **Os PDFs que faltam.** A Mavi disse "tem outras da Radiologia" — o conjunto enviado é
   parcial. A separação USG × DOPPLER não fecha só com o que temos.

Nível de confiança por camada: **total por médico** já é confiável (regex validado nos 5 PDFs);
**split por sub-coluna** depende do item 1.

## 11. Os dois lados do fechamento (E4c)

| | Fonte | Preço | Total 06/2026 |
|---|---|---|---|
| **A receber** | `Fechamento … GSS` (Carestream, aba RESUMO MÉDICO) | contrato com o cliente (TC R$ 34,65) | **R$ 325.207,58** |
| **A pagar** | `Marieta .xlsx` (aba do mês) | acordo com o médico (TC R$ 20,63 / 23,00 / 25,00) | **R$ 238.267,38** |
| | | **margem** | **R$ 86.940,20 (26,7%)** |

A quantidade de exames é a **mesma** nos dois (Airton TC 97, Eduardo TC 618, Gustavo TC 1) —
é o preço que muda. Por isso `financeiro_import_config.direcao` decide se o arquivo vira
`financeiro_pagamentos` ou `financeiro_receber`.
