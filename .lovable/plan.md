

## Análise: criar 2º disparo na mesma proposta com instância diferente

### Resposta direta

**Hoje isso NÃO funciona como você espera.** Há 2 conflitos que vão te bloquear/atrapalhar:

### Conflito 1 — Botão da UI bloqueado (ZapTab)

`ZapTab.tsx` desabilita "Adicionar disparo Zap" enquanto existir QUALQUER contato em `1-ENVIAR / 2-AGENDADO / 3-TRATANDO` para a `campanha_proposta_id`. Como o 1º disparo está rodando há 10h com contatos em fila, **o botão está travado** e você não consegue nem clicar para criar o 2º.

### Conflito 2 — RPC reaproveita o mesmo `disparos_campanhas` (NÃO cria um novo)

Mesmo que o botão liberasse, a função `gerar_disparo_zap` faz isto (linhas 52-87 da migration `20260422120248`):

```text
SELECT id INTO v_disparo_campanha_id
FROM disparos_campanhas
WHERE campanha_proposta_id = ? AND ativo AND status NOT IN (concluido,cancelado)
LIMIT 1;

IF achou:
  UPDATE disparos_campanhas SET chip_id=novo, instancia=nova ...   -- sobrescreve!
ELSE:
  INSERT novo disparos_campanhas
```

Consequências se o reuso acontecesse:
- A **instância da campanha em curso seria sobrescrita** pela nova → o n8n continuaria puxando contatos pendentes daquele `campanha_id`, mas agora marcados com a instância nova → mensagens enviariam pelo chip errado, e o contador "instância em uso" do 1º chip ficaria inconsistente.
- A validação "instância já em uso" (linhas 38-45) **só dispara se a instância nova já estiver ocupada por OUTRO disparo** — não impede a sobrescrita do disparo existente da mesma proposta.
- Os contatos novos inseridos ficariam todos sob o mesmo `campanha_id`, misturando 2 lotes que deveriam usar chips diferentes.

### Cenário ideal que você quer

1 proposta → N disparos paralelos, cada um com sua própria instância, cada um com seus próprios `disparos_contatos`, cada um respeitando seu limite diário de 120, e o n8n conseguindo distinguir qual lote vai por qual chip.

### Mudanças necessárias para suportar isso

**A) RPC `gerar_disparo_zap`**
- Trocar a busca "achou disparo ativo da proposta → reusa" por: "achou disparo ativo **com a MESMA instância** da proposta → reusa; senão → cria novo `disparos_campanhas`".
- Manter a checagem "instância X já está em uso por outro disparo ativo" (essa parte já está correta e impede 2 disparos paralelos com o MESMO chip).

**B) `ZapTab.tsx` — bloqueio do botão**
- Mudar a query `disparo-em-andamento` para:
  - Buscar instâncias atualmente em uso por disparos ativos desta `campanha_proposta_id`.
  - Desabilitar o botão **somente se o chip selecionado** (ou nenhum chip, caso haja N disparos rodando) coincidir com uma instância em fila.
- Mostrar lista visual: "Disparos ativos nesta proposta: chip A (45 pendentes), chip B (12 pendentes)" para o usuário ter contexto.

**C) Edge function `disparos-zap-pendentes`**
- Já agrupa por `(campanha_id + instancia)` — **isso já está correto**, vai gerar 1 lote por chip automaticamente.
- O limite diário de 120 já é por instância — **também correto**.

**D) `disparos-callback`**
- Verificar se atualizações de status batem por `disparos_contatos.id` (não por `campanha_proposta_id` agregado). Se sim, nada muda.

**E) Bloqueio do disparo manual (`useLeadsAContactar`)**
- Continua correto: bloqueia o lead se ele estiver em fila em **qualquer** disparo, independente de instância.

### Arquivos a editar

- `supabase/migrations/<nova>.sql` — nova versão de `gerar_disparo_zap`
- `src/components/disparos/ZapTab.tsx` — lógica de disable por chip
- `src/components/disparos/DisparosNovoDialog.tsx` — mesma lógica de disable por chip
- (verificar) `supabase/functions/disparos-callback/index.ts` — confirmar agregação por `id`

### Risco / pontos de atenção

- O 1º disparo em curso (10h) **não deve ser tocado** — a migration só altera comportamento futuro.
- A capacidade total da proposta passa de 120/dia para **120 × N instâncias/dia** — confirme se isso é desejado (parece ser, já que é seu objetivo).
- Confirmar que não há dependência em outro lugar do código que assuma "1 disparos_campanhas por campanha_proposta_id".

