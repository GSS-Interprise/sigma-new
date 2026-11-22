# Roteiro do vídeo: SLA de laudos (grupo do WhatsApp da radiologia)

Para: Ramone, Wagner, Brenda e quem opera o SLA. Formato: 16:9, telas reais do Sigma (sem nome de paciente: gravar
com a fila vazia ou borrar a coluna), narração em pt-BR. Duração alvo: 3 a 4 min, em 3 partes.
Números conferidos no Sigma em 22/11/2026 (prazos e avisos podem mudar na aba Avisos; regravar se mudar).

---

## Abertura (15 s)
**Tela:** fila do SLA ao vivo.
**Narração:**
> Até agora, alguém precisava ficar olhando o PACS para nenhum laudo passar do prazo. A partir de agora, o Sigma faz
> isso: lê a fila, avisa o médico de plantão e, se ninguém assumir, avisa a coordenação. Em três partes: como funciona,
> o que fazer no Sigma, e o que fazer antes de sair da GSS.

## Parte 1: como funciona (60 s)
**Tela:** desenho simples: PACS → estação → Sigma → WhatsApp e ligação.
**Narração:**
> Passo um. Duas estações na GSS ficam ligadas com a VPN e o PACS abertos: o PC do robô, com o Marieta, e o PC da
> Brenda, com o CEPON. A cada três minutos, o Sigma lê a fila de exames "Não lido".
>
> Passo dois. Cada exame tem um prazo pela origem: pronto-socorro, duas horas; internado, quatro horas; externo, quarenta
> e oito horas. A cor da linha no PACS é o que diz a origem.
>
> Passo três. Vinte e cinco minutos antes do prazo, o médico de plantão recebe um WhatsApp com o paciente, o exame e o
> botão "Assumir laudo". Se o prazo vence e ninguém assumiu, ele recebe outro aviso. Tocou em "Assumir laudo", os avisos
> daquele exame param.
>
> Passo quatro. Se ninguém assumir, o Sigma avisa a coordenação. E se a estação parar de ler a fila, a equipe recebe um
> WhatsApp na hora, e de novo a cada três horas, até alguém resolver.

**Fala sobre a ligação** (só se a ligação estiver ligada na aba Avisos quando for gravar; hoje está desligada):
> Se o WhatsApp não bastar, o Sigma liga para o médico. É só apertar 1 para assumir o laudo.

## Parte 2: o que fazer no Sigma (90 s)
**Tela:** Sigma › Radiologia. Mostrar cada aba enquanto narra.
**Narração:**
> No Sigma, abra Radiologia. No topo, escolha a unidade: Hospital Marieta ou CEPON.
>
> Na aba "SLA ao vivo" você vê a fila: quantos exames estão vencidos, perto do prazo e no prazo, e para quem o aviso
> já foi. Em "Abrir", dá para registrar o que foi feito: "Avisei o médico", "Não precisa de laudo" ou "Problema no PACS".
> Isso para os avisos daquele exame.
>
> Na aba "Escala de plantão" fica quem o Sigma avisa. O sobreaviso de tomografia e ultrassom vem sozinho do Dr. Escala.
> Plantão extra se coloca aqui, com nome, WhatsApp e horário, e "Copiar semana anterior" repete a semana.
>
> Na aba "Avisos" ficam os horários dos avisos e os prazos de cada origem. Na aba "Coordenação", quem é avisado quando
> ninguém assume o laudo.

**Nota de gravação:** a aba Coordenação ainda está vazia; preencher antes de gravar (é a mesma pergunta pendente com a GSS).

## Parte 3: antes de sair da GSS (45 s)
**Tela:** checklist na tela, um item por vez.
**Narração:**
> Antes de sair, em cada uma das duas estações:
>
> Um. Deixe o computador ligado. Não desligue e não coloque para suspender. Na sexta, fica ligado até segunda.
> Dois. A VPN do Sophos conectada.
> Três. O PACS aberto, maximizado, na pasta "Não lido": Marieta no PC do robô, CEPON no PC da Brenda. Lembre que Marieta
> e CEPON não abrem juntos no mesmo computador.
> Quatro. Nenhuma janela por cima do PACS, e não bloqueie a tela: o Windows mais L trava a leitura.
>
> Se chegar o aviso de que a estação parou, alguém na GSS liga o computador, conecta a VPN e abre o PACS. Em até três
> minutos o Sigma volta a ler a fila.

## Fecho (10 s)
**Tela:** o WhatsApp de aviso com o botão "Assumir laudo".
**Narração:**
> Para o médico, é só isso: chegou o aviso, confira o PACS e toque em "Assumir laudo".

---

## Antes de gravar
- [ ] Coordenação preenchida na aba Coordenação.
- [ ] Decidir se a ligação entra (hoje desligada) e ajustar a fala da Parte 1.
- [ ] Fila sem nome de paciente na tela (gravar com a fila vazia ou borrar).
- [ ] Modelo `gss_estacao_sla_v1` aprovado na Meta (a fala do aviso de estação parada depende dele).
- [ ] Narração: ElevenLabs, voz Fernanda (padrão dos vídeos da Pulse).
