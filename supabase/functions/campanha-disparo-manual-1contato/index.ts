import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1º contato MANUAL da máquina de prospecção (mudança 09/06).
// Envio SÍNCRONO e honesto: espera a confirmação do WhatsApp e devolve o resultado
// REAL com mensagem clara (chip desconectado / número sem WhatsApp / demorou).
// Só marca o campanha_leads como "contatado" se a mensagem realmente saiu.

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

// Sempre 200 — erros de negócio vão no corpo (`error`) pra o frontend exibir a
// mensagem amigável (o supabase.functions.invoke não expõe o body em non-2xx).
function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Traduz o erro técnico do Evolution/send-sigzap-message em algo que a operadora entende.
function traduzErroEnvio(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (m.includes("connection closed") || m.includes("precondition required") || m.includes("428") || m.includes("close")) {
    return "O chip dessa campanha está desconectado do WhatsApp. Reconecte ele em 'Disparos & Chips' e tente de novo.";
  }
  if (m.includes("not on whatsapp") || m.includes("exists\":false") || m.includes("invalid") || m.includes("número") || m.includes("number")) {
    return "Esse número parece não ter WhatsApp ativo. Confira o número ou marque o lead como perdido.";
  }
  if (m.includes("timeout") || m.includes("abort") || m.includes("demor")) {
    return "O WhatsApp demorou demais pra responder (chip lento). Tente de novo em instantes.";
  }
  return "Não consegui enviar agora. Confira se o chip da campanha está conectado e tente de novo.";
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
      return json({ error: "Faltou preencher a mensagem." });
    }

    // ── Lead + telefone ──
    const { data: lead } = await supabase
      .from("leads").select("id, nome, phone_e164, especialidade, uf, cidade").eq("id", lead_id).single();
    const phoneRaw = (phone || lead?.phone_e164 || "").toString().trim();
    if (!phoneRaw) return json({ error: "Esse lead não tem telefone cadastrado." });

    // ── Campanha + chip (informado ou 1º conectado) ──
    const { data: camp, error: campErr } = await supabase
      .from("campanhas").select("id, chip_ids, tipo_envio").eq("id", campanha_id).single();
    if (campErr || !camp) return json({ error: "Campanha não encontrada." });

    let chipId: string | null = instance_id || null;
    if (!chipId) {
      const ids = (camp.chip_ids || []) as string[];
      if (ids.length === 0) return json({ error: "Essa campanha não tem chip configurado. Adicione um chip antes de contatar." });
      const { data: chipOk } = await supabase
        .from("chips").select("id").in("id", ids).eq("connection_state", "open").limit(1).maybeSingle();
      if (!chipOk) return json({ error: "Nenhum chip dessa campanha está conectado. Reconecte um chip em 'Disparos & Chips' e tente de novo." });
      chipId = chipOk.id;
    }
    const { data: chip, error: chipErr } = await supabase
      .from("chips").select("id, instance_name").eq("id", chipId).single();
    if (chipErr || !chip?.instance_name) return json({ error: "Chip não encontrado." });

    const { data: sigzapInstance } = await supabase
      .from("sigzap_instances").select("id").eq("name", chip.instance_name).maybeSingle();
    if (!sigzapInstance) return json({ error: "Esse chip não está registrado no SigZap. Avise o Raul." });
    const sigzapInstanceId = sigzapInstance.id;

    const numberDigits = normalizePhone(phoneRaw);
    const contactJid = `${numberDigits}@s.whatsapp.net`;
    const contactPhone = `+${numberDigits}`;

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

    // ── Conversa (rastreia se foi criada agora, pra limpar se o envio falhar) ──
    let conversationId: string;
    let conversaNova = false;
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
      conversaNova = true;
    }

    const msgFinal = applyVars(resolveSpintax(mensagem), {
      nome: lead?.nome?.split(" ")[0] || "Dr(a)",
      nome_completo: lead?.nome || "",
      especialidade: lead?.especialidade || "",
      uf: lead?.uf || "",
      cidade: lead?.cidade || "",
    });

    // ── ENVIO SÍNCRONO (timeout 30s) — espera o resultado real ──
    const limparOrfa = async () => { if (conversaNova) { try { await supabase.from("sigzap_conversations").delete().eq("id", conversationId); } catch (_) {} } };
    let sendResp: Response;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 30000);
    try {
      sendResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sigzap-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ action: "send", conversationId, instanceName: chip.instance_name, contactJid, message: msgFinal, clientMessageId: crypto.randomUUID() }),
        signal: ac.signal,
      });
    } catch (_e) {
      clearTimeout(timer);
      await limparOrfa();
      return json({ error: traduzErroEnvio("timeout abort") });
    }
    clearTimeout(timer);

    if (!sendResp.ok) {
      const det = await sendResp.text().catch(() => "");
      await limparOrfa();
      await supabase.from("lead_historico").insert({
        lead_id, tipo_evento: "disparo_manual_falha",
        descricao_resumida: "Falha no 1º contato manual",
        metadados: { origem: "manual_1o_contato", campanha_id, erro: det.slice(0, 500) },
      }).then(() => {}, () => {});
      return json({ error: traduzErroEnvio(det) });
    }

    const sendResult = await sendResp.json().catch(() => ({}));
    if (sendResult?.queued) {
      return json({
        success: false,
        queued: true,
        conversation_id: conversationId,
        message: msgFinal,
        chip_usado: chip.instance_name,
        aviso: "Mensagem salva, mas ainda nao enviada ao WhatsApp.",
      });
    }

    // ── Sucesso: marca o campanha_leads + lead ──
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
    await supabase.from("lead_historico").insert({
      lead_id, tipo_evento: "disparo_manual",
      descricao_resumida: "1º contato manual enviado pela equipe (campanha)",
      metadados: { origem: "manual_1o_contato", campanha_id, campanha_lead_id: clId, instance_id: chip.id, phone_e164: contactPhone, conversation_id: conversationId },
    }).then(() => {}, () => {});

    return json({ success: true, conversation_id: conversationId, message: msgFinal, chip_usado: chip.instance_name });
  } catch (e: any) {
    console.error("[campanha-disparo-manual-1contato] erro:", e);
    return json({ error: "Algo deu errado no envio. Tente de novo; se persistir, avise o Raul." });
  }
});
