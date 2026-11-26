// Alertas do SLA de laudos (radiologia GSS). Plano: docs/arquitetura/sla-laudos-radiologia.md. Só service_role chama.
//   coletor (cron 5 min) — sem leitura "ok" da estação há mais de 15 min: abre uma queda e avisa por e-mail e WhatsApp
//                          (lembrete a cada 3 h enquanto continua parada); quando volta, avisa.
//   exames  (cron 2 min) — sequência configurada na tela (sla_aviso_passos, 21/11): avisos ao plantonista (WhatsApp com
//                          "Assumir laudo" ou ligação) e, sem ninguém assumir, contatos da aba Coordenação. Regra em
//                          _shared/slaEscada.ts (passosAgora). Só roda com config sla_alertas_ativo = "true".
//   assumir              — clique no botão (chamado pelo chakra-webhook): marca o exame como assumido e para os avisos.
//   indicadores (cron 7h) — e-mail com o período das 7h de ontem às 7h de hoje.
//   criar_templates / status_templates — modelos na Meta.
//   ligar_teste { telefone } — ligação de teste com voz (Twilio), para conferir número de origem e áudio.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { chakraApi, unwrapChakraPayload } from "../_shared/chakra.ts";
import { SLA_VOZ_URL, tokenAlerta } from "../_shared/sla.ts";
import { motivoQueda, quedaRapida, SILENCIO_MIN } from "../_shared/slaEstacao.ts";
import { calcularIndicadores, daModalidade, destinoDoAviso, listaDoAviso, modalidadeDoExame, passosAgora, saidaConfiavel, textoIndicadores } from "../_shared/slaEscada.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
// CEPON entrou em 22/11 (segunda estação: o mesmo Vue PACS do Marieta não abre os dois juntos na mesma máquina).
// Tijucas (Animati) e Mobilemed entraram nos avisos em 24/11.
const UNIDADES = ["marieta", "cepon", "tijucas", "mobilemed"];
// Lembrete por WhatsApp enquanto a estação continua parada (fim de semana passava em branco só com e-mail).
// Estes tempos são editáveis na aba Avisos (25/11, config sla_*; ver migration 20261125230000): os valores abaixo são
// o padrão e são recarregados por carregarRegras() no começo de cada chamada.
let LEMBRETE_QUEDA_H = 3;
let LIMITE_MIN = 15;
// Travas do motor depois da enxurrada de 16/11 (104 avisos de exames de sexta): ver checarExames.
let MAX_ATRASO_MIN = 120;
const MAX_POR_RODADA = 10;
// Assumiu e não laudou: minutos depois do vencimento para avisar (Ramone, 25/11: 5 min).
let ASSUMIDO_FOLGA_MIN = 5;
// Intervalo mínimo entre avisos para a mesma pessoa (26/11): no máximo 1 ligação a cada 15 min e 1 WhatsApp a cada 10.
const INTERVALO_LIGACAO_MIN = 15;
const INTERVALO_WHATS_MIN = 10;
let AVISAR_EXTERNO = false;
let RESUMO_HORA = 7;
const chaveExame = (e: { origem: string; inicio_em: string; paciente?: string | null; estudo?: string | null }) =>
  [e.origem, new Date(e.inicio_em).getTime(), (e.paciente ?? "").trim().toLowerCase(), (e.estudo ?? "").trim().toLowerCase()].join("|");

// Modelos de alerta. Sem acento: os modelos acentuados desta conta foram recusados pela Meta (financeiro, 10/2026).
// Sem nome de paciente (decisão do Raul, 12/11): o médico acha o exame no PACS pela origem e pela hora.
// O botão leva o payload "sla_assumir:<alerta_id>" no envio; o chakra-webhook repassa para cá.
export const PAYLOAD_ASSUMIR = "sla_assumir:";
const MODELOS = [
  {
    nome: "gss_sla_laudo_prazo_v1",
    corpo: "Alerta de SLA de laudo - {{1}}, {{2}}: o exame das {{3}} vence em {{4}}. Confira o PACS e toque em Assumir laudo para parar os avisos.",
    exemplo: ["Pronto Socorro", "Hospital Marieta", "08:22", "20 min"],
    variaveis: { "1": "Origem", "2": "Unidade", "3": "Hora do exame", "4": "Tempo restante" },
  },
  {
    nome: "gss_sla_laudo_vencido_v1",
    corpo: "SLA de laudo vencido - {{1}}, {{2}}: o exame das {{3}} passou do prazo ha {{4}} e ninguem assumiu o laudo. Confira o PACS e toque em Assumir laudo.",
    exemplo: ["Pronto Socorro", "Hospital Marieta", "08:22", "15 min"],
    variaveis: { "1": "Origem", "2": "Unidade", "3": "Hora do exame", "4": "Tempo de atraso" },
  },
  // v2 (12/11): com nome do paciente e estudo (decisão do Raul, pedido do Wagner). Usado quando aprovado; senão, v1.
  {
    nome: "gss_sla_laudo_prazo_v2",
    corpo: "Alerta de SLA de laudo - {{1}}, {{2}}: paciente {{3}}, {{4}}, exame das {{5}}, vence em {{6}}. Confira o PACS e toque em Assumir laudo para parar os avisos.",
    exemplo: ["Pronto Socorro", "Hospital Marieta", "Maria Silva", "TC Cranio", "08:22", "20 min"],
    variaveis: { "1": "Origem", "2": "Unidade", "3": "Paciente", "4": "Estudo", "5": "Hora do exame", "6": "Tempo restante" },
  },
  {
    nome: "gss_sla_laudo_vencido_v2",
    corpo: "SLA de laudo vencido - {{1}}, {{2}}: paciente {{3}}, {{4}}, exame das {{5}}, passou do prazo ha {{6}} e ninguem assumiu o laudo. Confira o PACS e toque em Assumir laudo.",
    exemplo: ["Pronto Socorro", "Hospital Marieta", "Maria Silva", "TC Cranio", "08:22", "15 min"],
    variaveis: { "1": "Origem", "2": "Unidade", "3": "Paciente", "4": "Estudo", "5": "Hora do exame", "6": "Tempo de atraso" },
  },
  // Agrupado (26/11): vários exames para a mesma pessoa na mesma rodada. O botão assume todos (payload sla_assumir:g:).
  {
    nome: "gss_sla_laudo_varios_v1",
    corpo: "Alerta de SLA de laudo - {{1}}: {{2}} exames precisam de laudo. {{3}}. Confira o PACS e toque em Assumir laudos para assumir todos.",
    exemplo: ["Hospital Marieta", "3", "PS 10:01 (TC Pelve) vencido ha 41 min; PS 10:12 (TC Torax) vence em 5 min; Internado 09:40 (TC Cranio) vence em 20 min"],
    variaveis: { "1": "Unidade", "2": "Quantidade", "3": "Lista de exames" },
    botao: "Assumir laudos",
  },
  // 26/11: a Meta reclassificou prazo_v1, vencido_v1 e varios_v1 como MARKETING, e marketing tem limite por
  // destinatário (131049 barrou Thaina e Wagner). Este nasce com allow_category_change = false: ou fica UTILITY, ou é
  // recusado. Os v2 (UTILITY) passam a ser os únicos modelos de um exame.
  {
    nome: "gss_sla_laudo_lista_v1",
    corpo: "Laudos pendentes no SLA - {{1}}: {{2}} exames aguardam laudo. {{3}}. Toque em Assumir laudos para confirmar que vai laudar todos.",
    exemplo: ["Hospital Marieta", "3", "PS 10:01 (TC Pelve) vencido ha 41 min; PS 10:12 (TC Torax) vence em 5 min; Internado 09:40 (TC Cranio) vence em 20 min"],
    variaveis: { "1": "Unidade", "2": "Quantidade", "3": "Lista de exames" },
    botao: "Assumir laudos",
    fixarCategoria: true,
  },
];

async function remetente(admin: any) {
  const { data: cfg } = await admin.from("config_lista_items").select("valor").eq("campo_nome", "sla_whatsapp_sender_id").maybeSingle();
  if (!cfg?.valor) throw new Error("config sla_whatsapp_sender_id ausente");
  const { data } = await admin.from("whatsapp_official_senders")
    .select("id, phone_e164, chakra_plugin_id, chakra_waba_id, chakra_phone_number_id").eq("id", cfg.valor).maybeSingle();
  if (!data) throw new Error("remetente do SLA nao encontrado");
  return data;
}

// Criação de modelo da Amni: a rota padrão (chakraApi) manda a WABA 286031407919518 pela conta da Pulse, que hoje
// responde 200 com {"_errors":["WABA ... is not part of plugin configuration or is not connected"]} e o modelo
// nunca chega à Meta (12/11). A conta GSS tem o plugin d9a6180c com essa WABA: cria por ela. O envio continua
// pela rota padrão até alguém migrar a Amni de conta (ver _shared/chakra.ts, CHAKRA_IDS_CONTA_PULSE).
async function chakraGss(path: string, init: RequestInit = {}) {
  const key = Deno.env.get("CHAKRA_API_KEY_GSS")?.trim();
  if (!key) throw new Error("CHAKRA_API_KEY_GSS ausente");
  const r = await fetch(`https://api.chakrahq.com${path}`, {
    ...init, headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const corpo: any = await r.json().catch(() => ({}));
  if (!r.ok || (Array.isArray(corpo?._errors) && corpo._errors.length)) {
    throw new Error(`chakra ${r.status}: ${JSON.stringify(corpo?._errors ?? corpo).slice(0, 300)}`);
  }
  return corpo;
}

async function criarTemplates(admin: any, dryRun: boolean, nomes?: string[]) {
  const sender = await remetente(admin);
  const out: unknown[] = [];
  // nomes: cria só estes (ex.: os v2 num número que já tem os v1)
  for (const m of MODELOS.filter((x) => !nomes?.length || nomes.includes(x.nome))) {
    const componentes = [
      { type: "BODY", text: m.corpo, example: { body_text: [m.exemplo] } },
      { type: "BUTTONS", buttons: [{ type: "QUICK_REPLY", text: (m as { botao?: string }).botao ?? "Assumir laudo" }] },
    ];
    if (dryRun) { out.push({ nome: m.nome, remetente: sender.phone_e164, componentes }); continue; }
    const resposta = await chakraGss(`/v1/ext/plugin/whatsapp/api/v24.0/${sender.chakra_waba_id}/message_templates`,
      { method: "POST", body: JSON.stringify({ name: m.nome, category: "UTILITY", language: "pt_BR", components: componentes,
        ...((m as { fixarCategoria?: boolean }).fixarCategoria ? { allow_category_change: false } : {}) }) });
    const remoto = unwrapChakraPayload(resposta);
    const remotoId = String(remoto.id || remoto.message_template_id || m.nome);
    const st = String(remoto.status || "PENDING").toLowerCase();
    const { error } = await admin.from("whatsapp_official_templates").upsert({
      provider: "chakra", content_sid: `chakra:${sender.chakra_plugin_id}:${remotoId}`, friendly_name: m.nome, language: "pt_BR",
      category: "UTILITY", body: m.corpo, variables: m.variaveis,
      approval_status: st === "approved" ? "approved" : st === "rejected" ? "rejected" : "pending", twilio_payload: remoto,
      updated_at: new Date().toISOString(),
    }, { onConflict: "content_sid" });
    if (error) throw error;
    out.push({ nome: m.nome, status: st, id: remotoId, bruto: JSON.stringify(resposta).slice(0, 400) });
  }
  return out;
}

// Situação dos modelos direto na Meta (via Chakra): a conta que não enxerga a WABA aceita o modelo como "pendente"
// e nunca manda à Meta, então só vale o que a listagem da WABA mostra.
async function statusTemplates(admin: any) {
  const sender = await remetente(admin);
  const out: unknown[] = [];
  // O filtro ?name= é ignorado e a lista vem paginada: percorre as páginas pelo cursor.
  const todos: any[] = [];
  let after = "";
  for (let i = 0; i < 15; i++) {
    // Sem unwrapChakraPayload: ele devolveria o próprio array "data" e perderia o "paging".
    const r: any = await chakraGss(
      `/v1/ext/plugin/whatsapp/api/v24.0/${sender.chakra_waba_id}/message_templates${after ? `?after=${encodeURIComponent(after)}` : ""}`);
    if (Array.isArray(r?.data)) todos.push(...r.data);
    after = r?.paging?.cursors?.after && r?.paging?.next ? r.paging.cursors.after : "";
    if (!after) break;
  }
  for (const m of MODELOS) {
    const t = todos.find((x: any) => x.name === m.nome);
    const st = String(t?.status || "nao_encontrado").toLowerCase();
    if (t) {
      await admin.from("whatsapp_official_templates").update({
        approval_status: st === "approved" ? "approved" : st === "rejected" ? "rejected" : "pending", updated_at: new Date().toISOString(),
      }).eq("friendly_name", m.nome);
    }
    out.push({ nome: m.nome, status: st, categoria: t?.category ?? null, motivo: t?.rejected_reason ?? null, total_na_waba: todos.length, nomes: todos.map((x: any) => x.name).join(",") });
  }
  return out;
}

// ── Motor de alertas ao médico ─────────────────────────────────────────────
// Envio pela conta Chakra GSS, plugin d9a6180c (BM GSS, inclui a Amni): é a conta em que os modelos foram criados.
const PLUGIN_GSS = "d9a6180c-4ae4-4ed4-9c16-401b781e1ee7";
const ORIGEM: Record<string, string> = { ps: "Pronto Socorro", internado: "Internado", externo: "Externo" };
const NOME_UNIDADE: Record<string, string> = { marieta: "Hospital Marieta", cepon: "CEPON", tijucas: "Tijucas", mobilemed: "Mobilemed" };
const dig = (v: unknown) => String(v ?? "").replace(/\D/g, "");
// Mesmo número com ou sem o 9 e o 55: compara DDD + 8 últimos dígitos.
const mesmoNumero = (a: string, b: string) => {
  const n = (x: string) => { const d = dig(x).replace(/^55/, ""); return d.slice(0, 2) + d.slice(-8); };
  return n(a) === n(b);
};
const duracao = (min: number) => {
  const m = Math.max(1, Math.round(min));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
};
const horaExame = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });

async function enviarModelo(sender: any, para: string, modelo: string, params: string[], alertaId: string) {
  const resp = await chakraGss(`/v1/ext/plugin/whatsapp/${PLUGIN_GSS}/api/v24.0/${sender.chakra_phone_number_id}/messages`, {
    method: "POST",
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "template",
      template: {
        name: modelo, language: { policy: "deterministic", code: "pt_BR" },
        components: [
          { type: "body", parameters: params.map((t) => ({ type: "text", text: t })) },
          // o payload identifica o alerta no clique (o texto do botão é igual para todos)
          { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: PAYLOAD_ASSUMIR + alertaId }] },
        ],
      },
    }),
  });
  return JSON.stringify(resp).match(/wamid\.[A-Za-z0-9=_-]+/)?.[0] ?? null;
}

async function enviarTexto(sender: any, para: string, texto: string) {
  try {
    await chakraGss(`/v1/ext/plugin/whatsapp/${PLUGIN_GSS}/api/v24.0/${sender.chakra_phone_number_id}/messages`, {
      method: "POST",
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: para, type: "text", text: { body: texto } }),
    });
  } catch (e) { console.warn("[sla-alertas] texto", e); }
}

// Tempos editáveis (aba Avisos). Valor fora da faixa ou ausente fica no padrão: aviso nunca para por config ruim.
async function carregarRegras(admin: any) {
  const { data } = await admin.from("config_lista_items").select("campo_nome, valor").in("campo_nome",
    ["sla_assumido_folga_min", "sla_avisar_externo", "sla_max_atraso_min", "sla_estacao_limite_min", "sla_estacao_lembrete_h", "sla_resumo_hora"]);
  const v = new Map<string, string>((data ?? []).map((r: any) => [r.campo_nome, String(r.valor ?? "").trim()]));
  const num = (k: string, min: number, max: number, padrao: number) => {
    const n = Number(v.get(k)); return v.get(k) && Number.isInteger(n) && n >= min && n <= max ? n : padrao;
  };
  MAX_ATRASO_MIN = num("sla_max_atraso_min", 30, 120, 120);
  ASSUMIDO_FOLGA_MIN = Math.min(num("sla_assumido_folga_min", 0, 119, 5), MAX_ATRASO_MIN - 1);
  LIMITE_MIN = num("sla_estacao_limite_min", 6, 60, 15);
  LEMBRETE_QUEDA_H = num("sla_estacao_lembrete_h", 1, 24, 3);
  RESUMO_HORA = num("sla_resumo_hora", 0, 23, 7);
  AVISAR_EXTERNO = v.get("sla_avisar_externo") === "true";
}

async function config(admin: any, nome: string) {
  const { data } = await admin.from("config_lista_items").select("valor").eq("campo_nome", nome).maybeSingle();
  return String(data?.valor ?? "").trim();
}

// teste: só para a unidade "teste" (chamada manual) — liga a escada sem mexer na config e não manda e-mail à coordenação.
async function checarExames(admin: any, forcar = false, unidades = UNIDADES, teste = false) {
  if (teste && unidades.some((u) => u !== "teste")) throw new Error("modo teste só na unidade teste");
  if (!forcar && (await config(admin, "sla_alertas_ativo")) !== "true") return { pulado: "sla_alertas_ativo desligado" };
  const sender = await remetente(admin);
  const agora = new Date();
  const res: any[] = [];
  const emails: string[] = [];
  const { data: v2 } = await admin.from("whatsapp_official_templates").select("friendly_name")
    .in("friendly_name", ["gss_sla_laudo_prazo_v2", "gss_sla_laudo_vencido_v2"]).eq("approval_status", "approved");
  // Nomes distintos: com o remetente novo (26/11) cada modelo tem uma linha por número; contar linhas dava 4 e o motor
  // caía no v1, que a Meta classificou como marketing (131049 barrou os avisos).
  const v2Aprovado = new Set((v2 ?? []).map((x: any) => x.friendly_name)).size === 2;
  const { data: vr } = await admin.from("whatsapp_official_templates").select("friendly_name")
    .eq("friendly_name", "gss_sla_laudo_lista_v1").eq("approval_status", "approved").limit(1);
  const variosAprovado = (vr ?? []).length > 0;
  // WhatsApp e ligação da rodada ficam aqui e saem no fim, juntos por pessoa (dispararRodada). E-mail sai na hora.
  const fila: ItemFila[] = [];
  const testeDestino = await config(admin, "sla_teste_destino");
  // Externo não avisa o plantão (Wagner, 24/11: "o externo não vejo tanta necessidade agora para o plantão").
  // Continua na fila e no resumo; para voltar a avisar, config sla_avisar_externo = "true".
  const avisarExterno = AVISAR_EXTERNO;
  // Sequência de avisos configurada nas abas Avisos e Coordenação (sla_aviso_passos, 21/11).
  const { data: passosTodos } = await admin.from("sla_aviso_passos")
    .select("id, unidade, destino, minutos, canal, ativo, contato_nome, contato_papel, contato_telefone, contato_email, periodo")
    .order("ordem").order("id");
  for (const unidade of unidades) {
    // Coletor parado = fila velha: o exame pode já ter sido laudado. Não alerta médico com dado velho
    // (a queda já tem o aviso próprio).
    const { data: queda } = await admin.from("sla_coletor_quedas").select("id").eq("unidade", unidade).is("fechada_em", null).maybeSingle();
    if (queda) { res.push({ unidade, pulado: "coletor_parado" }); continue; }
    // Fila só vale se uma leitura "ok" (com linhas) acabou de passar: é a única que marca a saída dos exames.
    // Sem ela, a fila pode ser a de dias atrás. Em 16/11 duas leituras "lista vazia" fecharam a queda do fim de
    // semana e o motor avisou 104 exames de sexta, já laudados, como vencidos há 31 h.
    const { data: ultOk } = await admin.from("sla_leituras").select("lida_em").eq("unidade", unidade).eq("status", "ok")
      .order("lida_em", { ascending: false }).limit(1).maybeSingle();
    if (!ultOk || agora.getTime() - new Date(ultOk.lida_em).getTime() > LIMITE_MIN * 60_000) {
      res.push({ unidade, pulado: "fila_desatualizada", ultima_ok: ultOk?.lida_em ?? null }); continue;
    }
    // A sequência de avisos é uma só para todas as unidades (regras iguais em todos os PACS, Ramone): a tela grava em
    // "marieta" e as outras unidades (e a "teste") usam a mesma.
    const passos = (passosTodos ?? []).filter((p: any) => p.unidade === "marieta") as any[];
    res.push(...await avisarAssumidosVencidos(admin, sender, unidade, agora, testeDestino, emails, ASSUMIDO_FOLGA_MIN));

    const { data: todos } = await admin.from("sla_exames")
      .select("id, origem, inicio_em, vence_em, paciente, estudo")
      .eq("unidade", unidade).is("saiu_em", null).is("ausente_em", null).is("assumido_em", null).is("silenciado_em", null)
      .lte("inicio_em", agora.toISOString()).order("vence_em").order("id");
    // O PACS mostra o mesmo exame em 2 ou 3 linhas (externos, 13/11): um aviso por paciente + estudo + hora + origem.
    // Vencido há mais de MAX_ATRASO_MIN não gera aviso nem ligação: fica para o resumo das 7h.
    const grupos = new Map<string, any>();
    for (const e of todos ?? []) {
      if (agora.getTime() - new Date(e.vence_em).getTime() > MAX_ATRASO_MIN * 60_000) continue;
      if (e.origem === "externo" && !avisarExterno) continue;
      const k = chaveExame(e);
      if (!grupos.has(k)) grupos.set(k, { ...e, irmaos: [e.id] }); else grupos.get(k).irmaos.push(e.id);
    }
    const exames = [...grupos.values()];
    if (!exames.length) { res.push({ unidade, exames: 0 }); continue; }
    const { data: jaBruto } = await admin.from("sla_alertas").select("exame_id, passo_id")
      .in("exame_id", exames.flatMap((e: any) => e.irmaos));
    // Alerta de uma cópia vale para o grupo: tudo passa a contar no id do primeiro do grupo.
    const doGrupo = new Map<string, string>(exames.flatMap((e: any) => e.irmaos.map((id: string) => [id, e.id] as [string, string])));
    const ja = (jaBruto ?? []).map((a: any) => ({ ...a, exame_id: doGrupo.get(a.exame_id) ?? a.exame_id }));
    let enviados = 0;
    // Mesma equipe em todas as unidades (Raul, 24/11): unidade sem escala própria futura usa a da Marieta. Se um dia
    // a unidade ganhar escala própria na tela, ela passa a valer sozinha.
    const { count: propria } = await admin.from("sla_plantao").select("id", { count: "exact", head: true })
      .eq("unidade", unidade).gt("fim", agora.toISOString());
    const { data: escala } = await admin.from("sla_plantao").select("id, papel, nome, telefone, email, modalidade")
      .eq("unidade", propria ? unidade : "marieta").lte("inicio", agora.toISOString()).gt("fim", agora.toISOString());
    const plantonistas = (escala ?? []).filter((p: any) => p.papel === "plantonista");

    for (const e of exames) {
      const feitos = new Set<string>(ja.filter((a: any) => a.exame_id === e.id && a.passo_id).map((a: any) => a.passo_id));
      const fim = new Date(e.vence_em).getTime();
      const agoraPassos = passosAgora(passos, feitos, (agora.getTime() - fim) / 60000, agora) as any[];
      if (!agoraPassos.length) continue;
      // Teto por rodada: se algo escapar das travas acima, sai no máximo isto a cada 2 min (o resto fica para a
      // próxima rodada, mais urgente primeiro), e não 100 mensagens de uma vez no número da Meta.
      if (enviados >= MAX_POR_RODADA) { res.push({ unidade, adiados: true }); break; }
      enviados++;
      // Escala do Dr. Escala (19/11): sobreaviso de TC e de US ao mesmo tempo. O exame avisa quem é da modalidade
      // dele; sem ninguém da modalidade, ninguém de outra modalidade é chamado (Wagner, 26/11): vira "sem escala".
      const modalidade = modalidadeDoExame(e.estudo);
      const plantonistasDoExame = daModalidade(plantonistas, modalidade);
      const vencido = agora.getTime() >= fim;
      const tipo = vencido ? "vencido" : "prazo";
      const origem = ORIGEM[e.origem] ?? e.origem, hh = horaExame(e.inicio_em), un = NOME_UNIDADE[unidade] ?? unidade;
      const tempo = vencido ? duracao((agora.getTime() - fim) / 60000) : duracao((fim - agora.getTime()) / 60000);
      // Sempre o v2 quando aprovado (UTILITY); sem nome lido, vai "nao identificado" (v1 virou marketing na Meta, 26/11).
      const comNome = v2Aprovado;
      const modelo = `gss_sla_laudo_${tipo}_${comNome ? "v2" : "v1"}`;
      const params = comNome
        ? [origem, un, String(e.paciente || "nao identificado").slice(0, 60), String(e.estudo || "exame").slice(0, 60), hh, tempo]
        : [origem, un, hh, tempo];
      const linha = `${origem}${e.paciente ? `, ${e.paciente}${e.estudo ? ` (${e.estudo})` : ""}` : ""}, exame das ${hh}: ${vencido ? `vencido há ${tempo}` : `vence em ${tempo}`}`;

      for (const passo of agoraPassos) {
        const pessoas = passo.destino === "plantonista"
          ? plantonistasDoExame.map((p: any) => ({ id: p.id, papel: "plantonista", nome: p.nome, telefone: p.telefone, email: p.email }))
          : [{ id: null, papel: passo.contato_papel, nome: passo.contato_nome, telefone: passo.contato_telefone, email: passo.contato_email }];
        if (!pessoas.length) {
          // Sem ninguém na escala neste horário: registra o passo (não repete) e avisa por e-mail.
          await admin.from("sla_alertas").insert({ exame_id: e.id, tipo: "sem_escala", papel: "sem_escala", canal: "email",
            status: "enviado", destino_nome: "Coordenação (e-mail)", passo_id: passo.id });
          emails.push(`${linha}. Ninguém de ${modalidade === "US" ? "ultrassom" : "tomografia"} na escala de plantão agora.`);
          res.push({ exame: e.id, passo: passo.id, sem_escala: true });
          continue;
        }
        for (const pessoa of pessoas) {
          if (passo.canal === "email") res.push(await dispararPasso(admin, sender, e, passo, pessoa, tipo, modelo, params, linha, testeDestino, emails));
          else fila.push({ e, passo, pessoa, tipo, modelo, params, linha, unidade: un, origem, hh, tempo });
        }
      }
      const contatos = agoraPassos.filter((p) => p.destino === "contato");
      if (vencido && contatos.length) emails.push(`${linha}. Ninguém assumiu; avisado(s): ${contatos.map((p) => p.contato_nome).join(", ")}.`);
    }
  }
  res.push(...await dispararRodada(admin, sender, fila, testeDestino, emails, variosAprovado));
  if (!teste) await emailResumoSla(admin, emails);
  return res;
}

type ItemFila = { e: any; passo: any; pessoa: any; tipo: string; modelo: string; params: string[]; linha: string;
  unidade: string; origem: string; hh: string; tempo: string };

// Fim da rodada (26/11): o que vai para a mesma pessoa pelo mesmo canal sai junto. Um item = como antes (modelo do
// exame, botão Assumir laudo). Dois ou mais = uma ligação, ou um WhatsApp com a lista (gss_sla_laudo_varios_v1, se
// aprovado; senão, um por exame como antes). Em 26/11 o Wagner recebeu 4 modelos seguidos e a Meta barrou 2.
async function dispararRodada(admin: any, sender: any, fila: ItemFila[], testeDestino: string, emails: string[], variosAprovado: boolean) {
  const out: any[] = [];
  const porPessoa = new Map<string, ItemFila[]>();
  for (const it of fila) {
    const k = `${it.passo.canal}:${dig(destinoDoAviso(it.pessoa, testeDestino).telefone)}`;
    porPessoa.set(k, [...(porPessoa.get(k) ?? []), it]);
  }
  for (const itens of porPessoa.values()) {
    // Intervalo mínimo por pessoa (26/11): a Thaina levou 8 ligações em 30 min, porque cada exame que vencia numa rodada
    // nova virava outra chamada, e a Meta barrou WhatsApps seguidos para a mesma pessoa (131049/131056). Dentro do
    // intervalo nada sai e nada é marcado: os passos ficam para a próxima rodada e saem juntos depois.
    const canal = itens[0].passo.canal;
    const alvo = destinoDoAviso(itens[0].pessoa, testeDestino);
    // Coordenação e diretoria (contato) no máximo 1 ligação por hora (26/11: a Ramone reclamou de 2 ligações em 20 min).
    const intervaloMin = canal === "ligacao" ? (itens[0].pessoa.papel === "plantonista" ? INTERVALO_LIGACAO_MIN : 60) : INTERVALO_WHATS_MIN;
    const { data: recente } = await admin.from("sla_alertas").select("id").eq("canal", canal).eq("destino", alvo.telefone)
      .gte("criado_em", new Date(Date.now() - intervaloMin * 60_000).toISOString()).not("erro", "like", "teste interno%").limit(1);
    if (!alvo.teste && (recente ?? []).length) { out.push({ para: alvo.nome, canal, adiado: itens.length, intervalo_min: intervaloMin }); continue; }
    const juntos = itens.length > 1 && (canal === "ligacao" || variosAprovado);
    if (!juntos) {
      for (const it of itens) out.push(await dispararPasso(admin, sender, it.e, it.passo, it.pessoa, it.tipo, it.modelo, it.params, it.linha, testeDestino, emails));
      continue;
    }
    out.push(await dispararGrupo(admin, sender, itens, testeDestino, emails));
  }
  return out;
}

async function dispararGrupo(admin: any, sender: any, itens: ItemFila[], testeDestino: string, emails: string[]) {
  itens.sort((a, b) => new Date(a.e.vence_em).getTime() - new Date(b.e.vence_em).getTime() || String(a.e.id).localeCompare(String(b.e.id)));
  const canal = itens[0].passo.canal;
  const alvo = destinoDoAviso(itens[0].pessoa, testeDestino);
  const grupo = crypto.randomUUID();
  const { data: linhas, error } = await admin.from("sla_alertas").insert(itens.map((it) => ({
    exame_id: it.e.id, tipo: it.tipo, papel: it.pessoa.papel, plantao_id: it.pessoa.id, passo_id: it.passo.id, canal,
    destino_nome: alvo.nome, destino: alvo.telefone, grupo,
  }))).select("id");
  if (error) throw error;
  const ids = (linhas ?? []).map((l: any) => l.id);
  try {
    if (canal === "ligacao") {
      if (alvo.teste) throw new Error("teste interno: ligação não sai");
      await ligar(admin, alvo.telefone, ids[0]);
      const { data: l0 } = await admin.from("sla_alertas").select("mensagem_id").eq("id", ids[0]).single();
      await admin.from("sla_alertas").update({ status: "enviado", mensagem_id: l0?.mensagem_id ?? null }).eq("grupo", grupo);
    } else {
      const unidades = [...new Set(itens.map((it) => it.unidade))].join(" e ");
      const lista = listaDoAviso(itens.map((it) => ({
        unidade: it.unidade, origem: it.e.origem === "ps" ? "PS" : it.origem, hora: it.hh, estudo: it.e.estudo,
        estado: it.tipo === "vencido" ? `vencido ha ${it.tempo}` : `vence em ${it.tempo}`,
      })));
      const wamid = await enviarModelo(sender, alvo.telefone, "gss_sla_laudo_lista_v1", [unidades, String(itens.length), lista], `g:${grupo}`);
      await admin.from("sla_alertas").update({ status: "enviado", mensagem_id: wamid }).eq("grupo", grupo);
    }
    return { grupo, para: alvo.nome, canal, exames: itens.length, ok: true };
  } catch (err) {
    const msg = String((err as Error).message || err).slice(0, 300);
    await admin.from("sla_alertas").update({ status: "falhou", erro: msg }).eq("grupo", grupo);
    if (!msg.startsWith("teste interno")) {
      emails.push(`${itens.length} exames: ${canal === "ligacao" ? "a ligação" : "o WhatsApp"} para ${alvo.nome} falhou: ${msg}`);
    }
    return { grupo, para: alvo.nome, canal, exames: itens.length, ok: false, erro: msg };
  }
}

// Um passo da sequência para uma pessoa. Grava em sla_alertas com passo_id (é o que impede repetir) antes de enviar.
// Teste interno (sla_teste_destino): WhatsApp vai para o número de teste e ninguém recebe ligação.
// Assumiu e o prazo venceu sem laudo, N min depois do vencimento (Ramone, 25/11: "se o cara apertar laudo assumido e não assumir, como fica?").
// Assumir tira o exame da escada (ninguém mais é chamado), mas se o prazo vencer e o exame continuar na fila do PACS,
// vai UM aviso: WhatsApp de texto para quem assumiu (a janela de 24 h costuma estar aberta pelo clique em Assumir; se
// não estiver, a Meta recusa e fica só o e-mail) e e-mail para a Coordenação. Uma vez por exame (tipo
// assumido_vencido); vencido há mais de MAX_ATRASO_MIN fica para o resumo das 7h, como os outros avisos.
async function avisarAssumidosVencidos(admin: any, sender: any, unidade: string, agora: Date, testeDestino: string, emails: string[],
  folgaMin = ASSUMIDO_FOLGA_MIN) {
  const out: any[] = [];
  const { data: exs } = await admin.from("sla_exames")
    .select("id, origem, inicio_em, vence_em, paciente, estudo, assumido_em, assumido_por")
    .eq("unidade", unidade).is("saiu_em", null).is("ausente_em", null).is("silenciado_em", null)
    .not("assumido_em", "is", null).lte("vence_em", new Date(agora.getTime() - folgaMin * 60_000).toISOString())
    .gte("vence_em", new Date(agora.getTime() - MAX_ATRASO_MIN * 60_000).toISOString()).order("vence_em").order("id");
  if (!exs?.length) return out;
  const ids = exs.map((e: any) => e.id);
  const { data: ja } = await admin.from("sla_alertas").select("exame_id").in("exame_id", ids).eq("tipo", "assumido_vencido");
  const avisados = new Set((ja ?? []).map((a: any) => a.exame_id));
  // Quem assumiu: o alerta respondido (tecla 1 ou botão) do exame tem o telefone.
  const { data: resp } = await admin.from("sla_alertas").select("exame_id, destino, destino_nome, respondido_em")
    .in("exame_id", ids).eq("status", "respondido").order("respondido_em", { ascending: false }).order("id");
  const vistos = new Set<string>();
  for (const e of exs) {
    const k = chaveExame(e);
    if (avisados.has(e.id) || vistos.has(k)) continue; // cópias do mesmo exame no PACS: um aviso só
    vistos.add(k);
    const r = (resp ?? []).find((a: any) => a.exame_id === e.id);
    const nome = e.assumido_por || r?.destino_nome || "quem assumiu";
    const un = NOME_UNIDADE[unidade] ?? unidade, origem = ORIGEM[e.origem] ?? e.origem, hh = horaExame(e.inicio_em);
    const atraso = duracao((agora.getTime() - new Date(e.vence_em).getTime()) / 60000);
    const linha = `${un}, ${origem}${e.estudo ? `, ${e.estudo}` : ""}, exame das ${hh}`;
    const fone = dig(r?.destino);
    const alvo = fone.length >= 12 ? destinoDoAviso({ nome, telefone: fone }, testeDestino) : null;
    const { data: al } = await admin.from("sla_alertas").insert({
      exame_id: e.id, tipo: "assumido_vencido", papel: "assumiu", canal: alvo ? "whatsapp" : "email",
      destino_nome: alvo ? alvo.nome : "Coordenação (e-mail)", destino: alvo ? alvo.telefone : null, status: "enviado",
    }).select("id").single();
    if (alvo) {
      await enviarTexto(sender, alvo.telefone,
        `SLA de laudo: ${linha}. Você assumiu este laudo, mas o prazo venceu há ${atraso} e o exame ainda está sem laudo no PACS. Confira, por favor.`);
    }
    emails.push(`${linha}: assumido por ${nome}, mas o prazo venceu há ${atraso} e o laudo ainda não saiu.`);
    out.push({ exame: e.id, assumido_vencido: true, para: alvo?.nome ?? null, alerta: al?.id });
  }
  return out;
}

async function dispararPasso(admin: any, sender: any, e: any, passo: any, pessoa: any, tipo: string, modelo: string,
  params: string[], linha: string, testeDestino: string, emails: string[]) {
  const base = { exame_id: e.id, tipo, papel: pessoa.papel, plantao_id: pessoa.id, passo_id: passo.id, canal: passo.canal };
  if (passo.canal === "email") {
    const ok = await emailar(`SLA de laudo sem dono: ${linha}`, `${linha}. Ninguém assumiu o laudo.\n\nAcompanhe em Sigma › Radiologia › SLA ao vivo.`,
      testeDestino ? undefined : [pessoa.email]);
    await admin.from("sla_alertas").insert({ ...base, destino_nome: pessoa.nome, destino: pessoa.email, status: ok ? "enviado" : "falhou",
      erro: ok ? null : "e-mail não saiu (Resend)" });
    return { exame: e.id, passo: passo.id, para: pessoa.nome, canal: "email", ok };
  }
  const alvo = destinoDoAviso(pessoa, testeDestino);
  const { data: al } = await admin.from("sla_alertas").insert({ ...base, destino_nome: alvo.nome, destino: alvo.telefone })
    .select("id").single();
  try {
    if (passo.canal === "ligacao") {
      if (alvo.teste) throw new Error("teste interno: ligação não sai");
      await ligar(admin, alvo.telefone, al.id);
    } else {
      const wamid = await enviarModelo(sender, alvo.telefone, modelo, params, al.id);
      await admin.from("sla_alertas").update({ status: "enviado", mensagem_id: wamid }).eq("id", al.id);
    }
    return { exame: e.id, passo: passo.id, para: alvo.nome, canal: passo.canal, ok: true };
  } catch (err) {
    const msg = String((err as Error).message || err).slice(0, 300);
    await admin.from("sla_alertas").update({ status: "falhou", erro: msg }).eq("id", al.id);
    if (!msg.startsWith("teste interno")) {
      emails.push(`${linha}. ${passo.canal === "ligacao" ? "A ligação" : "O WhatsApp"} para ${alvo.nome} falhou: ${msg}`);
    }
    return { exame: e.id, passo: passo.id, para: alvo.nome, canal: passo.canal, ok: false, erro: msg };
  }
}

async function indicadores(admin: any, unidades = UNIDADES, agora = new Date(), enviar = true) {
  const hojeSP = new Date(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const deslocamento = agora.getTime() - hojeSP.getTime();
  const fimSP = new Date(hojeSP); fimSP.setHours(RESUMO_HORA, 0, 0, 0);
  if (hojeSP < fimSP) fimSP.setDate(fimSP.getDate() - 1); // rodou antes da hora do resumo: fecha no dia anterior
  const fim = new Date(fimSP.getTime() + deslocamento), ini = new Date(fim.getTime() - 86_400_000);
  const dia = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const periodo = `${dia(ini)} ${RESUMO_HORA}h a ${dia(fim)} ${RESUMO_HORA}h`;
  const textos: string[] = [];
  const res: any[] = [];
  for (const unidade of unidades) {
    const { data: ex, error: erroEx } = await admin.from("sla_exames")
      .select("id, origem, inicio_em, vence_em, saiu_em, visto_completo_em, assumido_em, silenciado_em")
      .eq("unidade", unidade).gte("inicio_em", ini.toISOString()).lt("inicio_em", fim.toISOString()).limit(5000);
    if (erroEx) throw new Error(`indicadores ${unidade}: ${erroEx.message}`);
    const exames = (ex ?? []).map((x: any) => ({ ...x, saida_confiavel: saidaConfiavel(x.saiu_em, x.visto_completo_em) }));
    const assumido = new Map(exames.map((x: any) => [x.id, x.assumido_em]));
    const ids = exames.map((x: any) => x.id);
    const alertas: any[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await admin.from("sla_alertas").select("exame_id, criado_em").in("exame_id", ids.slice(i, i + 200))
        .in("canal", ["whatsapp", "ligacao"]);
      for (const a of data ?? []) alertas.push({ exame_id: a.exame_id, criado_em: a.criado_em, assumido_em: assumido.get(a.exame_id) ?? null });
    }
    const ind = calcularIndicadores(exames, alertas, agora);
    textos.push(textoIndicadores(ind, NOME_UNIDADE[unidade] ?? unidade, periodo));
    res.push({ unidade, ...ind });
  }
  // enviar = false: só calcula (conferência manual sem mandar e-mail à coordenação).
  const email = enviar && await emailar(`SLA de laudos: indicadores de ${periodo}`, textos.join("\n\n") + "\n\nDetalhe em Sigma › Radiologia › SLA ao vivo.");
  return { periodo, email, texto: textos.join("\n\n"), unidades: res };
}

async function assumir(admin: any, telefone: string, payload: string) {
  if (!payload.startsWith(PAYLOAD_ASSUMIR)) return { tratado: false };
  const alertaId = payload.slice(PAYLOAD_ASSUMIR.length);
  if (alertaId.startsWith("g:")) return await assumirGrupo(admin, telefone, alertaId.slice(2));
  const { data: al } = await admin.from("sla_alertas").select("id, exame_id, destino, destino_nome").eq("id", alertaId).maybeSingle();
  // o clique só vale do número para onde o alerta foi
  if (!al || !al.destino || !mesmoNumero(al.destino, telefone)) return { tratado: false };
  const sender = await remetente(admin);
  const agora = new Date().toISOString();
  // O mesmo clique chega mais de uma vez (o número recebe webhook pelas duas contas Chakra; em 12/11 o médico
  // recebeu "Laudo assumido" duas vezes). Só quem marca o alerta como respondido segue e confirma.
  const { data: marcou } = await admin.from("sla_alertas").update({ status: "respondido", respondido_em: agora })
    .eq("id", al.id).is("respondido_em", null).select("id");
  if (!marcou?.length) return { tratado: true, repetido: true, duplicado: true };
  const { data: ex } = await admin.from("sla_exames").select("id, unidade, origem, inicio_em, paciente, estudo, assumido_em, assumido_por").eq("id", al.exame_id).maybeSingle();
  if (!ex) return { tratado: true, exame: null };
  const desc = `${ORIGEM[ex.origem] ?? ex.origem}, exame das ${horaExame(ex.inicio_em)}`;
  if (ex.assumido_em) {
    await enviarTexto(sender, dig(telefone), `Este exame (${desc}) ja tinha sido assumido${ex.assumido_por ? ` por ${ex.assumido_por}` : ""}. Os avisos dele ja estao parados.`);
    return { tratado: true, repetido: true };
  }
  // Assume também as cópias do mesmo exame (mesmo paciente, estudo, hora e origem; ver chaveExame).
  const { data: abertos } = await admin.from("sla_exames").select("id, origem, inicio_em, paciente, estudo")
    .eq("unidade", ex.unidade).eq("origem", ex.origem).eq("inicio_em", ex.inicio_em).is("assumido_em", null).is("saiu_em", null);
  const ids = [ex.id, ...(abertos ?? []).filter((x: any) => x.id !== ex.id && chaveExame(x) === chaveExame(ex)).map((x: any) => x.id)];
  await admin.from("sla_exames").update({ assumido_em: agora, assumido_por: al.destino_nome, assumido_via: "whatsapp" }).in("id", ids).is("assumido_em", null);
  await enviarTexto(sender, dig(telefone), `Laudo assumido: ${desc}. Os avisos deste exame pararam. Obrigado!`);
  return { tratado: true, assumido: true };
}

function ehServiceRole(auth: string) {
  try {
    const p = JSON.parse(atob(auth.replace(/^Bearer\s+/i, "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p?.role === "service_role";
  } catch {
    return false;
  }
}

// Motivo legível da queda: _shared/slaEstacao.ts (texto por código do coletor e por unidade).
const motivoDe = (unidade: string, ultima: any, minNada: number | null) => motivoQueda(unidade, ultima, minNada, Math.min(LIMITE_MIN, SILENCIO_MIN));

// paraQuem: e-mail de um contato da aba Coordenação; sem ele, a lista fixa da coordenação (secret SLA_ALERTA_EMAILS).
const duracaoTexto = (min: number) => (min < 90 ? `${Math.round(min)} min` : `${Math.round(min / 60)} h`);

/** WhatsApp sobre a estação (parou, continua parada, voltou), pelo alertas-equipe (modelo gss_estacao_sla_v1). */
async function avisarEstacao(unidade: string, evento: "parou" | "continua" | "voltou", quando: string, detalhe: string) {
  try {
    const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/alertas-equipe`, {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "estacao", unidade: NOME_UNIDADE[unidade] ?? unidade, evento, quando, detalhe }),
    });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok && (j?.enviados ?? []).some((e: any) => e.wamid), resposta: j };
  } catch (e) {
    return { ok: false, erro: String((e as Error).message) };
  }
}

// E-mail da coordenação sobre exames (26/11, Raul: "muito e-mail"): saía um a cada rodada de 2 min (15 num dia), com o
// mesmo exame repetido. Agora as linhas da rodada vão para uma fila (config sla_email_fila) e sai no máximo 1 e-mail por
// hora, com uma linha por exame (a mais recente) e a falta de escala agrupada por modalidade.
const INTERVALO_EMAIL_SLA_MIN = 60;
async function emailResumoSla(admin: any, novas: string[]) {
  let fila: { linhas: string[]; ultimo: string | null } = { linhas: [], ultimo: null };
  try { fila = { linhas: [], ultimo: null, ...JSON.parse(await config(admin, "sla_email_fila") || "{}") }; } catch { /* fila nova */ }
  fila.linhas = [...fila.linhas, ...novas].slice(-300);
  const agora = Date.now();
  const pode = !fila.ultimo || agora - new Date(fila.ultimo).getTime() >= INTERVALO_EMAIL_SLA_MIN * 60_000;
  if (fila.linhas.length && pode) {
    // Uma linha por exame: a chave é o que vem antes de ": " ("Pronto Socorro, Fulano (TC), exame das 10:01").
    const porExame = new Map<string, string>();
    const semEscala = new Map<string, Set<string>>();
    for (const l of fila.linhas) {
      const m = l.match(/^(.*?): (.*?)\. Ninguém de (\S+) na escala de plantão agora\.$/);
      if (m) { const set = semEscala.get(m[3]) ?? new Set<string>(); set.add(m[1]); semEscala.set(m[3], set); continue; }
      porExame.set(l.split(": ")[0], l);
    }
    const blocos = [
      ...[...semEscala.entries()].map(([mod, ex]) => `Sem ninguém de ${mod} na escala: ${ex.size} exame(s) foram só para a coordenação. ${[...ex].slice(0, 6).join("; ")}${ex.size > 6 ? "; ..." : ""}.`),
      ...porExame.values(),
    ];
    const ok = await emailar(`SLA de laudos: resumo da última hora (${blocos.length} item(ns))`,
      blocos.join("\n\n") + "\n\nAcompanhe em Sigma › Radiologia › SLA ao vivo.", undefined, "Resumo do SLA de laudos: no máximo um e-mail por hora.");
    if (ok) fila = { linhas: [], ultimo: new Date(agora).toISOString() };
  }
  const valor = JSON.stringify(fila);
  const { data } = await admin.from("config_lista_items").update({ valor }).eq("campo_nome", "sla_email_fila").select("campo_nome");
  if (!data?.length) await admin.from("config_lista_items").insert({ campo_nome: "sla_email_fila", valor });
}

async function emailar(titulo: string, corpo: string, paraQuem?: string[], rodape = "Sigma GSS · SLA de laudos.") {
  const resend = Deno.env.get("RESEND_API_KEY");
  const fixos = (Deno.env.get("SLA_ALERTA_EMAILS") || Deno.env.get("MONITOR_WHATSAPP_EMAILS") || "").split(",").map((s) => s.trim());
  const para = (paraQuem?.some(Boolean) ? paraQuem : fixos).filter(Boolean);
  if (!resend || !para.length) return false;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Sigma GSS <avisos@gestaoservicosaude.com.br>", to: para, subject: titulo,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px"><p><b>${esc(titulo)}</b></p>`
        + `<p style="white-space:pre-line">${esc(corpo)}</p>`
        + `<p style="color:#9ca3af;font-size:12px">${esc(rodape)}</p></div>`,
      tags: [{ name: "origem", value: "sla_coletor" }],
    }),
  }).catch(() => null);
  return !!r?.ok;
}

const hora = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "nunca";

async function emailsDaEstacao(admin: any) {
  const { data } = await admin.from("config_lista_items").select("valor").eq("campo_nome", "sla_estacao_destinos").maybeSingle();
  try { return (JSON.parse(data?.valor || "[]") as { email?: string }[]).map((d) => String(d?.email || "").trim()).filter(Boolean); } catch { return []; }
}

/** Retrato das 4 estações por e-mail, para quem está em "Se a estação parar" (pedido do Raul, 25/11/2026). */
async function statusEstacoes(admin: any, enviar: boolean) {
  const linhas: string[] = [];
  for (const unidade of UNIDADES) {
    const { data: ok } = await admin.from("sla_leituras").select("lida_em").eq("unidade", unidade).eq("status", "ok")
      .order("lida_em", { ascending: false }).limit(1).maybeSingle();
    const { data: queda } = await admin.from("sla_coletor_quedas").select("aberta_em, motivo").eq("unidade", unidade)
      .is("fechada_em", null).maybeSingle();
    const nome = NOME_UNIDADE[unidade] ?? unidade;
    linhas.push(queda
      ? `• ${nome}: PARADA desde ${hora(queda.aberta_em)}. ${queda.motivo ?? ""}`.trim()
      : ok ? `• ${nome}: conectada, última leitura em ${hora(ok.lida_em)}.` : `• ${nome}: sem estação instalada.`);
  }
  const para = await emailsDaEstacao(admin);
  const paradas = linhas.filter((l) => l.includes("PARADA")).length;
  const titulo = paradas ? `SLA de laudos: ${paradas} estação(ões) parada(s)` : "SLA de laudos: todas as estações conectadas";
  const corpo = `Situação das estações agora:\n\n${linhas.join("\n")}\n\nA partir de agora vocês recebem este e-mail quando uma estação parar e quando voltar. `
    + "Acompanhe em Sigma › Radiologia › SLA ao vivo (faixa no topo).";
  const email = enviar && para.length ? await emailar(titulo, corpo, para) : false;
  return { para, titulo, linhas, email };
}

// Saúde do SLA (26/11, Raul: "monitorar os primeiros dias; o alerta tem que funcionar para a equipe saber sempre").
// Cron de 30 min. Procura o que faria o médico não saber de um exame e avisa a equipe (alertas-equipe, ação
// sla_saude: Brenda no horário comercial, Wagner fora dele) e o e-mail da coordenação. O mesmo problema (chave) só
// volta a avisar depois de 3 h (config sla_saude_avisos). Com os avisos desligados ou em modo teste, só calcula.
async function saudeSla(admin: any, enviar: boolean) {
  const agora = Date.now();
  const hora = new Date(agora - 60 * 60_000).toISOString();
  const problemas: { chave: string; resumo: string; detalhe: string }[] = [];

  // 1. Avisos que não chegaram (Meta ou Twilio) na última hora.
  const { data: falhas } = await admin.from("sla_alertas").select("canal, erro, destino_nome")
    .gte("criado_em", hora).eq("status", "falhou").in("canal", ["whatsapp", "ligacao"]).not("erro", "like", "teste interno%");
  if ((falhas ?? []).length >= 2) {
    const motivos = new Map<string, number>();
    for (const f of falhas!) motivos.set(String(f.erro || "sem motivo").slice(0, 70), (motivos.get(String(f.erro || "sem motivo").slice(0, 70)) ?? 0) + 1);
    const top = [...motivos.entries()].sort((a, b) => b[1] - a[1])[0];
    problemas.push({ chave: "falhas", resumo: `${falhas!.length} avisos nao chegaram aos medicos na ultima hora`,
      detalhe: `Motivo mais comum: ${top[0]} (${top[1]}). Para: ${[...new Set(falhas!.map((f: any) => f.destino_nome))].slice(0, 4).join(", ")}` });
  }

  // 2. Exame vencido há mais de 30 min, sem dono, sem nenhum aviso que tenha chegado (entregue, lido ou ligação atendida).
  const { data: vencidos } = await admin.from("sla_exames").select("id, unidade, origem, inicio_em, estudo")
    .is("saiu_em", null).is("ausente_em", null).is("assumido_em", null).is("silenciado_em", null).neq("origem", "externo")
    .lte("vence_em", new Date(agora - 30 * 60_000).toISOString()).gte("vence_em", new Date(agora - MAX_ATRASO_MIN * 60_000).toISOString());
  if ((vencidos ?? []).length) {
    const { data: chegou } = await admin.from("sla_alertas").select("exame_id")
      .in("exame_id", vencidos!.map((v: any) => v.id)).in("status", ["entregue", "lido", "respondido"]);
    const avisados = new Set((chegou ?? []).map((c: any) => c.exame_id));
    const sem = vencidos!.filter((v: any) => !avisados.has(v.id));
    if (sem.length) problemas.push({ chave: "vencido_sem_aviso", resumo: `${sem.length} exame(s) vencido(s) sem nenhum aviso entregue`,
      detalhe: sem.slice(0, 4).map((v: any) => `${NOME_UNIDADE[v.unidade] ?? v.unidade} ${ORIGEM[v.origem] ?? v.origem} ${horaExame(v.inicio_em)}${v.estudo ? ` ${String(v.estudo).slice(0, 30)}` : ""}`).join("; ") });
  }

  // 3. Escala de agora: modalidade sem ninguém ou plantonista sem telefone (Marieta, que vale para todas sem escala própria).
  const { data: agoraEscala } = await admin.from("sla_plantao").select("nome, telefone, modalidade, papel, unidade")
    .lte("inicio", new Date(agora).toISOString()).gt("fim", new Date(agora).toISOString()).eq("papel", "plantonista");
  const daMarieta = (agoraEscala ?? []).filter((p: any) => p.unidade === "marieta");
  for (const m of ["TC", "US"]) {
    if (!daMarieta.some((p: any) => !p.modalidade || p.modalidade === m)) {
      problemas.push({ chave: `sem_${m}`, resumo: `Ninguem de ${m === "TC" ? "tomografia" : "ultrassom"} na escala agora`,
        detalhe: `Exames de ${m} vao so para a coordenacao ate alguem entrar na escala. Confira o Dr. Escala` });
    }
  }
  const semFone = (agoraEscala ?? []).filter((p: any) => dig(p.telefone).length < 12);
  if (semFone.length) problemas.push({ chave: "sem_telefone", resumo: `${semFone.length} plantonista(s) sem telefone no Sigma`,
    detalhe: `${semFone.map((p: any) => p.nome).slice(0, 3).join(", ")}: cadastre o telefone em Medicos para o aviso chegar` });

  const ativo = (await config(admin, "sla_alertas_ativo")) === "true" && !dig(await config(admin, "sla_teste_destino"));
  let ultimos: Record<string, string> = {};
  try { ultimos = JSON.parse(await config(admin, "sla_saude_avisos") || "{}"); } catch { ultimos = {}; }
  const novos = problemas.filter((p) => !ultimos[p.chave] || agora - new Date(ultimos[p.chave]).getTime() > 3 * 3_600_000);
  const avisos: unknown[] = [];
  if (enviar && ativo && novos.length) {
    for (const p of novos) {
      const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/alertas-equipe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
        body: JSON.stringify({ acao: "sla_saude", resumo: p.resumo, detalhe: p.detalhe }),
      }).then((x) => x.json()).catch((e) => ({ erro: String(e) }));
      avisos.push({ chave: p.chave, whatsapp: r });
      ultimos[p.chave] = new Date(agora).toISOString();
    }
    await emailar(`SLA de laudos: ${novos.map((p) => p.resumo).join("; ")}`,
      novos.map((p) => `${p.resumo}. ${p.detalhe}.`).join("\n\n") + "\n\nAcompanhe em Sigma › Radiologia › SLA ao vivo.", await emailsDaEstacao(admin));
    const { error } = await admin.from("config_lista_items").update({ valor: JSON.stringify(ultimos) }).eq("campo_nome", "sla_saude_avisos").select("id");
    if (error || !(await config(admin, "sla_saude_avisos"))) {
      await admin.from("config_lista_items").insert({ campo_nome: "sla_saude_avisos", valor: JSON.stringify(ultimos) });
    }
  }
  return { ativo, problemas, avisados: avisos };
}

async function checarColetor(admin: any, unidades = UNIDADES) {
  const res: unknown[] = [];
  // E-mail de parou/voltou: os e-mails de "Se a estação parar" (aba Coordenação, 25/11); sem nenhum, a lista fixa.
  const emailsEstacao = await emailsDaEstacao(admin);
  for (const unidade of unidades) {
    // Leitura "viva": ok, ou lista vazia com o servidor do PACS respondendo (fila zerada de verdade, ex.: madrugada).
    const { data: ok } = await admin.from("sla_leituras").select("lida_em").eq("unidade", unidade)
      .or("status.eq.ok,detalhe->>motivo.eq.lista_vazia")
      .order("lida_em", { ascending: false }).limit(1).maybeSingle();
    const { data: ultimas } = await admin.from("sla_leituras").select("lida_em, status, detalhe").eq("unidade", unidade)
      .order("lida_em", { ascending: false }).limit(2);
    const ultima = ultimas?.[0] ?? null;
    // Unidade sem nenhuma leitura ainda (estação não instalada): não abre queda nem avisa.
    if (!ultima) { res.push({ unidade, pulado: "sem_estacao" }); continue; }
    const { data: aberta } = await admin.from("sla_coletor_quedas").select("id, aberta_em, whatsapp_em, motivo, ultima_ok_em").eq("unidade", unidade)
      .is("fechada_em", null).maybeSingle();

    // Para FECHAR uma queda, lista vazia não basta: precisa de uma leitura "ok" com linhas depois que a queda abriu
    // (é ela que atualiza a fila). Em 16/11 o PACS abriu por 3 min sem a lista, duas leituras "lista vazia" fecharam
    // a queda do fim de semana e o motor avisou a fila velha. Sem queda aberta, lista vazia segue contando (madrugada).
    let vivo = ok;
    if (aberta) {
      const { data: okReal } = await admin.from("sla_leituras").select("lida_em").eq("unidade", unidade).eq("status", "ok")
        .gt("lida_em", aberta.aberta_em).order("lida_em", { ascending: false }).limit(1).maybeSingle();
      vivo = okReal;
    }
    const minOk = vivo ? (Date.now() - new Date(vivo.lida_em).getTime()) / 60000 : null;
    const minNada = ultima ? (Date.now() - new Date(ultima.lida_em).getTime()) / 60000 : null;
    // Sem queda aberta, abre mais cedo quando a leitura não deixa dúvida (PACS fechado, VPN caída ou estação calada):
    // ver quedaRapida em _shared/slaEstacao.ts. Com queda aberta, só uma leitura "ok" nova fecha.
    const parado = minOk === null || minOk > LIMITE_MIN || (!aberta && quedaRapida(ultimas ?? [], minNada));
    // Queda aberta: o motivo acompanha a última leitura (25/11: Tijucas seguiu "PC desligado" com o PC ligado e o
    // login do portal expirado). É o texto que a tela de Radiologia mostra.
    const motivoAgora = motivoDe(unidade, ultima, minNada);
    if (aberta && parado && aberta.motivo !== motivoAgora) {
      await admin.from("sla_coletor_quedas").update({ motivo: motivoAgora }).eq("id", aberta.id);
    }

    if (parado && !aberta) {
      const motivo = motivoAgora;
      const zap = await avisarEstacao(unidade, "parou", `desde ${hora(ok?.lida_em ?? null)}`, motivo);
      await admin.from("sla_coletor_quedas").insert({ unidade, ultima_ok_em: ok?.lida_em ?? null, motivo, whatsapp_em: zap.ok ? new Date().toISOString() : null });
      const email = await emailar(`SLA de laudos: coletor parado (${unidade})`,
        `Ninguém está lendo a fila de laudos desde ${hora(ok?.lida_em ?? null)}.\n${motivo}\n\nEnquanto não voltar, os alertas de prazo não saem.`, emailsEstacao, "Estação do SLA de laudos: o aviso sai quando a leitura para e quando volta.");
      res.push({ unidade, evento: "caiu", email, whatsapp: zap });
    } else if (!parado && aberta) {
      await admin.from("sla_coletor_quedas").update({ fechada_em: new Date().toISOString() }).eq("id", aberta.id);
      // Duração real: da última leitura boa antes da queda até a volta (a queda pode abrir com 6 ou com 15 min).
      const min = Math.round((Date.now() - new Date(aberta.ultima_ok_em ?? aberta.aberta_em).getTime()) / 60000);
      const email = await emailar(`SLA de laudos: coletor voltou (${unidade})`,
        `A leitura da fila voltou às ${hora(vivo!.lida_em)}. Ficou parada cerca de ${min} min.`, emailsEstacao, "Estação do SLA de laudos: o aviso sai quando a leitura para e quando volta.");
      const zap = await avisarEstacao(unidade, "voltou", `às ${hora(vivo!.lida_em)}, depois de ${duracaoTexto(min)}`, "Os avisos de laudo voltaram a sair.");
      res.push({ unidade, evento: "voltou", email, whatsapp: zap });
    } else if (parado && aberta && (!aberta.whatsapp_em || Date.now() - new Date(aberta.whatsapp_em).getTime() > LEMBRETE_QUEDA_H * 3_600_000)) {
      const zap = await avisarEstacao(unidade, "continua", `parada desde ${hora(aberta.aberta_em)}`, motivoAgora);
      if (zap.ok) await admin.from("sla_coletor_quedas").update({ whatsapp_em: new Date().toISOString() }).eq("id", aberta.id);
      res.push({ unidade, evento: "lembrete", whatsapp: zap });
    } else {
      res.push({ unidade, parado, min_desde_ok: minOk === null ? null : Math.round(minOk) });
    }
  }
  return res;
}

// ── Ligação com voz (Twilio) ───────────────────────────────────────────────
// Número de origem em config_lista_items.sla_twilio_from (12/11: +16592006031, EUA, enquanto o +55 não é aprovado;
// cadastro regulatório BU647dee… em revisão). Credenciais: TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN (conta da GSS).
const esc = (t: string) => t.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c]!));
function comNove(t: string) {
  let d = dig(t).replace(/^55/, "");
  if (d.length === 10 && /^[6-9]$/.test(d[2])) d = d.slice(0, 2) + "9" + d.slice(2);
  return "55" + d;
}
// O roteiro vem de sla-voz: detecção de máquina (caixa postal não conta) e "aperte 1 para assumir". O status final
// da chamada volta por StatusCallback e fica no alerta (entregue, falhou com motivo, respondido).
// Botão "Assumir laudos" do aviso agrupado: assume todos os exames do grupo que ainda estão sem dono (e as cópias de
// cada um), com uma resposta só.
async function assumirGrupo(admin: any, telefone: string, grupo: string) {
  if (!/^[0-9a-f-]{36}$/i.test(grupo)) return { tratado: false };
  const { data: als } = await admin.from("sla_alertas").select("id, exame_id, destino, destino_nome").eq("grupo", grupo);
  if (!als?.length || !mesmoNumero(als[0].destino, telefone)) return { tratado: false };
  const agora = new Date().toISOString();
  const { data: marcou } = await admin.from("sla_alertas").update({ status: "respondido", respondido_em: agora })
    .eq("grupo", grupo).is("respondido_em", null).select("id");
  if (!marcou?.length) return { tratado: true, repetido: true, duplicado: true };
  const sender = await remetente(admin);
  const assumidos: string[] = [];
  for (const al of als) {
    const { data: ex } = await admin.from("sla_exames").select("id, unidade, origem, inicio_em, paciente, estudo, assumido_em").eq("id", al.exame_id).maybeSingle();
    if (!ex || ex.assumido_em) continue;
    const { data: abertos } = await admin.from("sla_exames").select("id, origem, inicio_em, paciente, estudo")
      .eq("unidade", ex.unidade).eq("origem", ex.origem).eq("inicio_em", ex.inicio_em).is("assumido_em", null).is("saiu_em", null);
    const ids = [ex.id, ...(abertos ?? []).filter((x: any) => x.id !== ex.id && chaveExame(x) === chaveExame(ex)).map((x: any) => x.id)];
    await admin.from("sla_exames").update({ assumido_em: agora, assumido_por: al.destino_nome, assumido_via: "whatsapp" }).in("id", ids).is("assumido_em", null);
    assumidos.push(`${ORIGEM[ex.origem] ?? ex.origem} ${horaExame(ex.inicio_em)}`);
  }
  await enviarTexto(sender, dig(telefone), assumidos.length
    ? `Laudos assumidos (${assumidos.length}): ${assumidos.join(", ")}. Os avisos destes exames pararam. Obrigado!`
    : "Estes exames ja tinham sido assumidos. Os avisos deles ja estao parados.");
  return { tratado: true, assumido: assumidos.length };
}

async function ligar(admin: any, para: string, alertaId: string, exato = false) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "", tok = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const de = await config(admin, "sla_twilio_from");
  if (!sid || !tok || !de) throw new Error("twilio_nao_configurado");
  const base = `${SLA_VOZ_URL}?a=${alertaId}&t=${await tokenAlerta(alertaId)}`;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`), "Content-Type": "application/x-www-form-urlencoded" },
    // Celular antigo de 8 dígitos (como o WhatsApp guarda) não existe na rede de voz: ganha o 9. Em 12/11 a ligação
    // de teste para 55 54 8435-1512 falhou por isso.
    body: new URLSearchParams({
      // AsyncAmd: a voz começa assim que atende e a detecção de caixa postal roda em paralelo (sla-voz p=amd derruba
      // a ligação se for máquina). Sem isso o Twilio ficava segundos em silêncio analisando e quem atendia desligava
      // achando que era engano: teste com o Raul em 13/11, iPhone, "recebi a ligação mas não falou nada".
      // DetectMessageEnd (24/11): com "Enable" o Twilio dava machine_start para quem atendia calado e a ligação caía
      // na cara (Raul e Ramone, 24/11). Mesmo machine_end_beep errou com o Raul calado: desde 24/11 o sla-voz não
      // derruba mais por detecção, só anota "possivel caixa postal" (e a fala não diz o nome do paciente).
      To: `+${exato ? dig(para) : comNove(para)}`, From: de, Timeout: "30", MachineDetection: "DetectMessageEnd", AsyncAmd: "true",
      AsyncAmdStatusCallback: `${base}&p=amd`, AsyncAmdStatusCallbackMethod: "POST",
      Url: `${base}&p=inicio`, StatusCallback: `${base}&p=status`, StatusCallbackEvent: "completed",
    }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`twilio ${r.status}: ${b.message ?? JSON.stringify(b).slice(0, 200)}`);
  await admin.from("sla_alertas").update({ status: "enviado", mensagem_id: b.sid }).eq("id", alertaId);
  return b.sid as string;
}

// Saldo do Twilio (24/11): as ligações do SLA consomem crédito pré-pago da conta da GSS; sem saldo a ligação falha
// calada (erro 13227). Cron diário (sla-twilio-saldo, 9h): abaixo do limite (config sla_twilio_saldo_min, padrão 10
// na moeda da conta), e-mail para a lista da coordenação pedindo recarga. Volta a avisar todo dia enquanto estiver baixo.
async function saldoTwilio(enviar: boolean) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "", tok = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const b = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, {
    headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`) },
  }).then((r) => r.json()).catch(() => ({}));
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const limite = Number((await config(admin, "sla_twilio_saldo_min")) || 10);
  const saldo = Number(b?.balance);
  if (!Number.isFinite(saldo)) return { ok: false, erro: "saldo ilegível" };
  const baixo = saldo < limite;
  let avisou = false;
  if (baixo && enviar) {
    avisou = await emailar(`Sigma SLA: saldo do Twilio baixo (${saldo.toFixed(2)} ${b.currency})`,
      `O saldo da conta Twilio que faz as ligações do SLA de laudos está em ${saldo.toFixed(2)} ${b.currency}, abaixo do ` +
      `limite de ${limite}. Sem saldo, as ligações para o médico de plantão param de sair. Recarregue em console.twilio.com ` +
      `(conta da GSS, e-mail bi@gestaoservicosaude.com.br).`);
  }
  return { ok: true, saldo, moeda: b.currency, limite, baixo, avisou };
}

async function statusLigacao(callSid: string) {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "", tok = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const b = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}.json`, {
    headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`) },
  }).then((r) => r.json());
  // Ligação "failed" com 0 s não diz o porquê na própria chamada: o código vem nas notificações (ex.: 21215
  // permissão geográfica, 13227 sem saldo). Saldo junto porque é a causa mais comum.
  const auth = { headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`) } };
  const notas = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls/${callSid}/Notifications.json`, auth)
    .then((r) => r.json()).catch(() => ({}));
  const saldo = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Balance.json`, auth).then((r) => r.json()).catch(() => ({}));
  const erros = (notas.notifications ?? []).map((n: { error_code?: string; message_text?: string }) =>
    `${n.error_code ?? ""} ${decodeURIComponent((n.message_text ?? "").replace(/\+/g, " ")).slice(0, 200)}`.trim());
  // Erro de origem/regulatório às vezes só aparece no Monitor (alertas da conta), não na chamada.
  const mon = await fetch(`https://monitor.twilio.com/v1/Alerts?PageSize=5`, auth).then((r) => r.json()).catch(() => ({}));
  const alertas = (mon.alerts ?? []).map((a: { error_code?: string; date_created?: string; alert_text?: string; resource_sid?: string }) =>
    `${a.date_created} ${a.error_code} ${a.resource_sid === callSid ? "(esta)" : ""} ${decodeURIComponent((a.alert_text ?? "").replace(/\+/g, " ")).slice(0, 160)}`);
  // Números da conta: a origem precisa estar aqui (comprado) ou em caller ids verificados, com voz.
  const nums = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json`, auth).then((r) => r.json()).catch(() => ({}));
  const numeros = (nums.incoming_phone_numbers ?? []).map((n: { phone_number?: string; status?: string; capabilities?: { voice?: boolean } }) =>
    `${n.phone_number} ${n.status ?? ""} voz=${n.capabilities?.voice}`);
  const ult = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json?PageSize=5`, auth).then((r) => r.json()).catch(() => ({}));
  const ultimas = (ult.calls ?? []).map((c: { date_created?: string; from?: string; status?: string; duration?: string }) =>
    `${c.date_created} de ${c.from} ${c.status} ${c.duration}s`);
  // Voice Insights (25/11): "failed 0 s" sem notificação; o código SIP da operadora só aparece no resumo da chamada.
  const ins = await fetch(`https://insights.twilio.com/v1/Voice/${callSid}/Summary`, auth).then((r) => r.json()).catch(() => ({}));
  const operadora = { sip: ins?.carrier_edge?.metrics?.outbound?.sip_response_code ?? ins?.sip_response_code ?? null,
    quem_desligou: ins?.properties?.disconnected_by ?? null, motivo: ins?.properties?.last_sip_response_num ?? null,
    estado: ins?.call_state ?? null, tags: ins?.tags ?? null, erro_insights: ins?.message ?? null };
  return { status: b.status, duracao: b.duration, de: b.from, para: b.to, atendido_por: b.answered_by ?? null, operadora, erros, alertas, numeros, ultimas, saldo: saldo.balance, moeda: saldo.currency };
}

// Quem chama: o cron (JWT service_role do Vault) e o chakra-webhook (SUPABASE_SERVICE_ROLE_KEY, que não é JWT e o
// gateway recusava com 401 — o clique em "Assumir laudo" falhou assim em 12/11). Por isso verify_jwt = false e a
// checagem é aqui: chave igual à do ambiente, ou JWT service_role confirmado por uma leitura que só ele consegue.
async function autorizado(auth: string) {
  const chave = auth.replace(/^Bearer\s+/i, "").trim();
  if (!chave) return false;
  if (chave === (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim()) return true;
  if (!ehServiceRole(auth)) return false;
  const { error } = await createClient(Deno.env.get("SUPABASE_URL")!, chave, { auth: { persistSession: false } })
    .from("integracao_segredos").select("nome").limit(1);
  return !error;
}

Deno.serve(async (req) => {
  if (!(await autorizado(req.headers.get("Authorization") || ""))) return json({ ok: false, error: "sem_permissao" }, 401);
  const body = await req.json().catch(() => ({}));
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    await carregarRegras(admin);
    if (body.acao === "ligar_teste") {
      // Exame e alerta de teste na unidade "teste" (PS vencido há 15 min), para a ligação ter roteiro de verdade.
      const agora = Date.now();
      const { data: ex } = await admin.from("sla_exames").insert({
        unidade: "teste", data_exame: new Date(agora).toISOString().slice(0, 10), hora_min: "00:00", ordem: Math.floor(Math.random() * 1e6),
        origem: "ps", hora_exame: "00:00", inicio_em: new Date(agora - 135 * 60000).toISOString(), vence_em: new Date(agora - 15 * 60000).toISOString(),
        visto_primeiro_em: new Date(agora).toISOString(), visto_ultimo_em: new Date(agora).toISOString(),
      }).select("id").single();
      if (!ex) throw new Error("exame de teste não criado");
      const { data: al } = await admin.from("sla_alertas").insert({
        exame_id: ex.id, tipo: "vencido", papel: "plantonista", destino_nome: String(body.nome || "Teste"), destino: dig(body.telefone), canal: "ligacao",
      }).select("id").single();
      if (!al) throw new Error("alerta de teste não criado");
      return json({ ok: true, alerta: al.id, ligacao: await ligar(admin, String(body.telefone || ""), al.id, body.exato === true) });
    }
    if (body.acao === "whats_teste") {
      // 25/11 (Raul): mostrar a quem vai receber como chega o WhatsApp do SLA (perto do prazo e vencido) e o botão
      // Assumir laudo. Exame fictício na unidade "teste", modelos v1 (sem nome de paciente).
      const tel = dig(body.telefone);
      if (tel.length < 12) throw new Error("telefone com DDI e DDD");
      const sender = await remetente(admin);
      const agora = Date.now();
      const out = [];
      for (const [tipo, desloc] of [["prazo", 20], ["vencido", -15]] as const) {
        const vence = agora + desloc * 60000;
        const { data: ex } = await admin.from("sla_exames").insert({
          unidade: "teste", data_exame: new Date(agora).toISOString().slice(0, 10), hora_min: "00:00", ordem: Math.floor(Math.random() * 1e6),
          origem: "ps", hora_exame: "00:00", inicio_em: new Date(vence - 120 * 60000).toISOString(), vence_em: new Date(vence).toISOString(),
          visto_primeiro_em: new Date(agora).toISOString(), visto_ultimo_em: new Date(agora).toISOString(),
        }).select("id, inicio_em").single();
        if (!ex) throw new Error("exame de teste não criado");
        const { data: al } = await admin.from("sla_alertas").insert({
          exame_id: ex.id, tipo, papel: "plantonista", destino_nome: String(body.nome || "Teste"), destino: tel, canal: "whatsapp",
        }).select("id").single();
        if (!al) throw new Error("alerta de teste não criado");
        const wamid = await enviarModelo(sender, tel, `gss_sla_laudo_${tipo}_v1`, ["Pronto Socorro", "Teste", horaExame(ex.inicio_em), duracao(Math.abs(desloc))], al.id);
        await admin.from("sla_alertas").update({ status: wamid ? "enviado" : "falhou", mensagem_id: wamid }).eq("id", al.id);
        out.push({ tipo, alerta: al.id, wamid });
      }
      return json({ ok: true, enviados: out });
    }
    if (body.acao === "caller_ids") {
      const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "", tok = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
      const b = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/OutgoingCallerIds.json`, {
        headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`) } }).then((r) => r.json());
      return json({ ok: true, verificados: (b.outgoing_caller_ids ?? []).map((c: any) => `${c.phone_number} ${c.friendly_name}`) });
    }
    if (body.acao === "verificar_caller_id") {
      // 25/11: a ligação do SLA passa a sair com um número da própria GSS (Verified Caller ID). O Twilio liga para o
      // número e a pessoa digita o código devolvido aqui. Depois, sla_twilio_from aponta para esse número.
      const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "", tok = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/OutgoingCallerIds.json`, {
        method: "POST", headers: { Authorization: "Basic " + btoa(`${sid}:${tok}`), "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ PhoneNumber: `+${dig(body.telefone)}`, FriendlyName: String(body.nome || "GSS"), CallDelay: "5" }),
      });
      const b = await r.json();
      return json({ ok: r.ok, codigo: b.validation_code ?? null, numero: b.phone_number ?? null, erro: r.ok ? null : b.message ?? b });
    }
    if (body.acao === "indicadores") return json({ ok: true, ...(await indicadores(admin, Array.isArray(body.unidades) ? body.unidades.map(String) : UNIDADES, new Date(), body.enviar !== false)) });
    if (body.acao === "status_ligacao") return json({ ok: true, ...(await statusLigacao(String(body.sid || ""))) });
    if (body.acao === "exames") return json({ ok: true, exames: await checarExames(admin, !!body.forcar, Array.isArray(body.unidades) ? body.unidades.map(String) : UNIDADES, body.teste === true) });
    if (body.acao === "assumir") return json({ ok: true, ...(await assumir(admin, String(body.telefone || ""), String(body.payload || ""))) });
    if (body.acao === "status_templates") return json({ ok: true, modelos: await statusTemplates(admin) });
    if (body.acao === "criar_templates") return json({ ok: true, modelos: await criarTemplates(admin, !!body.dry_run, Array.isArray(body.nomes) ? body.nomes.map(String) : undefined) });
    // body.unidades só para teste manual (ex.: ["teste"]); o cron não manda.
    if (body.acao === "saldo_twilio") return json(await saldoTwilio(body.enviar !== false));
    if (body.acao === "status_estacoes") return json({ ok: true, ...(await statusEstacoes(admin, body.enviar !== false)) });
    if (body.acao === "saude") return json({ ok: true, ...(await saudeSla(admin, body.enviar !== false)) });
    if (body.acao === "coletor") return json({ ok: true, coletor: await checarColetor(admin, Array.isArray(body.unidades) ? body.unidades.map(String) : UNIDADES) });
    return json({ ok: false, error: "acao" }, 400);
  } catch (e) {
    console.error("[sla-alertas]", e);
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
