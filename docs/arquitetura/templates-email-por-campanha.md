---
tags: [arquitetura, sigma-gss, prospeccao, urgente]
projeto: SigmaGSS
autor: Raul
data: 2026-05-28
status: rascunho
operador: Raul
repo: GSS-Interprise/sigma-new
---

# Arquitetura de Solução — Templates de email/WhatsApp por campanha

> **O que é:** acabar com o template único "GSS Básico" sendo usado por 3 campanhas de perfis incompatíveis (UTI Pediátrica + Psiquiatria + Telediagnóstico Radiologia). Cada campanha passa a ter o **conteúdo apropriado pro perfil** que ela busca, e o número de WhatsApp deixa de ser hardcoded.
>
> **Origem:** incidente 28/05/2026 — Dr. Mauricio Macagnan, radiologista, respondeu por WhatsApp pessoal do Raul perguntando "pode me explicar melhor" porque recebeu email de UTI Pediátrica completamente fora do perfil dele. Auditoria mostrou ~493 leads das 2 campanhas erradas (Psiquiatria + Telediagnóstico) já receberam o mesmo email.

## 1. O que precisa funcionar (a capacidade)

Cada campanha tem o seu próprio template de cadência com **conteúdo coerente com o perfil do médico** que ela busca, e o **número de WhatsApp do remetente** é configurável por campanha (não mais hardcoded). Quando uma operadora cria uma campanha nova, escolhe (ou clona) um template que combina com o perfil — sem chance de mandar email sobre UTI Pediátrica pra radiologista.

## 2. Estado atual

**Hoje (commit `a06cdf5`):**

- Tabela `cadencia_templates`: 1 registro ativo, `"GSS Básico"` (id `62673f88-77d5-409e-928b-3eceabef9426`)
- Tabela `cadencia_passos`: 3 passos linkados a esse template:
  - ordem 1, canal whatsapp, dia_offset 0, is_inicial=true (mensagem_template e subject_template NULL — disparo inicial é gerado em outro lugar)
  - ordem 2, canal whatsapp, dia_offset 2: `"Oi {{nome}}, sou Dr. Maikon da GSS de novo. Vi que você ainda não tinha respondido sobre a vaga em {{cidade}} — quer que eu te conte mais detalhes do serviço?"`
  - ordem 3, canal email, dia_offset 3, is_breakup=true: `"Olá Dr(a). {{nome}}, Sou o Dr. Maikon Madeira [...] oportunidade de UTI pediátrica em {{cidade}} [...] WhatsApp: (51) 99540-1928. Abraço, Dr. Maikon Madeira, GSS Saúde"`
- Tabela `campanhas` tem coluna `cadencia_template_id` apontando pro template
- **3 campanhas ativas** usavam o `GSS Básico`:
  - Pediatria UTI Chapecó — **perfil correto** (continua ativa)
  - Psiquiatria Extremo Oeste — perfil errado (PAUSADA em 28/05 às 13:24)
  - Telediagnóstico Radiologia — perfil errado (PAUSADA em 28/05 às 13:24)
- **Coluna pra WhatsApp do remetente: NÃO EXISTE** em `campanhas`. Número (51) 99540-1928 está hardcoded no `mensagem_template` do passo 3

**Tamanho do estrago (snapshot 28/05 13:00):**
- Psiquiatria Extremo Oeste: 346 contatados, ~291 já receberam o email errado, 3 quentes
- Telediagnóstico Radiologia: 202 contatados, ~202 já receberam o email errado, 10 quentes

## 3. A solução desenhada

### Mudança 1 — Coluna `whatsapp_remetente` na campanha

```sql
ALTER TABLE campanhas
  ADD COLUMN whatsapp_remetente text NULL,
  ADD COLUMN nome_remetente text NULL DEFAULT 'Equipe GSS';
-- Backfill: pra campanhas que querem manter (51) 99540-1928, set explicito
UPDATE campanhas SET whatsapp_remetente = '(51) 99540-1928', nome_remetente = 'Dr. Maikon Madeira'
  WHERE id = 'f75e8e74-24c7-40e4-9349-772e650818aa';  -- Pediatria UTI Chapecó (única confiável hoje)
```

UI permite editar esses 2 campos. Default ao criar nova campanha: vazio (não obrigatório, mas sem ele a interpolação `{{whatsapp_remetente}}` vira string vazia e a linha some).

### Mudança 2 — Variáveis novas nos templates

Adicionar 3 placeholders interpretados pelo `campanha-disparo-processor` (ou o renderizador de mensagem que existe hoje):

| Placeholder | De onde vem |
|---|---|
| `{{nome}}`, `{{cidade}}` | já existem hoje, do lead |
| `{{whatsapp_remetente}}` | `campanhas.whatsapp_remetente` |
| `{{nome_remetente}}` | `campanhas.nome_remetente` |
| `{{descricao_oportunidade}}` | `campanhas.descricao_oportunidade` (coluna nova) — texto curto que descreve o que a campanha oferece. Ex: "uma vaga de Telediagnóstico em Radiologia, 100% remoto, atendendo 3 hospitais em SC" |
| `{{cidade_oportunidade}}` | `campanhas.regiao_estado` (já existe) ou nova coluna `cidade_principal` |

Coluna nova:
```sql
ALTER TABLE campanhas
  ADD COLUMN descricao_oportunidade text NULL;
```

### Mudança 3 — Template "GSS Básico" reescrito como genérico

Substituir o texto do passo 3 (email) e do passo 2 (WhatsApp reforço) por versões 100% interpoladas:

**Passo 2 (WhatsApp reforço, atual hardcode "Dr. Maikon"):**
```
Oi {{nome}}, {aqui é o|sou} {{nome_remetente}} da GSS de novo. Vi que você 
ainda não tinha respondido sobre {{descricao_oportunidade}} em 
{{cidade_oportunidade}} — quer que eu te conte mais detalhes?
```

**Passo 3 (email breakup):**
- Subject: `Oportunidade em {{cidade_oportunidade}} — {{nome_remetente}} / GSS`
- Body:
```
Olá Dr(a). {{nome}},

Sou {{nome_remetente}}, da equipe GSS Saúde. Como não consegui falar com você 
pelo WhatsApp, estou te escrevendo por aqui.

Estamos com {{descricao_oportunidade}} em {{cidade_oportunidade}} — valores, 
estrutura e condições completas posso compartilhar assim que tivermos um 
papo rápido.

Se tiver interesse, basta responder este email{{#whatsapp_remetente}} ou me 
chamar direto no WhatsApp: {{whatsapp_remetente}}{{/whatsapp_remetente}}.

Abraço,
{{nome_remetente}}
GSS Saúde
```

(A sintaxe `{{#var}}...{{/var}}` é um bloco condicional Mustache-like: se `whatsapp_remetente` vazio, a linha some.)

### Mudança 4 — Clonar template por campanha (curto prazo) OU compartilhar template (longo prazo)

**Curto prazo:** cada campanha tem seu próprio registro em `cadencia_templates` (clone do GSS Básico). Pediatria UTI Chapecó mantém. Psiquiatria e Telediagnóstico recebem clones com `descricao_oportunidade` diferentes:

- Pediatria UTI Chapecó → "uma oportunidade de UTI Pediátrica"
- Psiquiatria Extremo Oeste → "uma oportunidade de atendimento em Psiquiatria"
- Telediagnóstico Radiologia → "uma vaga de Telediagnóstico em Radiologia, 100% remoto"

**Longo prazo:** templates ficam "genéricos" e parametrizados — a maioria das campanhas usa o mesmo template, mudando só os campos da campanha. Decisão arquitetural: postergar essa simplificação até ter 5+ campanhas pra justificar.

### Mudança 5 — UI

Na tela de edição da campanha (ou wizard), adicionar bloco "Identidade do remetente" com:
- Input texto: Nome do remetente (default "Equipe GSS")
- Input telefone formatado: WhatsApp do remetente (opcional)
- Textarea: Descrição da oportunidade (~1 frase)
- Read-only preview de como o email vai sair (renderizar com os valores reais)

### Mudança 6 — Renderizador

Onde quer que esteja a interpolação de `{{nome}}` e `{{cidade}}` (provavelmente edge function `campanha-disparo-processor` ou helper compartilhado), adicionar:
- `{{whatsapp_remetente}}`, `{{nome_remetente}}`, `{{descricao_oportunidade}}`, `{{cidade_oportunidade}}`
- Suporte ao bloco condicional `{{#var}}...{{/var}}`

## 4. Fora de escopo

- **Reenviar email correto pros ~493 leads queimados** — decisão de produto/Maikon. Pode prejudicar reputação ainda mais. **Sugestão:** marcar esses leads como `classificacao = protegido` por 90 dias pra não voltarem em outras campanhas
- **Editor visual de template** (WYSIWYG) — versão 1 é só textarea. Já é melhor que hoje
- **A/B testing de templates** — não tem agora, fica pra v2
- **Templates multi-idioma** — só PT-BR
- **Variáveis dinâmicas baseadas em IA** (ex: "oportunidade que combina com o perfil de {{nome}}") — não tem
- **Histórico de versões do template** — alterações sobrescrevem o registro. Bom o suficiente
- **Sincronização com email_contatos** — separada (ver nota em §5)

## 5. Riscos / pegadinhas / dependências

- **Coluna `email_contatos` está vazia** — sistema NÃO loga emails enviados. Isso é um problema separado mas que aparece junto. Operadora não consegue ver "o que mandamos pro Mauricio". Vira arquitetura separada (`observability-emails-enviados.md`?)
- **Templates novos precisam ser validados antes de despausar** Psiquiatria/Telediagnóstico. Não basta migrar — Maikon precisa ler o conteúdo antes de mandar 200+ leads
- **Pediatria UTI Chapecó está ATIVA agora** com o template antigo (UTI Pediátrica) — perfil correto, mas se a Mudança 3 trocar o passo 3 pra genérico antes da Pediatria ter seu próprio template/campos preenchidos, ela vai mandar email vazio. Ordem: criar clones POR campanha PRIMEIRO, depois mexer no template original
- **Coluna `descricao_oportunidade` em campanha pré-existente é NULL** — backfill é obrigatório. Se for null e template usa `{{descricao_oportunidade}}`, sai literal "{{descricao_oportunidade}}" no email. Renderizador precisa tratar null gracefully (substituir por "uma oportunidade na sua área")
- **Mudança no schema cadencia_passos quebra `vw_acompanhamento_kanban` ou outras views?** Validar antes
- **Lovable rebuild** — frontend muda em §5, então push pra main rebuilda Lovable. Tarefas backend (migration + edge function) podem ir primeiro
- **Quentes do Telediagnóstico (10 leads)** — esses pessoas responderam apesar do email errado. Operadora deve atender PRIMEIRO antes da campanha despausar
- **`{{cidade}}` hoje usa cidade do LEAD, não da CAMPANHA** — Mauricio recebeu "UTI pediátrica em Cruz Alta" porque cidade dele é Cruz Alta. Coluna nova `cidade_oportunidade` (ou `regiao_estado` já existente) precisa ser o destino REAL da vaga

## 6. Plano de Execução — as tarefas

- [ ] **T1 — Migration `campanhas`** com 3 colunas novas: `whatsapp_remetente`, `nome_remetente`, `descricao_oportunidade`. Aplicar via Management API antes do push
- [ ] **T2 — Backfill Pediatria UTI Chapecó** com valores reais (`whatsapp_remetente='(51) 99540-1928'`, `nome_remetente='Dr. Maikon Madeira'`, `descricao_oportunidade='uma oportunidade de UTI Pediátrica'`)
- [ ] **T3 — Clonar `cadencia_templates`** criando 2 novos: "GSS Psiquiatria" e "GSS Telediagnóstico Radiologia". Copiar os 3 passos do template original pra cada um. Apontar `campanhas.cadencia_template_id` das campanhas pausadas pros novos templates
- [ ] **T4 — Reescrever os 3 templates** (GSS Básico, GSS Psiquiatria, GSS Telediagnóstico Radiologia) com a linguagem variável + blocos condicionais (`{{#whatsapp_remetente}}...{{/whatsapp_remetente}}`)
- [ ] **T5 — Preencher `descricao_oportunidade` e `regiao_estado/cidade_oportunidade`** das 2 campanhas pausadas com texto coerente
- [ ] **T6 — Atualizar renderizador** (edge function `campanha-disparo-processor` ou helper compartilhado) pra suportar as 4 novas variáveis + bloco condicional. Type-check + deploy
- [ ] **T7 — Smoke test** rodar `campanha-disparo-processor` manualmente em modo dry-run pra 1 lead de cada campanha. Comparar output esperado vs renderizado
- [ ] **T8 — UI** — Adicionar bloco "Identidade do remetente" no wizard (`NovaCampanhaProspeccaoDialog.tsx`) e na tela de detalhe da campanha. Preview do email renderizado
- [ ] **T9 — Maikon valida** o conteúdo dos 3 templates antes de despausar Psiquiatria + Telediagnóstico
- [ ] **T10 — Marcar leads queimados** com `classificacao='protegido'` por 90 dias (~493 leads). Migration ou UPDATE direto com WHERE explícito
- [ ] **T11 — Despausar Psiquiatria + Telediagnóstico** após T9 aprovado

## 7. Critério de pronto

- [ ] Build verde, type-check, migration aplicada, edge function deployada
- [ ] 3 templates separados em `cadencia_templates` (GSS Básico, GSS Psiquiatria, GSS Telediagnóstico Radiologia)
- [ ] 3 campanhas ativas + pausadas têm seus próprios `whatsapp_remetente`, `nome_remetente`, `descricao_oportunidade` preenchidos
- [ ] Dry-run do renderizador mostra emails coerentes com cada perfil (pediatra recebe UTI Pediátrica, psiquiatra recebe Psiquiatria, radiologista recebe Telediagnóstico)
- [ ] UI da campanha permite editar os 3 campos novos + preview funcional
- [ ] Maikon aprovou os templates novos
- [ ] Psiquiatria + Telediagnóstico despausadas
- [ ] PR aprovado por tarefa

## 8. Autonomia e direitos de decisão

- **Operador decide sozinho:** detalhes de UI (layout dos campos); como nomear colunas exatas (`descricao_oportunidade` vs `oferta_descricao`); ordem fina T6/T7/T8
- **Volta pro Raul só em:** T9 (Maikon precisa aprovar conteúdo); T10 (decisão sobre marcar 493 leads queimados como protegidos); se descobrir que o renderizador atual está em lugar diferente do esperado
- **Mergeia:** Raul, ao revisar cada PR
