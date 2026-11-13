# LinkedIn e Instagram na campanha (Fase 9 do plano "GSS dono no comando")

Decisões do Raul (12/11/2026):
- **Sem Unipile por enquanto.** O motor de LinkedIn é o gateway próprio (`linkbound/gateway`, mesmo contrato da API
  Unipile, em uso no Linkbound desde 17/10). Trocar pela Unipile depois = trocar URL e chave.
- **A conta não é a do Raul.** Quem prospecta é uma pessoa da GSS, que conecta o próprio LinkedIn **dentro do Sigma**.
- **Segurança em primeiro lugar** (proxy dedicado, sessão cifrada, ritmo humano).
- Instagram: a Meta não deixa puxar conversa por API → **modo assistido** (o Sigma sugere, a pessoa executa no app).
  A Zernio (Inbox Social do Maikonect) entra depois só para trazer as respostas às Conversas.

## Como a conta de LinkedIn entra no Sigma

1. Em **Configurações › LinkedIn**, a pessoa da GSS clica em "Conectar meu LinkedIn".
2. A tela guia a captura da sessão do navegador onde ela já está logada: `li_at`, `JSESSIONID` e user-agent
   (versão 2: extensão "Conectar ao Sigma" que lê e envia sozinha, sem copiar segredo à mão).
3. O Sigma manda direto para o gateway (edge `linkedin-conectar`, nunca grava a sessão no banco do Sigma).
4. O gateway testa `/me` **pelo proxy reservado para aquela conta**, cifra e guarda; devolve só o id da conta.
5. A conta aparece como "Conectada" com o nome do perfil; "Desconectar" apaga a sessão no gateway.

## Segurança (requisitos, não opcionais)

| Risco | Medida |
|---|---|
| LinkedIn ver login de IP estranho e bloquear | **Um IP fixo por conta** (Bright Data ISP Brasil, já contratado pela GSS; 20 IPs), na região da pessoa, nunca compartilhado entre contas nem com a Evolution |
| Sessão vazar | Cifrada em repouso (AES-256-GCM, chave só no `.env` do gateway); nunca volta ao navegador nem ao banco do Sigma; arquivo temporário apagado na hora |
| Gateway exposto | Roda na **VPS da GSS** (não na da Pulse), atrás do Traefik, só aceita chamadas com a chave do Sigma; sem porta pública além da rota |
| Ritmo de robô | Rampa: 5 convites/dia na 1ª semana → 15/dia, teto 80/semana; só em horário comercial de Brasília; pausas aleatórias; mensagens espaçadas |
| Conta restrita sem ninguém saber | Qualquer 429, checkpoint ou "restricted" **pausa a conta** e manda e-mail ao responsável; volta só manual |
| Sessão cair por troca de navegador | O user-agent salvo tem de bater com o navegador real; o Sigma avisa "reconectar" quando o `/me` falhar |
| Auditoria | Toda ação (busca de perfil, convite, mensagem) fica registrada com quem, quando e o retorno |

## O que entra no Sigma (Fase 9)

- **9.1 Modelo:** `leads.linkedin_url`, `leads.instagram_handle`; `campanhas.canais text[]`;
  `campanha_toques` (cada ação por canal: sugerido, feito, respondido, falhou); `linkedin_contas` (pessoa, id no
  gateway, situação, IP reservado, ritmo do dia) — sem sessão.
- **9.2 Kanban:** o card mostra o estado de cada canal (cinza não tentado, azul enviado, verde respondeu).
- **9.3 Fila do dia:** sugestões com perfil e texto pronto. LinkedIn: automático pelo gateway quando houver conta
  conectada, assistido enquanto não houver. Instagram: sempre assistido.
- **Busca de perfil:** `find_person` do gateway (nome + especialidade + cidade → perfil com nota 0-100); abaixo de 70
  vai para a pessoa confirmar.

## Ordem

1. 9.1 + 9.2 + 9.3 em modo assistido (não dependem do gateway).
2. Gateway na VPS da GSS com o primeiro IP reservado; tela "Conectar meu LinkedIn".
3. Primeira conta da GSS conectada, uma semana de rampa, depois automático.

## Em aberto (Raul decide)

- Quem da GSS conecta o LinkedIn primeiro.
- Se o gateway roda na VPS da GSS (recomendado) ou na da Pulse.
