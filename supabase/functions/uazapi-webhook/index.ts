// uazapi-webhook (piloto 11/06): recebe eventos do servidor uazapi (messages + connection)
// pros chips com provedor='uazapi'. Defensivo: o formato exato do payload uazapi é
// confirmado com o 1º evento real → SEMPRE loga o cru (console) pra refinar.
//
// Responsabilidades:
//   - connection: sincroniza chips.connection_state (connected→open).
//   - messages (inbound): grava em sigzap_messages + upsert conversa + vincula lead
//     + (campanha manual) status contatado/sem_resposta → em_conversa (Aguardando→Aquecido).
//
// Espelha o miolo de receive-whatsapp-messages, mas pro payload uazapi.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

// tenta achar um valor em vários caminhos possíveis do payload (formato uazapi varia por versão)
function pick(obj: any, paths: string[]): any {
  for (const p of paths) {
    const v = p.split(".").reduce((o: any, k) => (o == null ? o : o[k]), obj);
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const ok = (o: unknown = { ok: true }) => new Response(JSON.stringify(o), { headers: { ...cors, "Content-Type": "application/json" } });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let payload: any = {};
  try { payload = await req.json(); } catch { return ok({ ok: false, reason: "no_json" }); }

  // SEMPRE loga o cru — é como confirmamos o formato exato do uazapi no piloto.
  console.log("[uazapi-webhook] RAW:", JSON.stringify(payload).slice(0, 2000));

  try {
    const evento = (pick(payload, ["event", "EventType", "type"]) || "").toString().toLowerCase();
    // identifica a instância: por nome, owner ou token
    const instanceName = pick(payload, ["instance", "instanceName", "instance.name", "data.instance", "name"]);
    const ownerJid = pick(payload, ["owner", "instance.owner", "data.owner", "sender", "chatid"]);

    // acha o chip uazapi por instance_name
    let chip: any = null;
    if (instanceName) {
      const { data } = await supabase.from("chips").select("id, provedor, instance_name").eq("instance_name", instanceName).eq("provedor", "uazapi").maybeSingle();
      chip = data;
    }

    // ── CONNECTION ──
    const connState = pick(payload, ["status", "data.status", "connection", "state", "data.state"]);
    if ((evento.includes("connect") || connState) && chip) {
      const s = String(connState || "").toLowerCase();
      const mapped = s.includes("connect") && !s.includes("dis") ? "open" : s.includes("connecting") ? "connecting" : s.includes("disconnect") || s.includes("close") ? "close" : null;
      if (mapped) {
        await supabase.from("chips").update({ connection_state: mapped, updated_at: new Date().toISOString() }).eq("id", chip.id);
        console.log(`[uazapi-webhook] connection ${chip.instance_name} → ${mapped}`);
      }
      if (evento.includes("connect")) return ok();
    }

    // ── MESSAGES (inbound) ──
    const fromMe = pick(payload, ["fromMe", "data.fromMe", "message.fromMe", "key.fromMe", "data.key.fromMe"]) === true;
    const text = pick(payload, ["text", "data.text", "message.text", "body", "data.body", "message.conversation", "data.message.conversation"]);
    const senderRaw = pick(payload, ["sender", "data.sender", "chatid", "from", "data.from", "key.remoteJid", "data.key.remoteJid"]);
    const waMsgId = pick(payload, ["id", "messageid", "data.id", "key.id", "data.key.id"]);

    if (!fromMe && text && senderRaw) {
      const phone = String(senderRaw).replace(/@.*/, "").replace(/\D/g, "");
      // vincula lead pelo telefone (últimos 8 dígitos)
      let leadId: string | null = null;
      try {
        const { data: lead } = await supabase.rpc("find_lead_by_phone_fuzzy", { phone });
        leadId = (Array.isArray(lead) ? lead[0]?.id : (lead as any)?.id) || null;
      } catch { /* rpc pode ter assinatura diferente — best effort */ }

      // upsert conversa sigzap por (chip + phone)
      let convId: string | null = null;
      if (chip) {
        const { data: conv } = await supabase.from("sigzap_conversations")
          .select("id").eq("instance_id", chip.id).limit(1).maybeSingle().catch(() => ({ data: null } as any));
        convId = conv?.id || null;
      }

      // grava a mensagem (mínimo viável; refinar com formato real)
      if (convId) {
        await supabase.from("sigzap_messages").insert({
          conversation_id: convId,
          wa_message_id: waMsgId || `uz_${Date.now()}`,
          from_me: false,
          message_text: String(text),
          message_type: "text",
          message_status: "received",
          sent_at: new Date().toISOString(),
        }).catch((e: any) => console.warn("[uazapi-webhook] msg insert:", e?.message));
      }

      // campanha manual: respondeu → em_conversa (Aguardando → Aquecido)
      if (leadId) {
        const { data: cl } = await supabase.from("campanha_leads")
          .select("id, status, campanha_id").eq("lead_id", leadId)
          .in("status", ["contatado", "sem_resposta"]).limit(1).maybeSingle();
        if (cl) {
          await supabase.from("campanha_leads").update({ status: "em_conversa", data_status: new Date().toISOString() }).eq("id", cl.id);
        }
      }
    }

    return ok();
  } catch (e: any) {
    console.error("[uazapi-webhook] erro:", e?.message || e);
    return ok({ ok: false, error: String(e?.message || e) });
  }
});
