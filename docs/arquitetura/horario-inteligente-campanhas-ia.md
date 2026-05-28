---
tags: [arquitetura, sigma-gss, antiban]
projeto: SigmaGSS
autor: Raul
data: 2026-05-27
status: rascunho
operador: Raul
repo: GSS-Interprise/sigma-new
---

# Arquitetura de Solução — Horário inteligente das campanhas IA

> **O que é:** garantir que campanhas IA não disparem em janelas que prejudicam taxa de resposta nem queimam reputação dos chips. Hoje a Psiquiatria disparou 30 leads entre **04h25 e 06h29 da manhã** — horário ruim pra prospecção médica e bandeira vermelha pro WhatsApp.
>
> Campanha tem campo `horario_inteligente` boolean, mas está `false` nas 5 ativas e não há UI pra configurar janela horária por campanha.

## 1. O que precisa funcionar (a capacidade)

Toda campanha IA respeita uma **janela horária configurável** (default 09h-18h BRT, seg-sex). Fora dessa janela, o cron `campanha-batch-watcher` não dispara, mesmo se houver `next_batch_at` vencido. A configuração fica visível e editável na UI da campanha (wizard + tela de edição). Cron continua rodando a cada minuto, mas no `campanha-disparo-processor` há um guard que retorna early se está fora da janela do horário local da campanha.

## 2. Estado atual

**Hoje:**
- Coluna `campanhas.horario_inteligente` existe (boolean) mas é `false` em todas as 5 campanhas IA ativas
- Não há colunas pra `horario_inicio`, `horario_fim`, `dias_semana`
- `campanha-batch-watcher` (cron job `jobid=11`, schedule `* * * * *`) dispara `campanha-disparo-processor` quando há lead frio
- `campanha-disparo-processor` (edge function) é onde acontece o disparo via Evolution — não tem guard de horário hoje
- Psiquiatria disparou 30 leads entre 04h25-06h29 BRT em 27/05 (último incidente). Tubarão começou às 21h ontem
- Existe `vw_campanhas_dashboard.horario_inteligente` exposto mas inerte

**Memória relacionada:**
- Anti-ban v1 (referenced em `Sigma-Anti-Ban-Arquitetura` no Vault) — outras proteções já existem (`pre_send_check`, rate limits)
- `antiban_global_config` tem singleton com algumas configs runtime, mas não janela horária

## 3. A solução desenhada

### Schema novo

Adicionar 4 colunas em `campanhas`:

```sql
ALTER TABLE campanhas
  ADD COLUMN horario_inicio_brt smallint DEFAULT 9   CHECK (horario_inicio_brt >= 0 AND horario_inicio_brt <= 23),
  ADD COLUMN horario_fim_brt    smallint DEFAULT 18  CHECK (horario_fim_brt    >= 1 AND horario_fim_brt    <= 24),
  ADD COLUMN dias_semana        smallint[] DEFAULT ARRAY[1,2,3,4,5]  -- 1=seg, 7=dom
    CHECK (dias_semana <@ ARRAY[1,2,3,4,5,6,7]),
  ADD COLUMN horario_inteligente_ativo boolean DEFAULT true;

-- Backfill: ativar pra todas as IA existentes com defaults
UPDATE campanhas SET horario_inteligente_ativo = true WHERE tipo_envio = 'ia';
```

Mantém `horario_inteligente` legacy só pra compatibilidade — deprecar depois.

### Guard na `campanha-disparo-processor`

```ts
// supabase/functions/campanha-disparo-processor/index.ts (no início)

if (campanha.horario_inteligente_ativo) {
  const agora = new Date();
  const brtOffset = -3 * 60; // BRT = UTC-3
  const horaBrt = (agora.getUTCHours() + brtOffset / 60 + 24) % 24;
  const diaSemanaBrt = ((agora.getUTCDay() + 6) % 7) + 1; // 1=seg, 7=dom

  const dentroJanelaHorario =
    horaBrt >= campanha.horario_inicio_brt && horaBrt < campanha.horario_fim_brt;
  const dentroDiaSemana = campanha.dias_semana.includes(diaSemanaBrt);

  if (!dentroJanelaHorario || !dentroDiaSemana) {
    console.log(`[disparo-processor] Skip ${campanha.nome}: fora janela ${campanha.horario_inicio_brt}h-${campanha.horario_fim_brt}h ou dia ${diaSemanaBrt} não em [${campanha.dias_semana}]`);
    return new Response(JSON.stringify({ skipped: 'fora_janela_horario' }), { status: 200 });
  }
}
```

### UI — onde aparece

1. **Wizard** (`NovaCampanhaProspeccaoDialog.tsx`): adicionar Bloco "Janela de disparo" com:
   - Toggle "Respeitar horário inteligente" (default ON)
   - Sliders ou inputs: `horario_inicio_brt`, `horario_fim_brt`
   - Checkboxes dias da semana
2. **Tela detalhe da campanha** (acessar campanha existente): mesma UI editável

Componente reutilizável: `src/components/campanhas/JanelaHorarioConfig.tsx` (recebe estado + onChange, sem lógica de submit).

### Defaults aplicados

- `horario_inicio_brt = 9`, `horario_fim_brt = 18`, `dias_semana = [1,2,3,4,5]` (seg-sex), `horario_inteligente_ativo = true`
- Backfill nas 5 campanhas IA: ativar com defaults acima
- Operador pode mudar individualmente

## 4. Fora de escopo

- **Time zone diferente de BRT** — sistema é Brasil-only por enquanto, assume BRT (UTC-3) fixo. Suporte multi-timezone fica pra v2
- **Feriados nacionais** — não trata feriados. Maikon decide se cria campanha específica desabilitando dia se for Natal/Páscoa/etc
- **Janela em horário diferente por dia da semana** (ex: sábado 9h-12h, segunda 9h-18h) — versão 1 tem janela única
- **Aplicar pra campanhas manuais** (`tipo_envio = 'manual'`) — operadora envia quando quiser. Janela só pra IA
- **Pausar disparos durante 12h-13h (almoço)** — não tem janela com gap interno, contínuo 09-18h
- **Notificar operadora quando campanha pula por janela** — log no console basta
- **Refatorar campo `horario_inteligente` legacy** — mantém boolean por compatibilidade, criar novo `horario_inteligente_ativo` no lugar

## 5. Riscos / pegadinhas / dependências

- **Migration tem que rodar ANTES da edge function** — se atualizar a function antes da migration, ela vai bater em coluna inexistente. Ordem: migration → deploy → ativar `horario_inteligente_ativo` nas campanhas
- **Cron continua chamando processor a cada minuto** — guard precisa retornar 200 (não 500) pra não pollutir logs. E retornar early ANTES de processar bucket de leads
- **BRT fixo** — se servidor estiver em UTC e cliente em outro fuso, o cálculo `horaBrt` precisa estar certo. Validar com timestamp atual em horário-limite (08h59 vs 09h00)
- **Dia da semana em PostgreSQL vs JS** — Postgres: dom=0...sáb=6; JS: dom=0...sáb=6; nosso schema: seg=1...dom=7. Cuidado com off-by-one
- **Campanha existe sem as colunas novas (durante deploy)** — migration tem `DEFAULT` então tabela velha continua válida. Mas Wizard que ainda referencia coluna antiga pode quebrar. Deploy ordenado: migration → wizard atualizado
- **Operadora muda janela mid-campaign** — sem problema, próximo tick do cron já lê novo valor
- **Defaults conservadores** — 09-18h pode parecer apertado. Confirmar com Maikon antes de aplicar backfill

## 6. Plano de Execução — as tarefas

- [ ] **T1 — Migration** `2026MMDD_campanhas_janela_horario.sql` com `ALTER TABLE` adicionando 4 colunas + CHECK constraints. **Aplicar via Management API antes do push** (mesmo padrão dos índices de hot-path)
- [ ] **T2 — Confirmar com Maikon** quais devem ser os defaults (9-18h seg-sex?) ANTES de rodar backfill. Aplicar `UPDATE campanhas SET horario_inteligente_ativo = true, ...` nas 5 IA
- [ ] **T3 — Atualizar `campanha-disparo-processor/index.ts`** com o guard no início. Type-check + deploy via Management API
- [ ] **T4 — Validar** rodando o processor manualmente em 2 momentos: dentro da janela (esperar logar disparo) e fora (esperar logar "skipped:fora_janela_horario")
- [ ] **T5 — Criar componente `JanelaHorarioConfig.tsx`** reutilizável com toggle + 2 inputs horário + 7 checkboxes dia. Storybook? Não, só usar no Wizard
- [ ] **T6 — Integrar componente no `NovaCampanhaProspeccaoDialog.tsx`** — bloco "Janela de disparo" acima do submit. State controlado, submit envia campos novos
- [ ] **T7 — Integrar componente na tela de detalhe da campanha** (editar campanha existente). Salvar via mesma RPC ou PATCH direto
- [ ] **T8 — Documentar em `Sigma-Anti-Ban-Arquitetura`** no Vault que existe agora janela horária por campanha
- [ ] **T9 — Smoke test** — criar campanha-teste com janela 23h-23h59 (fora do horário atual), confirmar que processor pula. Mudar janela pra incluir hora atual, confirmar que dispara

## 7. Critério de pronto

- [ ] Build verde, type-check, migration aplicada
- [ ] Edge function deployada (v+1)
- [ ] 5 campanhas IA ativas têm `horario_inteligente_ativo = true` com janela definida
- [ ] Em 1 ciclo de cron fora da janela (testar madrugada): log mostra "skipped:fora_janela_horario" em todas
- [ ] Em 1 ciclo de cron dentro da janela: log mostra disparo normal
- [ ] Wizard mostra bloco "Janela de disparo" funcional
- [ ] Tela de detalhe da campanha permite editar janela
- [ ] Maikon confirma os defaults aplicados em sprint review
- [ ] PR aprovado por tarefa

## 8. Autonomia e direitos de decisão

- **Operador decide sozinho:** detalhes de UI (slider vs input, layout do bloco); como nomear coluna entre `horario_inteligente_ativo` vs `respeitar_janela`; ordem fina entre T5/T6/T7
- **Volta pro Raul só em:** quando confirmar defaults com Maikon (T2 antes de aplicar backfill); se descobrir que `pre_send_check` ou outro guard já implementa lógica parecida (evitar duplicação)
- **Mergeia:** Raul, ao revisar cada PR
