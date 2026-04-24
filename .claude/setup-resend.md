# Setup Resend — Email automatizado das campanhas

Passo a passo pra ativar o envio de email quando tiver a conta Resend.

---

## O que já está pronto

- ✅ Edge function `campanha-email-sender` deployada (em produção com fallback gracioso)
- ✅ 4 entradas em `config_lista_items`:
  - `resend_api_key` (vazio — precisa preencher)
  - `resend_from_email` = `contato@gestaoservicosaude.com.br`
  - `resend_from_name` = `GSS Saúde`
  - `resend_reply_to` = `contato@gestaoservicosaude.com.br`
- ✅ Log automático em `lead_historico` tipo `email_enviado`
- ✅ Footer de opt-out LGPD obrigatório adicionado automaticamente

---

## Setup (quando abrir a conta Resend)

### 1. Criar conta
https://resend.com/signup — grátis até 3.000 emails/mês (100/dia)

### 2. Verificar domínio (3 min)
No painel Resend:
- **Domains → Add Domain** → `gestaoservicosaude.com.br` (ou subdomínio como `mail.gestaoservicosaude.com.br`)
- Copia os 3 registros DNS que o Resend mostra (SPF, DKIM, DMARC)
- Cola no painel DNS do domínio da GSS
- Clica em **Verify** (demora 5-30 min pros registros propagarem)
- Quando ficar **verified**, pode enviar

### 3. Gerar API key
- **API Keys → Create API Key**
- Nome: `GSS Prod Campanhas`
- Permission: **Full access** (ou só Send — mais seguro)
- Copia a key (só aparece uma vez, salva em local seguro)

### 4. Ativar no Sigma
Rodar no Supabase SQL Editor (ou via curl):

```sql
UPDATE config_lista_items 
SET valor = 're_XXXXXXXXXXXXXXXXXXXXXXXXXXX'  -- cola a key aqui
WHERE campo_nome = 'resend_api_key';
```

(Se quiser mudar o from_email/from_name pra algo específico, mesma lógica.)

### 5. Teste
Chamar a edge function direto:

```bash
curl -X POST "https://zupsbgtoeoixfokzkjro.functions.supabase.co/campanha-email-sender" \
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "seu.email.teste@gmail.com",
    "subject": "Teste Sigma/GSS",
    "text": "Se você recebeu isso, Resend está funcionando.",
    "html": "<p>Se você recebeu isso, <b>Resend está funcionando</b>.</p>"
  }'
```

Resposta esperada: `{"ok":true,"message_id":"xxx","to":"..."}`.

Se deu certo, você recebe o email com o footer de opt-out LGPD automaticamente adicionado.

---

## API de uso (pra cadência Trilha C)

**Endpoint:** `POST /functions/v1/campanha-email-sender`

**Payload:**
```json
{
  "to": "medico@exemplo.com",
  "subject": "Vaga UTI Pediátrica Chapecó/SC",
  "html": "<p>...</p>",
  "text": "...",
  "lead_id": "uuid",
  "campanha_id": "uuid",
  "campanha_lead_id": "uuid",
  "template_id": "t4_email_detalhe",
  "reply_to": "opcional-override",
  "tags": { "touch": "t4", "campanha": "pediatria-chapeco" }
}
```

**Respostas:**
- `200 {ok:true, message_id}` — enviado com sucesso
- `500 {ok:false, error}` — falha (já loga em lead_historico se tem lead_id)
- `503 {ok:false, error:"Resend não configurado"}` — API key ainda não setada

---

## Dicas

- **Warmup:** mandar primeiros 50-100 emails pra contatos conhecidos antes de escalar. Resend tem score por domínio.
- **Templates:** quando construir a Trilha C, os templates ficam em `cadencia_passos.mensagem_template` + `subject_template`. A edge function só recebe e envia.
- **Anti-spam:** o footer LGPD que a edge function adiciona é obrigatório pra não parar em spam corporativo.
- **Monitoring:** Resend dashboard mostra deliverability rate. Abaixo de 95% = investigar. Se domínio começar a ser rejeitado, rolar subdomínio (tipo `mail2.gestaoservicosaude.com.br`).
- **Custo:** 3k grátis/mês. Plano Pro $20/mês por 50k emails. Pro GSS, com 10 campanhas × 120 leads × 2 touches de email = ~2.4k/mês — cabe no grátis.

---

## Rollback (se precisar)

Pra desligar email sem remover config:
```sql
UPDATE config_lista_items SET valor = '' WHERE campo_nome = 'resend_api_key';
```
Edge function volta pro fallback gracioso, cadência ignora email e segue só com WhatsApp.
