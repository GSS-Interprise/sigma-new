# Plano Mestre v2 — Máquina de Prospecção GSS
**Atualizado:** 2026-04-21 (v2 — arquitetura de 4 trilhas)
**Supersedes:** v1 (5 fases sequenciais)

Este documento é a referência canônica pra execução. Sempre que uma decisão de escopo/arquitetura for tomada, atualize aqui.

---

## TL;DR v2

Quatro trilhas de trabalho, algumas paralelas. A Trilha B (Perfil Unificado) é a nova — antecipa Bloco 3 e serve de base pras outras.

| Trilha | Foco | Esforço | Depende de |
|---|---|---|---|
| **A — Fundação de confiança** | LGPD + blacklist + classificações + chip filter | 8h | nada |
| **B — Perfil Unificado do Lead** | Contatos N:1 + interesses + timeline + extrator IA | 20h | A.3, A.5 (campos novos) |
| **C — Cadência multi-canal** | Schema + cron + email + UI editor | 14h | B.3 (timeline) |
| **D — Urgência + IA refinada** | War room + prompt v7 + Q&A handoff + fallback | 21h | B, C |

**Total: 63h**. Pode rodar em paralelo (2-3 desenvolvedores) ou sequencial (1 dev ~2.5 sprints).

**Ordem sequencial sugerida:** A (8h) → B.1+B.2+B.3 (7h, migrations) → C (14h) → B.4+B.5+B.6 (13h, extrator+UI) → D (21h).
Isso destrava tudo o quanto antes.

---

## Princípios

1. **Robustez antes de features novas.** LGPD + blacklist = blocker de produção.
2. **Reaproveitar infra existente.** 5.092 leads mergeados, `whatsapp_phones[]` e `emails_adicionais[]` criados mas subutilizados, `banco_interesse_leads` esqueleto existe, `lead_historico` já logga touchpoints. Não duplicar.
3. **Cadência é dado, não código.** Templates editáveis pela Bruna.
4. **Opt-out é sagrado.** Detecção automática. Uma vez = permanente.
5. **Pool > volume.** 200 aquecidos > 1000 frios.
6. **Identidade unificada do lead.** 1 lead = N contatos (WA, email, fone) = 1 timeline = 1 perfil extraído. **Esse é o princípio central da v2.**
7. **Anti-stalking interno.** Lead em cadência ativa **não entra** em 2 campanhas ao mesmo tempo.
8. **Soft launch por trilha.** Cada trilha encerra com teste em campanha real pequena antes de escalar.

---

## TRILHA A — Fundação de confiança (8h)

**Bloqueante pra tudo o mais ir pra produção.** Sem isso tem risco jurídico (LGPD) e risco operacional (disparo pra bloqueados).

### A.1 — Blacklist no **selector**, não no disparo (30min) 🔴
**Decisão de arquitetura (21/04):** filtro é na fonte — RPC `selecionar_leads_campanha`. Menos código, impossible de furar.

- Modificar RPC pra `NOT IN (SELECT phone_e164 FROM blacklist)` + `leads.opt_out = false` + `leads.classificacao NOT IN ('protegido', 'proibido')`
- **Trigger** `trg_blacklist_retroativo`: ao INSERT em `blacklist`, marca todos `campanha_leads` do lead como `descartado` + `erro_envio='blacklist_retroativo'` + **pausa** qualquer cadência
- Teste: adicionar lead teste em blacklist → confirmar que RPC não retorna mais + campanhas existentes param

### A.2 — Opt-out detection no bridge (2h) 🔴
- Regex no Parsear do bridge N8N ANTES de enfileirar:
  ```
  /\b(parar|pare|para de mandar|remov(a|er|e)|me tira|me retira|
  n[ãa]o quero mais|n[ãa]o me mande|cancelar|descadastrar|
  sair da lista|stop|unsubscribe|chega|deixa pra l[áa]|
  n[ãa]o perturbe|denunciar|procon|reclamar)\b/i
  ```
- Match → 
  1. Insert em `blacklist` com origem='opt_out_whatsapp' + reason=msg
  2. Update `leads.opt_out=true` + campos LGPD
  3. Update `campanha_leads SET status='descartado'` em todas ativas
  4. Insert `lead_historico` tipo 'opt_out_lgpd'
  5. **NÃO** enfileira — IA não responde. Silêncio respeitoso.
  6. **Envia UMA confirmação obrigatória** ("ok, não te chamo mais. Boa sorte.") — LGPD exige reconhecimento do pedido
- Workflow separado no N8N: `campanha-opt-out-handler` (chamado pelo bridge antes de Insert na fila)

### A.3 — Campos LGPD em leads (1h) 🔴
```sql
ALTER TABLE leads ADD COLUMN consent_registrado_em timestamptz;
ALTER TABLE leads ADD COLUMN consent_fonte text;
ALTER TABLE leads ADD COLUMN opt_out boolean DEFAULT false NOT NULL;
ALTER TABLE leads ADD COLUMN opt_out_em timestamptz;
ALTER TABLE leads ADD COLUMN opt_out_motivo text;
ALTER TABLE leads ADD COLUMN opt_out_canal text;

CREATE INDEX idx_leads_opt_out ON leads(opt_out) WHERE opt_out = true;

-- Retroativo pros existentes (consent via import original)
UPDATE leads 
  SET consent_registrado_em = created_at,
      consent_fonte = 'import_lote_original'
  WHERE consent_registrado_em IS NULL;
```

### A.4 — Fix chip filter no dialog (15min) 🟡
`NovaCampanhaProspeccaoDialog` query:
```ts
.from("chips")
.select("id, nome, numero, status, pode_disparar, tipo_instancia")
.eq("status", "ativo")
.eq("tipo_instancia", "disparos")
.eq("pode_disparar", true)
```

### A.5 — Classificações paralelas (1h) 🟡
```sql
ALTER TABLE leads ADD COLUMN classificacao text DEFAULT 'normal' NOT NULL
  CHECK (classificacao IN ('normal','vip','protegido','proibido'));
ALTER TABLE leads ADD COLUMN cooldown_ate timestamptz;
ALTER TABLE leads ADD COLUMN classificacao_motivo text;
ALTER TABLE leads ADD COLUMN classificacao_em timestamptz;
ALTER TABLE leads ADD COLUMN classificacao_por uuid REFERENCES auth.users(id);

CREATE INDEX idx_leads_classificacao ON leads(classificacao) WHERE classificacao != 'normal';
CREATE INDEX idx_leads_cooldown ON leads(cooldown_ate) WHERE cooldown_ate > NOW();
```

### A.6 — Logs LGPD automáticos (1.5h) 🟢
- Trigger `trg_leads_classificacao_log` — toda mudança em `classificacao`/`opt_out`/`cooldown_ate` vira linha em `lead_historico`
- Retenção 5 anos via job archive (fora escopo V1, documentar)

### A.7 — UI LGPD no card do lead (1.5h) 🟢
- Badge vermelho "OPT-OUT" se `opt_out=true`
- Badge colorido por `classificacao` (vip=dourado, protegido=verde, proibido=vermelho)
- Select rápido de classificação (com motivo obrigatório)
- Campo cooldown_ate editável (date picker)
- Seção timeline LGPD (filtro em lead_historico por tipos LGPD)

### Teste final Trilha A (30min)
Checklist:
- [ ] Criar campanha com especialidade onde há lead em blacklist → não deve aparecer
- [ ] Mandar msg "não me manda mais" do chip teste → lead vai pra blacklist + campanhas pausam + confirmação única é enviada
- [ ] Marcar lead como "protegido" → não aparece em nova campanha

---

## TRILHA B — Perfil Unificado do Lead (20h)

**Coração novo do sistema.** Antecipa Bloco 3. Transforma leads de "registro" em "identidade com histórico consolidado".

### B.1 — Expandir `banco_interesse_leads` (2h)
```sql
ALTER TABLE banco_interesse_leads 
  ADD COLUMN tipo_contratacao_preferida text[],
  ADD COLUMN modalidade_preferida text[],        -- plantao, producao, rotina, sobreaviso
  ADD COLUMN valor_minimo_aceitavel numeric(10,2),
  ADD COLUMN valor_minimo_unidade text,          -- plantao, hora, mes
  ADD COLUMN especialidades_interesse uuid[],    -- FK implicita pra especialidades
  ADD COLUMN dias_preferidos text[],             -- seg, ter, ..., fds
  ADD COLUMN periodo_preferido text,             -- diurno, noturno, 12h, 24h, flex
  ADD COLUMN disponibilidade_plantoes_mes int,
  ADD COLUMN observacoes_ia text,                -- resumo em texto livre gerado pela IA
  ADD COLUMN ultima_extracao_em timestamptz,
  ADD COLUMN extracao_fonte text,                -- ia_auto, import, manual
  ADD COLUMN confianca_score int;                -- 0-100 (quão certa a IA tá)

ALTER TABLE banco_interesse_leads 
  ADD CONSTRAINT uq_banco_interesse_lead UNIQUE (lead_id);

CREATE INDEX idx_banco_interesse_modalidade ON banco_interesse_leads USING GIN (modalidade_preferida);
CREATE INDEX idx_banco_interesse_especialidades ON banco_interesse_leads USING GIN (especialidades_interesse);
```

### B.2 — Tabela `lead_contatos` (3h)
```sql
CREATE TABLE lead_contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('whatsapp', 'email', 'telefone_fixo', 'linkedin', 'instagram')),
  valor text NOT NULL,                  -- phone_e164 normalizado ou email
  is_primary boolean DEFAULT false,
  verified boolean DEFAULT false,
  ativo boolean DEFAULT true,           -- false = não usar pra disparo
  instance_detectada text,              -- chip/instância que primeiro detectou este contato
  origem text,                          -- import_inicial, webhook_auto, manual
  primeiro_contato_em timestamptz,
  ultimo_contato_em timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (tipo, valor)                  -- mesmo contato não duplica entre leads
);

CREATE INDEX idx_lead_contatos_lead ON lead_contatos(lead_id);
CREATE INDEX idx_lead_contatos_valor ON lead_contatos(valor) WHERE ativo = true;
CREATE INDEX idx_lead_contatos_primary ON lead_contatos(lead_id, tipo) WHERE is_primary = true;

-- Migração: copiar de leads.whatsapp_phones[] + leads.phone_e164
INSERT INTO lead_contatos (lead_id, tipo, valor, is_primary, ativo, origem, primeiro_contato_em)
SELECT id, 'whatsapp', phone_e164, true, true, 'migracao_lote', created_at
FROM leads WHERE phone_e164 IS NOT NULL AND phone_e164 <> '';

INSERT INTO lead_contatos (lead_id, tipo, valor, ativo, origem)
SELECT l.id, 'whatsapp', p, true, 'migracao_lote'
FROM leads l, LATERAL unnest(l.whatsapp_phones) AS p
WHERE p IS NOT NULL AND p <> l.phone_e164
ON CONFLICT (tipo, valor) DO NOTHING;

-- Similar pra email e emails_adicionais
INSERT INTO lead_contatos (lead_id, tipo, valor, is_primary, ativo, origem, primeiro_contato_em)
SELECT id, 'email', email, true, true, 'migracao_lote', created_at
FROM leads WHERE email IS NOT NULL AND email <> '';

INSERT INTO lead_contatos (lead_id, tipo, valor, ativo, origem)
SELECT l.id, 'email', e, true, 'migracao_lote'
FROM leads l, LATERAL unnest(l.emails_adicionais) AS e
WHERE e IS NOT NULL AND e <> l.email
ON CONFLICT (tipo, valor) DO NOTHING;
```

**Trigger pra vincular msg de número desconhecido (fuzzy match):**
- Quando Bridge recebe msg de `+55479xxx` que não existe em `lead_contatos`
- Roda `find_lead_by_fuzzy_phone(phone)` que faz:
  - Busca exata last 8 digits
  - Se 1 match único → adiciona como contato novo do lead existente
  - Se 0 ou múltiplos → cria lead novo (comportamento atual)

Edge function `lead-contato-vincular` com essa lógica, chamada pelo bridge.

### B.3 — View `vw_lead_timeline` (2h)
```sql
CREATE OR REPLACE VIEW vw_lead_timeline AS
-- Touchpoints do lead_historico
SELECT 
  lh.lead_id,
  lh.created_at AS ts,
  'historico' AS origem,
  lh.tipo_evento AS tipo,
  'sistema' AS operador,
  NULL AS canal,
  COALESCE(lh.descricao_resumida, '') AS conteudo,
  lh.metadados
FROM lead_historico lh

UNION ALL

-- Mensagens em conversas de campanha (IA)
SELECT 
  cl.lead_id,
  (msg->>'ts')::timestamptz AS ts,
  'campanha_ia' AS origem,
  'mensagem' AS tipo,
  CASE WHEN msg->>'role' = 'medico' THEN 'lead' 
       WHEN msg->>'role' = 'gss' THEN 'ia' 
       ELSE 'humano' END AS operador,
  'whatsapp' AS canal,
  msg->>'text' AS conteudo,
  jsonb_build_object('campanha_id', cl.campanha_id, 'campanha_lead_id', cl.id) AS metadados
FROM campanha_leads cl,
  LATERAL jsonb_array_elements(COALESCE(cl.historico_conversa, '[]'::jsonb)) AS msg

UNION ALL

-- Mensagens de chat manual (conversations)
SELECT 
  m.lead_id,
  m.created_at AS ts,
  'conversa_manual' AS origem,
  'mensagem' AS tipo,
  CASE WHEN m.direction = 'inbound' THEN 'lead' ELSE 'humano' END AS operador,
  COALESCE(m.channel, 'whatsapp') AS canal,
  COALESCE(m.content, '') AS conteudo,
  jsonb_build_object('conversation_id', m.conversation_id) AS metadados
FROM messages m
WHERE m.lead_id IS NOT NULL

ORDER BY ts DESC;

GRANT SELECT ON vw_lead_timeline TO authenticated, service_role, anon;
```

(Ajustar conforme nomes reais das tabelas `messages`/`conversations` depois de verificar.)

### B.4 — Edge function `lead-perfil-extrator` (6h)
Roda: (a) após conversa encerrada, (b) sob demanda via botão, (c) nightly batch nos leads com interação recente.

Fluxo:
1. Receber `lead_id`
2. Buscar timeline: `SELECT * FROM vw_lead_timeline WHERE lead_id = $1 ORDER BY ts ASC LIMIT 100`
3. Buscar perfil atual: `SELECT * FROM banco_interesse_leads WHERE lead_id = $1`
4. Prompt Claude/GPT:
   ```
   <contexto>
   Você é analista de dados de recrutamento médico.
   Leia a timeline e extraia interesses estruturados.
   Se o lead já tem perfil salvo, ATUALIZE com info nova — não apague o que foi confirmado antes.
   Se uma info não aparece, deixe null.
   </contexto>
   <timeline>{{timeline_json}}</timeline>
   <perfil_atual>{{perfil_atual_json}}</perfil_atual>
   <saida>
   JSON:
   {
     "tipo_contratacao_preferida": ["pj"|"clt"|"cooperativa"],
     "modalidade_preferida": ["plantao_12h"|"plantao_24h"|"producao"|"rotina"|"sobreaviso"],
     "valor_minimo_aceitavel": number | null,
     "valor_minimo_unidade": "plantao"|"hora"|"mes" | null,
     "especialidades_interesse": [uuid...],
     "dias_preferidos": ["seg"..."dom"|"fds"|"uteis"],
     "periodo_preferido": "diurno"|"noturno"|"flex" | null,
     "disponibilidade_plantoes_mes": number | null,
     "observacoes_ia": "texto em 2-4 linhas resumindo preferências, objeções recorrentes, contexto relevante",
     "confianca_score": 0..100,
     "mudancas_vs_perfil_atual": "texto curto"
   }
   </saida>
   ```
5. UPSERT em `banco_interesse_leads` com `extracao_fonte='ia_auto'` + `ultima_extracao_em=now()`
6. Logar em `lead_historico` tipo='perfil_extraido' com diff

Invocação:
- Manual: botão "re-extrair perfil" na UI
- Auto: trigger quando `campanha_leads.status` muda pra `quente` ou `descartado` (final de conversa)
- Batch: cron semanal processa leads com `vw_lead_timeline` atualizada nos últimos 7 dias

### B.5 — IA consome perfil no prompt (2h)
Modificar `campanha-ia-responder` pra:
1. Buscar `banco_interesse_leads WHERE lead_id = $1`
2. Buscar resumo últimas 20 interações da `vw_lead_timeline` (outras campanhas + manual)
3. Injetar no prompt em 2 seções novas:
   ```
   <perfil_conhecido>
   {modalidade_preferida, valor_minimo, especialidades_interesse, observacoes_ia}
   </perfil_conhecido>
   
   <contexto_cross_canal>
   Este lead já teve interações em outros canais/campanhas:
   {timeline resumida dos últimos 20 eventos}
   Use esse contexto pra não repetir perguntas já respondidas em outro lugar.
   </contexto_cross_canal>
   ```
4. Regra: se lead tem `modalidade_preferida=["producao"]` e essa campanha é de `plantao_12h`, IA deve reconhecer: "sei que tu prefere produção, mas surgiu essa de plantão que pode encaixar — quer ver?"

### B.6 — UI card do lead enriquecido (5h)
Seções novas no detalhe do lead:
- **Perfil Extraído** (banco_interesse_leads)
  - Modalidade preferida (chips clicáveis)
  - Valor mínimo aceitável + unidade
  - Especialidades de interesse
  - Disponibilidade
  - Observações IA (markdown)
  - Badge "Extraído em X por IA (confiança Y%)"
  - Botão "Re-extrair agora"
- **Contatos** (lead_contatos)
  - Tabela: tipo, valor, primary?, ativo?, última interação
  - Botão adicionar contato
  - Toggle "pode disparar" por contato
- **Timeline Unificada** (vw_lead_timeline)
  - Filtros: canal, operador, origem
  - Cards agrupados por dia
  - Destaque pra interações manuais ("Bruna conversou por WhatsApp")

### Teste final Trilha B (1h)
Checklist:
- [ ] Extrator roda em lead teste → perfil preenchido
- [ ] IA consulta perfil em próxima msg → resposta usa o conhecimento
- [ ] Msg de número novo é vinculada ao lead existente via fuzzy match
- [ ] Timeline mostra IA + manual + campanha numa view só

---

## TRILHA C — Cadência multi-canal automática (14h)

Segue v1. **Mudança importante:** C.1 (schema) inclui FK pra consulta de timeline B.3 pra anti-stalking.

### C.1 — Schema cadência (2h)
```sql
CREATE TABLE cadencia_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE cadencia_passos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES cadencia_templates(id) ON DELETE CASCADE,
  ordem smallint NOT NULL,
  dia_offset smallint NOT NULL,          -- D+0, D+2...
  canal text NOT NULL,                   -- whatsapp, whatsapp_audio, call, email, sms
  mensagem_template text,                -- com {{nome}}, {{cidade}}, spintax
  subject_template text,                 -- pra email
  objetivo text,
  is_breakup boolean DEFAULT false,
  UNIQUE (template_id, ordem)
);

ALTER TABLE campanhas ADD COLUMN cadencia_template_id uuid REFERENCES cadencia_templates(id);
ALTER TABLE campanhas ADD COLUMN modo_urgente boolean DEFAULT false;

CREATE TABLE campanha_lead_touches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_lead_id uuid NOT NULL REFERENCES campanha_leads(id) ON DELETE CASCADE,
  passo_id uuid REFERENCES cadencia_passos(id),
  canal text NOT NULL,
  contato_usado_id uuid REFERENCES lead_contatos(id),  -- qual WhatsApp/email foi usado
  chip_usado_id uuid REFERENCES chips(id),
  executado_em timestamptz,
  resultado text,                        -- enviado, erro_chip, bounce, abriu, respondeu, ignorou
  conteudo_enviado text,
  erro_detalhe text,
  UNIQUE (campanha_lead_id, passo_id)
);

ALTER TABLE campanha_leads 
  ADD COLUMN proximo_touch_em timestamptz,
  ADD COLUMN proximo_passo_id uuid REFERENCES cadencia_passos(id);

-- Anti-stalking: lead não pode estar em 2 campanhas ativas com cadência rodando
CREATE UNIQUE INDEX uq_lead_campanha_ativa 
  ON campanha_leads(lead_id) 
  WHERE status IN ('contatado', 'em_conversa', 'aquecido', 'quente');
```

### C.2 — Seed templates (30min)
1. "GSS Padrão 14d" — 6 touches da pesquisa §3
2. "GSS Urgente 48h" — 7 touches da pesquisa §4

### C.3 — Edge function `campanha-cadencia-processor` (4h)
### C.4 — Integração email com Resend (3h)
### C.5 — Cron N8N 1x/dia (1h)
### C.6 — UI editor de cadência (3h)
### C.7 — Indicadores no kanban (30min)

### Teste final Trilha C (1h)
- Campanha com 3 leads → cadência completa roda sem drops, respeita respostas

---

## TRILHA D — Urgência + IA refinada (21h)

### D.1 — Flag modo_urgente + cadência urgente (1h)
### D.2 — War room dashboard (4h)
### D.3 — Pool aquecido view (2h)
### D.4 — Prompt v7 (3h)
### D.5 — Q&A handoff humano (6h)
### D.6 — Fallback chip IA (2h)
### D.7 — Healthcheck chip via pg_cron (2h)
### D.8 — Telemetria naturalidade (1h)

---

## Decisões abertas (precisam de aprovação Raul antes de entrar em Trilha C/D)

| # | Decisão | Opções | Recomendação | Quem aprova |
|---|---|---|---|---|
| 1 | Provider email | Resend / SendGrid / Gmail SMTP | **Resend** | Raul |
| 2 | Opt-out imediato | Sim / Confirma 1x | **Imediato** + uma confirmação obrigatória (LGPD) | Raul |
| 3 | Abrir faixa valor WhatsApp | Por campanha (flag) | **Por campanha, default aberto** | Ramone |
| 4 | Score automático | Auto / Manual / Híbrido | **Auto + override manual** | Raul |
| 5 | Re-engajamento | Nova campanha / Reutilizar | **Nova** (métricas isoladas) | Raul |
| 6 | Healthcheck chip | N8N / pg_cron | **pg_cron** | Raul |
| 7 | Extrator IA: modelo | Claude 3.5 / GPT-4o | **GPT-4o-mini** (custo/qualidade) | Raul |

---

## Fora de escopo desta iteração

- ❌ Aprovação Maicon/jurídico antes de convertido
- ❌ "Tela única" revisando módulos do Ewerton
- ❌ "Campanha manual" Kanban sem IA
- ❌ Parceria cross-agência
- ❌ SMS como canal próprio
- ❌ Ligação automatizada (fica como task humana)
- ❌ VoIP

---

## Estratégia de testing & rollout

Cada trilha encerra com **soft launch**:

- **Trilha A:** campanha TESTE (já existe) com leads Ramone+Maikon — smoke test de filtros. Ramone valida.
- **Trilha B:** 1 lead real com histórico (ex: um quente que já fechou antes) → extrator roda → UI mostra → IA responde nova msg usando o perfil.
- **Trilha C:** 1 campanha pequena (Braço do Norte conforme sugestão Ramone) com ~20 leads → cadência completa 14d → medir taxa de resposta vs baseline. Só depois escala.
- **Trilha D:** prompt v7 primeiro em sandbox (Ramone/Maikon como leads) antes de ligar em campanha real.

**Go/no-go** após cada soft launch. Se taxa cair → rollback + ajuste.

---

## Permissões (RBAC)

| Ação | Quem pode |
|---|---|
| Criar campanha normal | `captacao:criar_campanha` (hoje: Bruna) |
| Criar campanha **urgente** | `captacao:campanha_urgente` (hoje: só Ramone/Maikon) |
| Ver war room | `captacao:war_room` (mesmos) |
| Editar cadência custom | `captacao:editar_cadencia` (hoje: só admin) |
| Marcar lead protegido/proibido | `captacao:classificar_lead` (hoje: só admin) |
| Ver dados LGPD detalhados | `admin:lgpd_full` |
| Executar opt-out manual | `captacao:opt_out_manual` (geral) |
| Re-extrair perfil lead (Trilha B) | `captacao:usar_campanha` (geral) |

Migrar `captacao_permissions` pra incluir esses itens conforme for implementando.

---

## Métricas de sucesso (1-2 sprints pós-deploy)

1. **Zero lead blacklist recebe msg** (auditoria pós-Trilha A)
2. **Taxa opt-out detectado auto ≥ 95%** (vs 0% hoje)
3. **Touches médios até handoff ≥ 5** (vs 1-2 atual)
4. **Taxa quentes/disparo ≥ 5%**
5. **Vagas urgentes < 48h** via pool aquecido
6. **LGPD: zero incidentes** em auditoria ANPD simulada
7. **IA consulta perfil em 80%+ das msgs** (trilha B validando)
8. **Tempo médio entre `campanha_lead` e `quente` cai 30%** (devido a IA saber o que o lead quer)

---

## Changelog

- **v2 (2026-04-21):** Reorganização em 4 trilhas. Trilha B (Perfil Unificado) adicionada antecipando Bloco 3. Blacklist movida pro selector (não disparo). Testing strategy e permissões explícitas.
- **v1 (2026-04-20):** 5 fases sequenciais. Deprecated.
