import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1º contato MANUAL da máquina de prospecção (mudança 09/06).
// UX otimista: pré-checa o WhatsApp, responde rápido e envia em segundo plano
// (o chip/proxy é lento — não faz sentido segurar a operadora esperando).
// Marca o campanha_leads (data_primeiro_contato + frio→contatado + chip_usado_id).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function resolveSpintax(text: string): string {
  let result = text;
  let i = 0;
  while (result.includes("{") && i < 50) {
    result = result.replace(/\{([^{}]+)\}/g, (_, group) => {
      const opts = group.split("|");
      return opts[Math.floor(Math.random() * opts.length)].trim();
    });
    i++;
  }
  return result.replace(/\n{3,}/g, "\n\n").replace(/ {2,}/g, " ").trim();
}

function applyVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
}

function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : "55" + digits;
}

// Sempre 200 — erros de negócio vão no corpo (`error`) pra o frontend conseguir ler
// a mensagem (o supabase.functions.invoke não expõe o body em respostas non-2xx).
function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Checa no Evolution se o número tem WhatsApp. Retorna true/false, ou null se não
// conseguiu checar (timeout/endpoint) — nesse caso não bloqueia o envio.
async function temWhatsApp(url: string, key: string, instance: string, numberDigits: string): Promise<boolean | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(`${url}/chat/whatsappNumbers/${encodeURIComponent(instance)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ numbers: [numberDigits] }),
      signal: ac.signal,
    });
    clearTimeout(t);
    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    if (Array.isArray(data) && data.length > 0) {
      const item = data.find((d: any) => String(d?.number || d?.jid || "").includes(numberDigits)) || data[0];
      if (typeof item?.exists === "boolean") return item.exists;
    }
    return null;
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" });
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Não autorizado" });

    const { campanha_id, campanha_lead_id, lead_id, mensagem, instance_id, phone } = await req.json();
    if (!campanha_id || !lead_id || !mensagem) {
      return json({ error: "Parâmetros obrigatórios: campanha_id, lead_id, mensagem" });
    }

    // ── Lead + telefone ──
    const { data: lead } = await supabase
      .from("leads")
      .select("id, nome, phone_e164, especialidade, uf, cidade")
      .eq("id", lead_id)
      .single();
    const phoneRaw = (phone || lead?.phone_e164 || "").toString().trim();
    if (!phoneRaw) return json({ error: "Lead sem telefone — não dá pra enviar." });

    // ── Campanha (chips) ──
    const { data: camp, error: campErr } = await supabase
      .from("campanhas").select("id, chip_ids, tipo_envio").eq("id", campanha_id).single();
    if (campErr || !camp) return json({ error: "Campanha não encontrada" });

    // ── Chip: informado ou 1º chip conectado da campanha ──
    let chipId: string | null = instance_id || null;
    if (!chipId) {
      const ids = (camp.chip_ids || []) as string[];
      if (ids.length === 0) return json({ error: "Campanha sem chip configurado" });
      const { data: chipOk } = await supabase
        .from("chips").select("id").in("id", ids).eq("connection_state", "open").limit(1).maybeSingle();
      if (!chipOk) return json({ error: "Nenhum chip da campanha está conectado. Reconecte um chip antes." });
      chipId = chipOk.id;
    }
    const { data: chip, error: chipErr } = await supabase
      .from("chips").select("id, instance_name").eq("id", chipId).single();
    if (chipErr || !chip?.instance_name) return json({ error: "Instância (chip) não encontrada" });

    // ── sigzap_instance ──
    const { data: sigzapInstance } = await supabase
      .from("sigzap_instances").select("id").eq("name", chip.instance_name).maybeSingle();
    if (!sigzapInstance) return json({ error: "Instância SigZap não registrada" });
    const sigzapInstanceId = sigzapInstance.id;

    const numberDigits = normalizePhone(phoneRaw);
    const contactJid = `${numberDigits}@s.whatsapp.net`;
    const contactPhone = `+${numberDigits}`;

    // ── Config Evolution + PRÉ-CHECK de WhatsApp (avisa na hora se o número não existe) ──
    const { data: evoCfg } = await supabase
      .from("config_lista_items").select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);
    const evolutionUrl = (evoCfg?.find((c) => c.campo_nome === "evolution_api_url")?.valor || Deno.env.get("EVOLUTION_API_URL"))?.replace(/\/+$/, "");
    const evolutionKey = evoCfg?.find((c) => c.campo_nome === "evolution_api_key")?.valor || Deno.env.get("EVOLUTION_API_KEY");
    if (evolutionUrl && evolutionKey) {
      const has = await temWhatsApp(evolutionUrl, evolutionKey, chip.instance_name, numberDigits);
      if (has === false) {
        return json({ error: "Esse número não tem WhatsApp ativo — não dá pra enviar. Marque o lead como perdido (sem WhatsApp)." });
      }
    }

    // ── Contato ──
    let contactId: string;
    const { data: existingContact } = await supabase
      .from("sigzap_contacts").select("id").eq("instance_id", sigzapInstanceId).eq("contact_jid", contactJid).maybeSingle();
    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: cErr } = await supabase
        .from("sigzap_contacts")
        .insert({ instance_id: sigzapInstanceId, contact_jid: contactJid, contact_phone: contactPhone, contact_name: lead?.nome || null })
        .select("id").single();
      if (cErr) throw cErr;
      contactId = newContact!.id;
    }

    // ── Conversa (vincula lead_id) ──
    let conversationId: string;
    const { data: existingConv } = await supabase
      .from("sigzap_conversations").select("id, lead_id").eq("instance_id", sigzapInstanceId).eq("contact_id", contactId).maybeSingle();
    if (existingConv) {
      conversationId = existingConv.id;
      if (!existingConv.lead_id) await supabase.from("sigzap_conversations").update({ lead_id }).eq("id", conversationId);
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from("sigzap_conversations").insert({ instance_id: sigzapInstanceId, contact_id: contactId, lead_id, status: "open" }).select("id").single();
      if (convErr) throw convErr;
      conversationId = newConv!.id;
    }

    // ── Marca o campanha_leads: 1º contato registrado ──
    let clId: string | undefined = campanha_lead_id || undefined;
    let clStatusAtual: string | null = null;
    let clPrimeiroContato: string | null = null;
    {
      let clQuery = supabase.from("campanha_leads").select("id, status, data_primeiro_contato");
      clQuery = campanha_lead_id ? clQuery.eq("id", campanha_lead_id) : clQuery.eq("campanha_id", campanha_id).eq("lead_id", lead_id);
      const { data: cl } = await clQuery.limit(1).maybeSingle();
      if (cl) { clId = cl.id; clStatusAtual = cl.status; clPrimeiroContato = cl.data_primeiro_contato; }
    }
    const nowIso = new Date().toISOString();
    if (clId) {
      await supabase.from("campanha_leads").update({
        status: clStatusAtual === "frio" ? "contatado" : clStatusAtual,
        data_primeiro_contato: clPrimeiroContato || nowIso,
        data_ultimo_contato: nowIso,
        chip_usado_id: chip.id,
        updated_at: nowIso,
      }).eq("id", clId);
    }
    await supabase.from("leads").update({ ultimo_disparo_em: nowIso, updated_at: nowIso }).eq("id", lead_id);

    const msgFinal = applyVars(resolveSpintax(mensagem), {
      nome: lead?.nome?.split(" ")[0] || "Dr(a)",
      nome_completo: lead?.nome || "",
      especialidade: lead?.especialidade || "",
      uf: lead?.uf || "",
      cidade: lead?.cidade || "",
    });

    // ── Envio em SEGUNDO PLANO (otimista): responde já, manda depois ──
    const enviarBg = (async () => {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 35000);
        const r = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sigzap-message`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: authHeader },
          body: JSON.stringify({ action: "send", conversationId, instanceName: chip.instance_name, contactJid, message: msgFinal }),
          signal: ac.signal,
        });
        clearTimeout(t);
        if (!r.ok) {
          const det = await r.text().catch(() => "");
          await supabase.from("lead_historico").insert({
            lead_id, tipo_evento: "disparo_manual_falha",
            descricao_resumida: "Falha no envio do 1º contato manual",
            metadados: { origem: "manual_1o_contato", campanha_id, campanha_lead_id: clId, erro: det.slice(0, 500) },
          });
        } else {
          await supabase.from("lead_historico").insert({
            lead_id, tipo_evento: "disparo_manual",
            descricao_resumida: "1º contato manual enviado pela equipe (campanha)",
            metadados: { origem: "manual_1o_contato", campanha_id, campanha_lead_id: clId, instance_id: chip.id, phone_e164: contactPhone, conversation_id: conversationId },
          });
        }
      } catch (e: any) {
        await supabase.from("lead_historico").insert({
          lead_id, tipo_evento: "disparo_manual_falha",
          descricao_resumida: "1º contato manual demorou/falhou no envio",
          metadados: { origem: "manual_1o_contato", campanha_id, campanha_lead_id: clId, erro: String(e?.message || e).slice(0, 300) },
        });
      }
    })();

    try {
      // @ts-ignore — EdgeRuntime existe no Supabase Edge Functions
      EdgeRuntime.waitUntil(enviarBg);
    } catch {
      await enviarBg; // fallback (ambiente sem EdgeRuntime)
    }

    return json({ success: true, conversation_id: conversationId, message: msgFinal, chip_usado: chip.instance_name, otimista: true });
  } catch (e: any) {
    console.error("[campanha-disparo-manual-1contato] erro:", e);
    return json({ error: e?.message || "Erro interno" });
  }
});
