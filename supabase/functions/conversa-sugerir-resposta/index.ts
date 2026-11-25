// "Sugerir resposta" da tela Conversas (pedido do Heron, reunião 24/11/2026): a IA lê a conversa e devolve o texto
// para a caixa de mensagem. Nunca envia nada: quem envia é a pessoa, pela whatsapp-oficial-send, como sempre.
//
// Entrada: { conversation_id }. Saída:
//   janela de 24 h aberta  -> { texto, sugestao_id }
//   janela fechada         -> { fora_janela: true, modelo_sugerido: { template_id, friendly_name, motivo } | null, sugestao_id }
// Quem pode: usuário logado que vê a tela Conversas (módulo "disparos", o mesmo da rota) — o envio só exige login.
// Portão de LGPD: só números cujo tipo (whatsapp_chakra_connections.uso) está em supabase_config.sugestao_resposta_usos
// (começa em ["prospeccao"]: essas conversas já são lidas pela IA da campanha). Fora da lista: 403.
// Motor (Raul, 25/11): primeiro o Claude da GSS (Hermes na VPS, rotina ia_claude_sugerir_resposta,
// docs/arquitetura/motor-ia-hermes-claude.md), no mesmo molde de campanha-assistente-ia; sem login, erro ou mais de
// 25 s, o Gemini da IA das campanhas responde (GEMINI_API_KEY, flash e reserva flash-lite). As mesmas instruções
// servem aos dois. A resposta diz qual motor respondeu ("claude" ou "gemini") e conversa_sugestoes.motor guarda.
// Medição: cada sugestão vira linha em conversa_sugestoes; a tela marca o envio (texto enviado, se saiu sem edição).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { briefingPublico, regrasDaCampanha } from "../_shared/sigilo.ts";
import {
  type Contexto, escolhaDoModelo, janelaAberta, lerUsosLiberados, limparSugestao, type MensagemConversa, type ModeloAprovado,
  oportunidadeDoBriefing, promptModelo, promptTexto, transcricao, usoDoNumero,
} from "./logica.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const MODELOS_IA = ["gemini-3.5-flash", "gemini-3.5-flash-lite"];
const ULTIMAS = 30;

// Mesma troca de modelo das outras edges de IA: 404/429/503 passa para a reserva; outro erro para na hora.
// 20 s por modelo: o flash às vezes passa de 40 s no primeiro pedido (17/11) e a tela não pode ficar presa.
async function gemini(sistema: string, pedido: string, jsonOut: boolean): Promise<{ texto: string; modelo: string }> {
  const chave = Deno.env.get("GEMINI_API_KEY");
  if (!chave) throw new Error("GEMINI_API_KEY ausente");
  let ultimoErro = "";
  for (const modelo of MODELOS_IA) {
    let r: Response;
    try {
      r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": chave, "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: sistema }] },
          contents: [{ role: "user", parts: [{ text: pedido }] }],
          generationConfig: { temperature: 0.4, ...(jsonOut ? { responseMimeType: "application/json" } : {}) },
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (e) {
      ultimoErro = `${modelo}: ${(e as Error).message}`;
      continue;
    }
    const corpo = await r.json().catch(() => ({}));
    if (r.ok) {
      // deno-lint-ignore no-explicit-any
      const texto = corpo.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
      if (texto.trim()) return { texto, modelo };
      ultimoErro = `${modelo}: resposta vazia (${corpo.candidates?.[0]?.finishReason || "?"})`;
      continue;
    }
    ultimoErro = `${modelo}: ${corpo?.error?.status || r.status} ${String(corpo?.error?.message || "").slice(0, 120)}`;
    if (![404, 429, 503].includes(r.status)) break;
  }
  throw new Error(ultimoErro || "sem resposta da IA");
}

// deno-lint-ignore no-explicit-any
type Svc = any;
const TIPO_CLAUDE = "ia_claude_sugerir_resposta";
const ESPERA_CLAUDE_MS = 25_000;

// O Claude está ligado? Mesma leitura de campanha-assistente-ia: vale o último pedido do motor que terminou. Sem
// login nenhum a edge vai direto ao Gemini, sem esperar a VPS.
async function claudeLigado(svc: Svc): Promise<boolean> {
  const { data } = await svc.from("rotina_pedidos").select("tipo, status, resultado, erro")
    .in("tipo", ["ia_claude_situacao", "ia_claude_codigo", "ia_claude_teste", "ia_claude_sair", "ia_claude_assistente_campanha", TIPO_CLAUDE])
    .in("status", ["feito", "erro"]).order("concluido_em", { ascending: false }).limit(10);
  for (const p of data || []) {
    if (p.tipo === "ia_claude_sair" && p.status === "feito") return false;
    if (p.tipo === "ia_claude_codigo" && p.status === "feito") return true;
    if (p.tipo === "ia_claude_situacao" && p.status === "feito") return !!p.resultado?.conectado;
    if (p.tipo === "ia_claude_teste" && p.status === "feito") return !!p.resultado?.ok;
    if (p.tipo === "ia_claude_assistente_campanha" || p.tipo === TIPO_CLAUDE) return !String(p.erro || "").includes("sem-login");
  }
  return false;
}

// Pede ao worker da VPS (laço rápido) e espera até 25 s: a pessoa está olhando a tela. null = cai no Gemini.
// O pedido leva a conversa com o médico: a fila esconde este tipo da tela, o worker apaga o payload ao concluir e
// aqui o resultado é apagado logo depois de lido (LGPD; migração 20261125110000).
async function pedirAoClaude(svc: Svc, sistema: string, pedido: string, jsonOut: boolean): Promise<string | null> {
  const { data: id, error } = await svc.rpc("rotina_pedir", {
    p_tipo: TIPO_CLAUDE, p_payload: { instrucoes: sistema, pedido, formato: jsonOut ? "json" : "texto" },
  });
  if (error || !id) return null;
  const limpar = () => svc.from("rotina_pedidos").update({ payload: {}, resultado: null }).eq("id", id).then(() => null, () => null);
  const limite = Date.now() + ESPERA_CLAUDE_MS;
  while (Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 1500));
    const { data: p } = await svc.from("rotina_pedidos").select("status, resultado").eq("id", id).single();
    if (p?.status === "feito") {
      await limpar();
      const r = p.resultado || {};
      return jsonOut ? (r.json ? JSON.stringify(r.json) : null) : (typeof r.texto === "string" ? r.texto : null);
    }
    if (p?.status === "erro") { await limpar(); return null; }
  }
  // Desistiu: se a VPS ainda não pegou, tira da fila para não gastar a cota com resposta que ninguém vai ler.
  await svc.from("rotina_pedidos").update({ status: "erro", erro: "a edge desistiu de esperar", concluido_em: new Date().toISOString(), payload: {} })
    .eq("id", id).eq("status", "pendente");
  // Se já estava executando, o worker ainda conclui; o payload some na conclusão (rotina_concluir).
  return null;
}

type Resposta = { texto: string; motor: "claude" | "gemini"; modelo: string | null };

/** Claude primeiro (quando há login), Gemini de reserva. */
async function gerar(svc: Svc, sistema: string, pedido: string, jsonOut: boolean): Promise<Resposta> {
  if (await claudeLigado(svc).catch(() => false)) {
    const t = await pedirAoClaude(svc, sistema, pedido, jsonOut).catch(() => null);
    if (t && t.trim()) return { texto: t, motor: "claude", modelo: "claude-sonnet (hermes)" };
  }
  const g = await gemini(sistema, pedido, jsonOut);
  return { texto: g.texto, motor: "gemini", modelo: g.modelo };
}

const primeiroNome = (s: string | null | undefined) => String(s || "").trim().split(/\s+/)[0] || null;
const MINUSCULAS = new Set(["de", "da", "do", "das", "dos", "e"]);
// Nome vem do CRM em caixa alta ("LARA COSTA"); a IA copiaria assim para a mensagem.
const nomeProprio = (s: string | null | undefined) => !s ? null : s === s.toUpperCase()
  ? s.toLowerCase().split(/\s+/).map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ")
  : s;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const { data: u } = await svc.auth.getUser(jwt);
  if (!u?.user) return json({ error: "Entre no Sigma de novo." }, 401);
  const userId = u.user.id;

  const { data: podeVer } = await svc.rpc("pode_modulo", { p_uid: userId, p_modulo: "disparos", p_acao: "visualizar" });
  if (!podeVer) return json({ error: "Você não tem acesso às Conversas." }, 403);

  const body = await req.json().catch(() => ({}));
  const conversaId = String(body.conversation_id || "");
  if (!/^[0-9a-f-]{36}$/i.test(conversaId)) return json({ error: "Conversa inválida." }, 400);

  const { data: conv } = await svc.from("sigzap_conversations")
    .select("id, instance_id, lead_id, service_window_expires_at, contact:sigzap_contacts(contact_name)")
    .eq("id", conversaId).maybeSingle();
  if (!conv) return json({ error: "Conversa não encontrada." }, 404);
  const { data: inst } = await svc.from("sigzap_instances").select("phone_number, provider").eq("id", conv.instance_id).maybeSingle();
  if (!inst || inst.provider !== "chakra") return json({ error: "Só conversas dos números oficiais." }, 409);

  const [{ data: conexao }, { data: cfg }] = await Promise.all([
    svc.from("whatsapp_chakra_connections").select("uso").eq("phone_e164", inst.phone_number).limit(1).maybeSingle(),
    svc.from("supabase_config").select("valor").eq("chave", "sugestao_resposta_usos").maybeSingle(),
  ]);
  const uso = usoDoNumero(conexao?.uso);
  if (!lerUsosLiberados(cfg?.valor).includes(uso)) {
    return json({ error: "Sugestão de resposta liberada só para números de prospecção até o ok de LGPD.", codigo: "uso_nao_liberado", uso }, 403);
  }

  // Últimas 30 mensagens (desc no banco, cronológica no prompt). Desempate por id para a ordem não variar.
  const { data: ultimas } = await svc.from("sigzap_messages")
    .select("from_me, message_text, message_type, media_caption, sent_at")
    .eq("conversation_id", conversaId).order("sent_at", { ascending: false }).order("id", { ascending: false }).limit(ULTIMAS);
  const msgs = ((ultimas || []) as MensagemConversa[]).slice().reverse();
  const ultimaDoContato = [...msgs].reverse().find((m) => !m.from_me)?.sent_at || null;
  const aberta = janelaAberta(conv.service_window_expires_at, ultimaDoContato);
  if (aberta && !msgs.length) return json({ error: "A conversa ainda não tem mensagens para a IA ler." }, 422);

  // Contexto: cadastro do contato, campanha mais recente dele (briefing sem o que é sigiloso) e quem vai enviar.
  let contato: Contexto["contato"] = null;
  let campanha: Contexto["campanha"] = null;
  if (conv.lead_id) {
    const [{ data: lead }, { data: cl }] = await Promise.all([
      svc.from("leads").select("nome, especialidade, cidade, uf").eq("id", conv.lead_id).maybeSingle(),
      svc.from("campanha_leads").select("campanhas(nome, briefing_ia)").eq("lead_id", conv.lead_id)
        .order("updated_at", { ascending: false }).order("id").limit(1).maybeSingle(),
    ]);
    if (lead) contato = { nome: nomeProprio(lead.nome), especialidade: lead.especialidade, cidade: lead.cidade, uf: lead.uf };
    // deno-lint-ignore no-explicit-any
    const camp = (cl as any)?.campanhas;
    if (camp?.nome) {
      const b = briefingPublico((camp.briefing_ia || {}) as Record<string, unknown>);
      campanha = { nome: camp.nome, oportunidade: oportunidadeDoBriefing(b), regras: regrasDaCampanha(b, String(b.handoff_nome || "a equipe")) };
    }
  }
  // deno-lint-ignore no-explicit-any
  const nomeContato = (conv as any).contact?.contact_name as string | null;
  if (!contato && nomeContato) contato = { nome: nomeContato, especialidade: null, cidade: null, uf: null };
  const { data: perfil } = await svc.from("profiles").select("nome_completo").eq("id", userId).maybeSingle();
  const ctx: Contexto = { uso, remetente: primeiroNome(perfil?.nome_completo), contato, campanha };
  const conversa = transcricao(msgs);

  try {
    if (aberta) {
      const p = promptTexto(ctx, conversa);
      const g = await gerar(svc, p.sistema, p.pedido, false);
      const texto = limparSugestao(g.texto);
      if (!texto) throw new Error("resposta vazia");
      const { data: s } = await svc.from("conversa_sugestoes")
        .insert({ conversation_id: conversaId, user_id: userId, tipo: "texto", texto_sugerido: texto, modelo_ia: g.modelo, motor: g.motor })
        .select("id").single();
      return json({ texto, motor: g.motor, sugestao_id: s?.id ?? null });
    }

    // Janela fechada: a Meta só aceita modelo aprovado. Mesma lista que a tela mostra (RPC conversa_modelos), chamada
    // com o JWT da pessoa porque a RPC exige auth.uid().
    const usr = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
    const { data: lista, error: erroLista } = await usr.rpc("conversa_modelos", { p_conversation_id: conversaId });
    if (erroLista) throw new Error(erroLista.message);
    const modelos = (lista || []) as ModeloAprovado[];
    if (!modelos.length) return json({ fora_janela: true, modelo_sugerido: null, sugestao_id: null });
    let escolha = { modelo: modelos[0], motivo: null as string | null };
    let modeloIa: string | null = null;
    let motor: "claude" | "gemini" | null = null; // um modelo só: escolha direta, sem IA
    if (modelos.length > 1) {
      const p = promptModelo(ctx, conversa, modelos);
      const g = await gerar(svc, p.sistema, p.pedido, true);
      modeloIa = g.modelo;
      motor = g.motor;
      escolha = escolhaDoModelo(g.texto, modelos) || escolha;
    }
    const { data: s } = await svc.from("conversa_sugestoes")
      .insert({ conversation_id: conversaId, user_id: userId, tipo: "modelo", texto_sugerido: escolha.modelo.body, template_id: escolha.modelo.template_id, modelo_ia: modeloIa, motor })
      .select("id").single();
    return json({
      fora_janela: true,
      motor,
      modelo_sugerido: { template_id: escolha.modelo.template_id, friendly_name: escolha.modelo.friendly_name, motivo: escolha.motivo },
      sugestao_id: s?.id ?? null,
    });
  } catch (e) {
    console.error("[conversa-sugerir-resposta]", conversaId, (e as Error).message);
    return json({ error: "A IA não conseguiu sugerir agora. Tente de novo em alguns segundos." }, 502);
  }
});
