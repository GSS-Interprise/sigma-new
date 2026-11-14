# O que falta — mapa geral (13/11/2026)

Um lugar só para o que ainda não está entregue nas frentes da GSS no Sigma. Cada item diz **de quem é o próximo
passo**: *nosso* (a Pulse faz sem depender de ninguém), *GSS* (alguém da GSS decide ou faz) ou *bloqueado* (espera
algo de fora). O detalhe de cada frente fica no doc dela, linkado no título.

## Como testar o que já está pronto

| O quê | Comando | Cobre |
|---|---|---|
| Regras das redes e dos avisos | `cd supabase/functions/_shared && deno test --node-modules-dir=none` (80 testes em 13/11, com os do Heron) | convite (texto e 300 caracteres), rampa do LinkedIn, URL do perfil, confiança mínima, aceite/resposta pela Unipile, @ do Instagram, janela de 24 h, telefone (formatos, estrangeiro, DDD), destinos do aviso, trecho do modelo da Meta, escada do SLA, indicadores das 7h + os testes antigos (Chakra, cadência, NFS-e) |
| Motor de IA na VPS | `python -m unittest vps/sigma-rotinas/test_motor_claude.py` | link do login, motivo do erro, teste só com "OK", token nunca aparece na saída, tipos da fila |
| Banco: criação de campanha | `supabase/tests/campanha_modo_alertas.sql` (deixa nada gravado; espera `TESTE_OK`) | modo IA/equipe, destinos normalizados, padrão sem destinos, só admin pede rotina do motor |
| Banco: escada do SLA | `supabase/tests/sla_escada.sql` (idem) | chave nasce desligada, só quem opera liga, passo 1-4, cron das 7h |
| Escalas e OAuth do MCP dos sócios | mesmo `deno test` acima (`escalas_test.ts` 15, `mcp-oauth_test.ts` 11) | datas do sócio ("amanhã", 5/12, 31/02 inválido), hospital por sigla/trecho/cidade, CRM com ponto, texto da resposta; redirect só do Claude, PKCE S256, registro dinâmico, erros que voltam ou não ao Claude |
| Robô do Dr. Escala na VPS | `python -m unittest vps/sigma-rotinas/test_drescala.py` (14) | furo pela flag ou profissional 0, sem dinheiro no Sigma, janela e plantão repetido na grade, setor desligado não consultado, erro no meio fecha a sync com erro, 429 com espera |
| Banco: escalas e MCP | `supabase/tests/drescala_mcp.sql` (deixa nada gravado; espera `TESTE_OK`) | dia do plantão noturno, local de teste fora da view, remove o que sumiu, sync com erro não apaga, cron 06/12/18h, RLS de quem não é diretoria, hash do token fora do alcance do front |
| OAuth do `sigma-mcp` no ar | `python supabase/tests/sigma_mcp_oauth_e2e.py` (precisa do `SUPABASE_ACCESS_TOKEN` no `.env.local`; apaga o que cria) | 401 com metadados, registro, authorize, troca de código, refresh com rotação, vencido, revoke, código repetido derruba a conexão, auditoria |

O texto do convite e as regras de telefone moram em `supabase/functions/_shared/redes.ts` e `alertas.ts` e são
importados **pela tela e pelas edges**: o que a fila mostra e o que o motor envia não têm como divergir.

## Prospecção do Maikon ([plano](plano-goal-gss-dono-no-comando.md) · [redes](linkedin-instagram-campanha.md))

| Item | De quem | Situação |
|---|---|---|
| Aprovar as 6 simulações da IA e decidir, por campanha, se a IA informa valor (`ia_informa_valor`) | GSS (Maikon) | `output/ia-v11-simulacoes-maikon.md` |
| Confirmar o Instagram respondido de dentro do Sigma, pela conta @maikonmadeira (quem envia a 1ª mensagem: ele ou a secretária) | GSS (Maikon) | fila e respostas prontas |
| Escolher quem da GSS conecta o LinkedIn primeiro (conta antiga, com conexões) | GSS | tela e motor prontos, motor desligado |
| Assinar a Unipile antes do fim do teste grátis (~20/11) | GSS/Raul | sem assinatura a API trava |
| Aprovar o PDF das 36 respostas antes do reenvio | GSS (Vinicius) | — |
| Primeiro teste real: médico respondendo no Instagram; motor do LinkedIn mandando o 1º convite | nosso, depois dos dois acima | regras testadas; caminho real não |
| Mensagens do LinkedIn (texto) nas Conversas | bloqueado | precisa de conta conectada para ver o formato do evento da Unipile |
| Foto automática do CFM | bloqueado | reCAPTCHA do CFM |
| Kanban de acompanhamento pesado (~7 mil cards, 900+ requisições ao abrir) | nosso | o redesenho propõe a coluna "Novo" como número; esperando o Raul na sessão do redesenho |

## Motor de IA — Hermes + Claude Max da GSS ([doc](motor-ia-hermes-claude.md))

| Item | De quem | Situação |
|---|---|---|
| Login da conta Max pela tela (Configurações › Motor de IA) e desligar o "extra usage" | GSS | instalado e testado até o link |
| Definir os processos que rodam no Claude | GSS + Raul | lista vazia de propósito |

## Claude dos sócios — Heron ([doc](claude-socios-gss.md))

| Item | De quem | Situação |
|---|---|---|
| T5 tela `/conectar-claude` (conexões, desligar, token do Claude Code), no menu de admin e diretoria | nosso | ✅ 14/11 (portão visual 0 falhas) |
| T7 login OAuth no `sigma-mcp` (Claude.ai e celular) | nosso | ✅ 14/11, 27 checagens ponta a ponta por script |
| Publicar o front no Lovable (a tela de aprovação do OAuth vive lá) | Raul | — |
| Conectar o Claude.ai do Raul pelo endereço do conector: prova que o Claude.ai acha o login (risco: ele procurar só na raiz do domínio) | Raul (5 min) | depois de publicar |
| Furos de um dia contra o Dr. Escala | nosso | ✅ API ao vivo: CEPON 18/11, 13 plantões e 1 furo iguais; falta só olhar na tela deles (login da GSS) |
| Alerta se a sincronização passar de 12 h (T3) | nosso | cron rodou 13:44 e 18:06 de 13/11 |
| LGPD: nome de médico (e na fase 2 conversas) passando pelo Claude de cada sócio; plano do Claude dos sócios | GSS (decisão) | — |
| Lista de sócios que entram; envio pelo escalista sempre com confirmação? | GSS | — |
| Usuário só de leitura no Dr. Escala para o robô (hoje usa a conta da diretoria, admin) | GSS | — |
| Apagar `Downloads\login DR escala - Ramone.txt` (senha em texto puro) | Raul | — |
| T8/T9 fase 2 e 3 (conversas dos escalistas, envio pelo número deles) | depois da T7 | — |

## SLA de laudos — Marieta ([doc](sla-laudos-radiologia.md))

| Item | De quem | Situação |
|---|---|---|
| Teste do fim de semana: lista de escalados e telefones; máquina logada na VPN e no Carestream | GSS (Wagner/Vini) | mensagem enviada no grupo em 13/11 |
| Ligar a escada de ligação ("Ligar quando vencer", aba Escala) e fazer a 1ª ligação real com um número da equipe | GSS + Raul | escada feita e testada nas regras (13/11), desligada |
| Escala do plantão preenchida no Sigma (hoje vazia: sem escala, ninguém recebe aviso, só e-mail) | GSS (Wagner/Brenda) | indicadores das 7h no ar desde 13/11 |
| Reconexão automática da VPN (sccli do Sophos) | bloqueado | falta usuário e senha da VPN |
| Estação 24 h (sem suspensão, no-break, teste após reiniciar) | GSS | — |
| Número +55 no Twilio | bloqueado | cadastro em revisão no Twilio |
| AVC (30 min): como aparece na tela | GSS (Wagner) | — |
| Proposta ao Ramone (R$ 3.000, 4 PACS + 2 novos) | Raul | — |
| Outras unidades: Tijucas (Animati), CEPON, Mobilimed e 2 PACS novos | depois do piloto | — |

## Financeiro

| Item | De quem | Situação |
|---|---|---|
| Usuário do Conta Azul com acesso ao Financeiro e aos cadastros | GSS | o atual não vê nada |
| Planilha do Marieta de outubro | GSS (Mavi) | — |
| De onde vêm os dados bancários dos médicos (hoje estão nas observações dos lançamentos antigos, que a Mavi clonava) | Raul | — |
