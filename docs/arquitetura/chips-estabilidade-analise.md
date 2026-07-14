# Estabilidade de chips WhatsApp — análise consolidada (14/07/2026)

**Problema:** só **6–7 de 21** chips de disparo ficam conectados (`connection_state=open`). É o teto de volume da Máquina de Prospecção (~210 msg/dia com 6 chips × cap 35) — o **P0** pra fechar contratos que esperam volume.

Este doc consolida (a) a pesquisa de mercado/técnica sobre aquecimento e anti-ban e (b) a **validação com dado do banco de produção**, e fecha num plano de ação por ROI.

---

## 1. Síntese da pesquisa (3 frentes) — o insight que decide

Três pesquisas independentes (compra de chip aquecido, aquecimento interno, infra técnica) **convergiram**:

> **O que mata chip é COMPORTAMENTO, não a idade do chip nem o IP.** Os sinais que a Meta pune de fato são **denúncia** e **bloqueio** (alvo: **< 2% por 1.000 msgs**) + volume de destinatários novos/ritmo. Ban é praticamente **irreversível** (fev/2026: 302 de 10.930 apelações revertidas = 2,76%).

Corolários:
- **Comprar chip aquecido = pior custo-benefício** (5–15× o chip virgem por aquecimento não-auditável; golpe/não-entrega documentado no Reclame Aqui; risco de vir banido/recuperável pelo dono anterior). Não ataca a raiz.
- **1º contato MANUAL pela equipe (já adotado 09/06) é a melhor jogada anti-ban** — ataca a denúncia na origem.
- **ESTABILIDADE (o 6/21) é problema SEPARADO** — é infra, não aquecimento.

## 2. Validação com dado (banco de produção, 14/07)

| # | Hipótese | Resultado | Evidência |
|---|----------|-----------|-----------|
| 1 | IPs compartilhados entre chips (ban em cluster) | ❌ **DESCARTADO** | 21 chips = **21 `session` distintas** (Bright Data sticky → 1 IP por chip) |
| 2 | Proxy datacenter (ban imediato) | ⚠️ Parcial | provider `bright_data`, porta `33335` = **ISP/residencial** (não datacenter — ok; mas não 4G — não é padrão-ouro) |
| 3 | Diferença de config entre os 7 up e 14 down | ❌ **DESCARTADO** | Config **idêntica** (mesmo host/port/provider; sessions únicas nos dois grupos) |
| 4 | Chips novos caem, velhos aguentam | ❌ **DESCARTADO** | Up e down **ambos** vão de maio a julho — idade não diferencia |
| 5 | Cron de reconnect resolve | ❌ **DESCARTADO** | `chip-auto-reconnect` (jobid 22) roda a cada 5min, "sucesso", mas 14 seguem caídos → **mitiga, não cura** |

**Achado extra (bug de operação):** dois crons de saúde estão **mortos** — `chip-healthcheck-5min` (jobid 9) e `chip-health-monitor-1min` (jobid 15) têm schedule `0 0 31 2 *` (**31 de fevereiro = nunca dispara**). Zero execuções em 30 dias. Provável "pausa" via data impossível que nunca foi revertida.

## 3. Conclusão da causa-raiz

O 6/21 **não tem causa na camada de config/banco** (tudo descartado com dado). É o **flapping sistêmico do Baileys/Evolution**: race entre o timeout de socket (handshake) e a latência do proxy ISP — quando o handshake não fecha a tempo, o chip trava em "connecting"/cai. Bate com issues idênticos sem fix oficial ([Baileys #2337](https://github.com/WhiskeySockets/Baileys/issues/2337), [#2052](https://github.com/WhiskeySockets/Baileys/issues/2052)) e com a conclusão já registrada na memória do projeto (timeout ~60s hardcoded + proxy residencial).

## 4. Plano de ação (por ROI)

**Camada infra (a cura real — precisa do servidor/Evolution):**
1. **Forçar timeouts do socket** via fork/patch da imagem Evolution: `connectTimeoutMs=30000`, `keepAliveIntervalMs=30000`, `defaultQueryTimeoutMs=120000`. É a raiz que o reconnect só mascara.
2. **Auditar latência do proxy Bright Data ISP** — se estiver alta, é o gatilho do timeout. Avaliar **4G/móvel** (padrão-ouro) ao menos pros chips-chave (~R$800–900/mês/porta; caro → seletivo).
3. **Redis saudável + Docker `restart: always`** (Evolution depende de Redis pra fila/sessão).
4. **Reviver ou remover** os crons mortos (jobid 9, 15) — decidir se o monitoramento de saúde deve voltar.

**Camada comportamental (longevidade — já bem encaminhada):**
5. Manter **1º contato manual** + **cap 35/chip cold** (conservador; ignorar as faixas 200–300/dia dos vendedores).
6. **Instrumentar report/block rate por lote** (alvo < 2%/1.000) — métrica-mãe.
7. **Não comprar chip aquecido.** Aquecer interno com curva ~21 dias espelhando produção.

**Estratégia (estrutural):**
8. **Híbrido:** não-oficial só no 1º contato frio; **Cloud API oficial pra nutrir quem respondeu** (aí o opt-in existe e o ban deixa de ser risco). Custo BR: marketing ~R$0,32/msg, resposta do lead grátis.

## 5. Itens de validação em aberto (camada Evolution/VPS)

Precisam do servidor (`root@147.93.71.48`, Evolution API) e/ou credencial do proxy:
- [ ] Medir latência real do proxy Bright Data ISP (precisa da senha da zone)
- [ ] Ler logs da Evolution buscando `socket timeout` / `connection close` no ciclo de flapping
- [ ] Confirmar versão da Evolution/Baileys e se `socketConfig` é repassado
- [ ] Teste ao vivo: reconectar 1 chip manualmente e cronometrar se cai de novo (assinatura do flapping)

---

Fontes-chave: [baileys-antiban (kobie3717)](https://github.com/kobie3717/baileys-antiban) · [Z-API — bloqueios/banimentos](https://www.z-api.io/blog/bloqueios-e-banimentos-no-whatsapp/) · [Meta — pricing](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing) · [Baileys #2337](https://github.com/WhiskeySockets/Baileys/issues/2337) · Reclame Aqui (chips aquecidos banidos).
