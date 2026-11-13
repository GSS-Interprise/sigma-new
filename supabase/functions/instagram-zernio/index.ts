// Instagram pelo Zernio: traz as respostas dos médicos e envia a resposta da equipe (docs/arquitetura/linkedin-instagram-campanha.md).
//   { action: "sincronizar" }              → pg_cron a cada 3 min (service role)
//   { action: "enviar", lead_id, texto }   → equipe responde de dentro do Sigma (usuário logado)
//
// PRIVACIDADE (regra que molda tudo aqui): a conta do Zernio é o Instagram pessoal do Dr. Maikon, que também conversa
// com pacientes. Só é gravada a conversa cujo @ é de um médico com toque de Instagram feito pela fila nos últimos 90 dias.
// Todo o resto da caixa é lido em memória para filtrar e descartado; nada dele vai para o banco nem para o log.
// Por isso a integração é por consulta, não por webhook: o webhook da conta já é do CRM do Maikon e mandaria tudo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { handleInstagram as handleDe, janelaAberta, mensagemDaEmpresa } from "../_shared/redes.ts";

const BASE = "https://zernio.com/api/v1";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function zernio(path: string, init: RequestInit = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${Deno.env.get("ZERNIO_API_KEY")}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const texto = await r.text();
  let corpo: any = null;
  try { corpo = JSON.parse(texto); } catch { /* sem corpo JSON */ }
  return { ok: r.ok, status: r.status, corpo, texto };
}

async function ehServiceRole(token: string) {
  if (token && token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return true;
  try {
    const p = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (p?.role !== "service_role") return false;
  } catch { return false; }
  const { error } = await createClient(Deno.env.get("SUPABASE_URL")!, token, { auth: { persistSession: false } })
    .from("integracao_segredos").select("nome").limit(1);
  return !error;
}

// Médicos que a equipe já chamou no Instagram pela fila: @ → (lead, campanha_lead mais recente).
async function medicosChamados(admin: any) {
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const { data: toques } = await admin.from("campanha_toques").select("campanha_lead_id, executado_em")
    .eq("canal", "instagram").in("status", ["feito", "respondido"]).gte("executado_em", desde).order("executado_em", { ascending: true });
  const clIds = [...new Set((toques || []).map((t: any) => t.campanha_lead_id))];
  const mapa = new Map<string, { lead_id: string; campanha_lead_id: string }>();
  for (let i = 0; i < clIds.length; i += 200) {
    const { data } = await admin.from("campanha_leads").select("id, lead_id, leads!inner(instagram_handle)").in("id", clIds.slice(i, i + 200));
    for (const c of data || []) {
      const h = handleDe((c as any).leads?.instagram_handle);
      if (h) mapa.set(h, { lead_id: c.lead_id, campanha_lead_id: c.id }); // toque mais recente vence (ordem ascendente)
    }
  }
  return mapa;
}

async function sincronizar(admin: any) {
  const medicos = await medicosChamados(admin);
  // Ninguém chamado no Instagram ainda: nem consulta a caixa da conta.
  if (medicos.size === 0) {
    await admin.from("instagram_sync").update({ rodou_em: new Date().toISOString(), erro: null }).eq("id", 1);
    return { medicos_na_fila: 0, conversas: 0, mensagens_novas: 0 };
  }
  const { data: estado } = await admin.from("instagram_sync").select("ate").eq("id", 1).single();
  // Margem de 10 min: a ordem da lista é por "updatedTime" e duas atualizações no mesmo instante não podem escapar.
  const corte = estado?.ate ? new Date(new Date(estado.ate).getTime() - 10 * 60_000) : new Date(Date.now() - 7 * 86_400_000);
  let maisNova: string | null = null;
  let cursor: string | null = null;
  let novas = 0, conversas = 0;
  for (let pagina = 0; pagina < 10; pagina++) {
    const r = await zernio(`/inbox/conversations?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (!r.ok) throw new Error(`Zernio respondeu ${r.status} na lista de conversas`);
    const lista: any[] = r.corpo?.data || [];
    let passou = false;
    for (const c of lista) {
      const atualizada = c.updatedTime ? new Date(c.updatedTime) : null;
      if (atualizada && !maisNova) maisNova = atualizada.toISOString();
      if (atualizada && atualizada < corte) { passou = true; break; }
      if (String(c.platform || "instagram").toLowerCase() !== "instagram") continue;
      const medico = medicos.get(handleDe(c.participantUsername));
      if (!medico) continue; // não é médico da fila: descarta sem gravar nada
      conversas++;
      novas += await trazerConversa(admin, c, medico);
    }
    cursor = r.corpo?.pagination?.hasMore ? r.corpo.pagination.nextCursor : null;
    if (passou || !cursor) break;
  }
  await admin.from("instagram_sync").update({ ate: maisNova ?? estado?.ate ?? null, rodou_em: new Date().toISOString(), erro: null }).eq("id", 1);
  return { medicos_na_fila: medicos.size, conversas, mensagens_novas: novas };
}

async function trazerConversa(admin: any, c: any, medico: { lead_id: string; campanha_lead_id: string }) {
  const convId = String(c.id);
  await admin.from("instagram_conversas").upsert({
    zernio_conversation_id: convId, zernio_account_id: String(c.accountId), lead_id: medico.lead_id,
    campanha_lead_id: medico.campanha_lead_id, handle: handleDe(c.participantUsername),
  }, { onConflict: "zernio_conversation_id" });

  // accountId é obrigatório nesta rota (400 sem ele).
  const r = await zernio(`/inbox/conversations/${encodeURIComponent(convId)}/messages?accountId=${encodeURIComponent(String(c.accountId))}&limit=30`);
  if (!r.ok) throw new Error(`Zernio respondeu ${r.status} nas mensagens`);
  const msgs: any[] = r.corpo?.data || r.corpo?.messages || [];
  let novas = 0, ultimaDoMedico: string | null = null, ultima: string | null = null, recebeuNova = false;
  for (const m of msgs) {
    const id = m.id || m._id || m.messageId;
    const daEmpresa = mensagemDaEmpresa(m, String(c.accountId));
    const em = m.createdTime || m.createdAt || m.timestamp;
    const quando = em ? new Date(em).toISOString() : new Date().toISOString();
    if (!ultima || quando > ultima) ultima = quando;
    if (!daEmpresa && (!ultimaDoMedico || quando > ultimaDoMedico)) ultimaDoMedico = quando;
    const texto = String(m.text || m.message || m.body || m.content || "");
    const tipo = texto ? "texto" : String(m.type || (Array.isArray(m.attachments) && m.attachments.length ? "anexo" : "texto"));
    const { error } = await admin.from("instagram_mensagens").insert({
      zernio_conversation_id: convId, zernio_message_id: id ? String(id) : null, lead_id: medico.lead_id,
      direcao: daEmpresa ? "enviada" : "recebida", texto, tipo, enviado_em: quando,
    });
    if (!error) { novas++; if (!daEmpresa) recebeuNova = true; }
    else if (error.code !== "23505") throw new Error(`gravar mensagem: ${error.message}`);
  }
  await admin.from("instagram_conversas").update({ ultima_do_medico_em: ultimaDoMedico, ultima_mensagem_em: ultima })
    .eq("zernio_conversation_id", convId);

  if (recebeuNova) {
    // Médico respondeu no Instagram: o toque vira "respondido", a linha do tempo registra e o lead sai de "sem resposta".
    await admin.from("campanha_toques").update({ status: "respondido" })
      .eq("campanha_lead_id", medico.campanha_lead_id).eq("canal", "instagram").eq("status", "feito");
    await admin.from("lead_historico").insert({
      lead_id: medico.lead_id, tipo_evento: "outro", descricao_resumida: "Respondeu no Instagram",
      metadados: { tipo: "toque_rede", canal: "instagram", campanha_lead_id: medico.campanha_lead_id, zernio_conversation_id: convId },
    });
    await admin.from("campanha_leads").update({ status: "em_conversa" })
      .eq("id", medico.campanha_lead_id).in("status", ["contatado", "sem_resposta", "frio", "aquecido"]);
  }
  return novas;
}

async function enviar(admin: any, userId: string, body: any) {
  const texto = String(body.texto || "").trim();
  if (!body.lead_id || !texto) return json({ ok: false, error: "Escreva a mensagem." }, 400);
  if (texto.length > 1000) return json({ ok: false, error: "A mensagem passou de 1000 caracteres." }, 400);
  const { data: conv } = await admin.from("instagram_conversas").select("*").eq("lead_id", body.lead_id)
    .order("ultima_mensagem_em", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (!conv) return json({ ok: false, error: "Ainda não há conversa no Instagram com este médico. Ela aparece quando ele responde." }, 404);
  // A Meta recusa fora da janela; avisar antes poupa o erro cru.
  if (!janelaAberta(conv.ultima_do_medico_em)) {
    return json({ ok: false, janela_fechada: true, error: "Passaram 24 h da última mensagem do médico: o Instagram só deixa responder depois que ele escrever de novo." });
  }
  const r = await zernio(`/inbox/conversations/${encodeURIComponent(conv.zernio_conversation_id)}/messages`, {
    method: "POST", body: JSON.stringify({ accountId: conv.zernio_account_id, message: texto }),
  });
  if (!r.ok) {
    const janela = /24|outside|window|policy|re-?engag/i.test(r.texto);
    console.error(`[instagram-zernio] envio recusado ${r.status}`);
    return json({ ok: false, janela_fechada: janela, error: janela
      ? "O Instagram só deixa responder até 24 h depois da última mensagem do médico."
      : `O Zernio recusou o envio (HTTP ${r.status}).` });
  }
  const id = r.corpo?.id || r.corpo?._id || r.corpo?.message?.id || r.corpo?.data?.id || null;
  const agora = new Date().toISOString();
  await admin.from("instagram_mensagens").insert({
    zernio_conversation_id: conv.zernio_conversation_id, zernio_message_id: id ? String(id) : null, lead_id: body.lead_id,
    direcao: "enviada", texto, enviado_por: userId, enviado_em: agora,
  });
  await admin.from("instagram_conversas").update({ ultima_mensagem_em: agora }).eq("zernio_conversation_id", conv.zernio_conversation_id);
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!Deno.env.get("ZERNIO_API_KEY")) return json({ ok: false, error: "ZERNIO_API_KEY não configurada" }, 500);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const body = await req.json().catch(() => ({}));
  try {
    if (body.action === "sincronizar") {
      if (!(await ehServiceRole(token))) return json({ ok: false, error: "sem_permissao" }, 401);
      return json({ ok: true, ...(await sincronizar(admin)) });
    }
    if (body.action === "enviar") {
      const { data: u } = await admin.auth.getUser(token);
      if (!u?.user) return json({ ok: false, error: "sem_login" }, 401);
      return await enviar(admin, u.user.id, body);
    }
    return json({ ok: false, error: "acao" }, 400);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[instagram-zernio] ${body.action}: ${msg}`);
    if (body.action === "sincronizar") await admin.from("instagram_sync").update({ rodou_em: new Date().toISOString(), erro: msg.slice(0, 500) }).eq("id", 1);
    return json({ ok: false, error: msg }, 500);
  }
});
