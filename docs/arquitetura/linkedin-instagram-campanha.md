# LinkedIn e Instagram na campanha (Fase 9 do plano "GSS dono no comando")

Decisões do Raul:
- 12/11/2026: **a conta não é a do Raul.** Quem prospecta é uma pessoa da GSS, que conecta o próprio LinkedIn
  **dentro do Sigma**, com **segurança em primeiro lugar** (proxy dedicado, ritmo humano).
- 13/11/2026: **a Unipile entrou** (app "Pulse ID • Production", API v2). Ela substitui o gateway próprio
  (`linkbound/gateway`) que era o plano B.

## Unipile: o que é e como fala com o Sigma

- API v2: `https://api.unipile.com/v2/`, cabeçalho `X-API-KEY`. Chave no Supabase como `UNIPILE_API_KEY`
  (e `UNIPILE_BASE_URL`); nunca no repositório nem no navegador. Testada em 13/11: `GET /accounts` → 200, 0 contas.
- Cobrança por **conta conectada** (pico do mês), sem custo por chamada. Teste grátis: até 10 contas.
- Canais na mesma API: LinkedIn (clássico, Sales Navigator, Recruiter, Páginas), Instagram, WhatsApp (não oficial),
  Telegram, Gmail/Outlook/IMAP, agenda. No Sigma, o WhatsApp continua na Chakra (API oficial).
- Webhooks: mensagem nova, nova conexão (`new_relation`, chega em até 8 h), mudança de situação da conta
  (`account.status.*`, inclusive erro de proxy), e-mail novo e rastreio de e-mail.

## Como a conta de LinkedIn entra no Sigma (Hosted Auth)

1. Em **Configurações › LinkedIn**, a pessoa da GSS clica em "Conectar meu LinkedIn".
2. A edge `unipile-conectar` pede à Unipile um link de autenticação (`createAuthLink`, validade 10 min) com
   `name` = id do usuário no Sigma, `providers: linkedin`, o proxy da conta e `products: [classic]`
   (Sales Navigator se a GSS assinar).
3. A pessoa é **redirecionada** à página da Unipile e entra com o próprio LinkedIn (senha ou cookies; 2FA e
   confirmação no app são resolvidos lá). **O Sigma nunca vê senha nem cookie.**
4. A Unipile avisa a edge `unipile-webhook` com o `account_id`; o Sigma grava em `linkedin_contas`
   (`gateway_account_id` = `account_id` da Unipile) e a conta aparece "Conectada".
5. "Desconectar" apaga a conta na Unipile (deixa de ser cobrada).

## Segurança (requisitos, não opcionais)

| Risco | Medida |
|---|---|
| LinkedIn ver login de IP estranho | **Proxy próprio por conta** (`custom_proxy`): um IP do Bright Data ISP Brasil (já contratado pela GSS, 20 IPs), nunca compartilhado com outra conta nem com a Evolution. Alternativa: proxy automático da Unipile com `country: BR` e `allow_country_fallback: false` (nunca cai para IP de outro país) |
| Senha ou cookie vazar | Hosted Auth: a credencial fica só na Unipile; o Sigma guarda só o `account_id` |
| Chave da API exposta | Só nas edges (segredo do Supabase); webhook com cabeçalho secreto próprio |
| Ritmo de robô | Rampa: 5 convites/dia na 1ª semana → 15/dia, teto 80/semana (a Unipile aceita até 80-100/dia em conta paga; ficamos bem abaixo); perfis vistos ≤ 50/dia; só em dia útil, 8h-18h de Brasília, intervalos aleatórios |
| Conta restrita sem ninguém saber | Webhook `account.status.*` ou erro 429/500/422 `cannot_resend_yet` **pausa a conta** e manda e-mail ao responsável; volta só manual |
| Conta nova ou fraca | Conta com < 150 conexões entrega mal convite (aviso da Unipile): começar pela conta mais antiga e ativa da GSS |

## O que a Unipile permite (e o que vale para a GSS)

**LinkedIn**
| Recurso | Uso no Sigma | Prioridade |
|---|---|---|
| Ver perfil por URL ou id (`getProfileByIdentifier`): cargo, formação, cidade, grau de conexão | Achar e confirmar o perfil do médico do lead; preencher `linkedin_url` | Alta |
| Busca de pessoas (filtros ou URL de busca colada; 1.000 resultados por busca, 2.500 no Sales Navigator) | Lista de médicos por especialidade e cidade que não estão na base do CFM com telefone | Média |
| Convite com nota (até 300 caracteres em conta paga; conta grátis: ~5 notas/mês) | Toque "conexão" da campanha | Alta |
| Mensagem para conexão / InMail (créditos do plano; InMail grátis para perfil aberto) | Toque "mensagem" depois do aceite | Alta |
| Nova conexão (webhook `new_relation`) e lista de convites enviados | Avança o lead no funil quando aceita | Alta |
| Caixa de mensagens sincronizada + webhook de mensagem nova | Resposta do médico entra nas **Conversas** do Sigma, junto do WhatsApp | Alta |
| Curtir/comentar post, ver posts do perfil | Aquecimento antes do convite ("toque leve") | Baixa |
| Publicar post / página da empresa | Conteúdo da GSS (marca), fora da campanha | Fora do escopo |
| Vagas (publicar vaga, ver candidatos e currículo) | Divulgar plantão como vaga e receber candidatos | Avaliar depois |

**Instagram** (login com usuário e senha, pela Unipile; não é a API oficial da Meta)
- DM para quem ainda não conversou, seguir, curtir, comentar, ver posts, publicar post e story.
- Limite recomendado: **100 ações/dia e 10/hora** por conta; a Unipile relata aviso "comportamento automatizado"
  da Instagram sem bloqueio, mas o risco é da conta.
- Muda a decisão de 12/11 ("Instagram só assistido"): dá para automatizar DM. **Recomendação:** começar
  assistido (o Sigma sugere, a pessoa envia) e só automatizar depois de semanas sem aviso.

**E-mail** (Gmail/Outlook da equipe): enviar com rastreio de abertura e clique e receber respostas, para o
4º canal do cerco (visão multicanal do Maikon). Fica para depois do LinkedIn.

## O que entra no Sigma (Fase 9)

- **9.1 Modelo (feito, 12/11):** `leads.linkedin_url`, `leads.instagram_handle`, `campanhas.canais`,
  `campanha_toques`, `linkedin_contas` — sem sessão.
- **9.2 Conectar conta:** tela "Conectar meu LinkedIn" + edges `unipile-conectar` e `unipile-webhook`
  (conta conectada, situação, mensagem nova, nova conexão).
- **9.3 Achar perfil (feito, 13/11):** edge `redes-sociais-buscar` ({lead_id} ou {campanha_id, limite}; lote roda em
  segundo plano). Busca "nome + especialidade + cidade" para LinkedIn e Instagram na Serper (Google), na Brave ou no
  SearXNG da VPS (`vps/sigma-searxng/`), nessa ordem; o Gemini escolhe só entre os resultados (não inventa URL) e dá
  nota 0-100; com conta da Unipile conectada, lê o perfil e confere sobrenome/CRM. Grava `linkedin_url` /
  `instagram_handle` com nota ≥ 70 e nunca sobrescreve o que a equipe cadastrou; abaixo disso fica em
  `leads.redes_candidatos` para a pessoa confirmar. Teste 13/11: 9 pediatras em 20 s, 4 Instagram e 1 LinkedIn achados.
- **9.4 Fila do dia e motor:** sugestões com texto pronto; com conta conectada, o Sigma envia convite e
  mensagem no ritmo da rampa (modo automático); sem conta, modo assistido.
- **9.5 Kanban e Conversas:** card com o estado de cada canal; respostas do LinkedIn nas Conversas, e a IA
  pode responder com a mesma persona do Maikon.

## Ordem

1. 9.2 com a primeira conta da GSS (proxy BR dedicado) e uma semana só lendo (perfis, caixa de mensagens).
2. 9.3 + 9.4 assistido; depois automático com a rampa.
3. 9.5; Instagram assistido pela mesma conexão; e-mail por último.

## Em aberto (Raul decide)

- Quem da GSS conecta o LinkedIn primeiro (conta antiga, com bastante conexão, de preferência com Premium ou Sales Navigator).
- Proxy: IP próprio do Bright Data (mais controle) ou proxy automático BR da Unipile (menos trabalho).
- Instagram: começar assistido ou já automático.
- Assinatura da Unipile: o teste grátis trava a API no fim; assinar antes de pôr conta em produção.
