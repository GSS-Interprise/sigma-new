import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Edge do 1º contato MANUAL da máquina de prospecção (mudança de rumo 09/06).
// Diferente do `send-disparo-manual` (sistema legado de campanha_propostas):
// esta opera no contexto da campanha de prospecção e MARCA o `campanha_leads`
// (data_primeiro_contato + status frio→contatado + chip_usado_id) — pra o lead
// sair da fila, contar nas métricas e não ser re-tocado.

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Não autorizado" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) return json({ error: "Não autorizado" }, 401);

    const { campanha_id, campanha_lead_id, lead_id, mensagem, instance_id, phone } = await req.json();
    if (!campanha_id || !lead_id || !mensagem) {
      return json({ error: "Parâmetros obrigatórios: campanha_id, lead_id, mensagem" }, 400);
    }

    // ── Lead + telefone ──
    const { data: lead } = await supabase
      .from("leads")
      .select("id, nome, phone_whatsapp, especialidade, uf, cidade")
      .eq("id", lead_id)
      .single();
    const phoneRaw = (phone || lead?.phone_whatsapp || "").toString().trim();
    if (!phoneRaw) return json({ error: "Lead sem telefone (phone_whatsapp) — não dá pra enviar." }, 400);

    // ── Campanha (chips) ──
    const { data: camp, error: campErr } = await supabase
      .from("campanhas")
      .select("id, chip_ids, tipo_envio")
      .eq("id", campanha_id)
      .single();
    if (campErr || !camp) return json({ error: "Campanha não encontrada" }, 404);

    // ── Chip: usa o informado ou o 1º chip da campanha que esteja conectado ──
    let chipId: string | null = instance_id || null;
    if (!chipId) {
      const ids = (camp.chip_ids || []) as string[];
      if (ids.length === 0) return json({ error: "Campanha sem chip configurado" }, 400);
      const { data: chipOk } = await supabase
        .from("chips")
        .select("id")
        .in("id", ids)
        .eq("connection_state", "open")
        .limit(1)
        .maybeSingle();
      if (!chipOk) return json({ error: "Nenhum chip da campanha está conectado" }, 400);
      chipId = chipOk.id;
    }
    const { data: chip, error: chipErr } = await supabase
      .from("chips")
      .select("id, instance_name")
      .eq("id", chipId)
      .single();
    if (chipErr || !chip?.instance_name) return json({ error: "Instância (chip) não encontrada" }, 404);

    // ── sigzap_instance pelo name ──
    const { data: sigzapInstance } = await supabase
      .from("sigzap_instances")
      .select("id")
      .eq("name", chip.instance_name)
      .maybeSingle();
    if (!sigzapInstance) return json({ error: "Instância SigZap não registrada" }, 404);
    const sigzapInstanceId = sigzapInstance.id;

    const numberDigits = normalizePhone(phoneRaw);
    const contactJid = `${numberDigits}@s.whatsapp.net`;
    const contactPhone = `+${numberDigits}`;

    // ── Upsert contato ──
    let contactId: string;
    const { data: existingContact } = await supabase
      .from("sigzap_contacts")
      .select("id")
      .eq("instance_id", sigzapInstanceId)
      .eq("contact_jid", contactJid)
      .maybeSingle();
    if (existingContact) {
      contactId = existingContact.id;
    } else {
      const { data: newContact, error: cErr } = await supabase
        .from("sigzap_contacts")
        .insert({
          instance_id: sigzapInstanceId,
          contact_jid: contactJid,
          contact_phone: contactPhone,
          contact_name: lead?.nome || null,
        })
        .select("id")
        .single();
      if (cErr) throw cErr;
      contactId = newContact!.id;
    }

    // ── Upsert conversa (vincula lead_id) ──
    let conversationId: string;
    const { data: existingConv } = await supabase
      .from("sigzap_conversations")
      .select("id, lead_id")
      .eq("instance_id", sigzapInstanceId)
      .eq("contact_id", contactId)
      .maybeSingle();
    if (existingConv) {
      conversationId = existingConv.id;
      if (!existingConv.lead_id) {
        await supabase.from("sigzap_conversations").update({ lead_id }).eq("id", conversationId);
      }
    } else {
      const { data: newConv, error: convErr } = await supabase
        .from("sigzap_conversations")
        .insert({ instance_id: sigzapInstanceId, contact_id: contactId, lead_id, status: "open" })
        .select("id")
        .single();
      if (convErr) throw convErr;
      conversationId = newConv!.id;
    }

    // ── Mensagem (spintax + variáveis) ──
    const msgFinal = applyVars(resolveSpintax(mensagem), {
      nome: lead?.nome?.split(" ")[0] || "Dr(a)",
      nome_completo: lead?.nome || "",
      especialidade: lead?.especialidade || "",
      uf: lead?.uf || "",
      cidade: lead?.cidade || "",
    });

    // ── Enviar via send-sigzap-message ──
    const sendResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sigzap-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: authHeader },
      body: JSON.stringify({
        action: "send",
        conversationId,
        instanceName: chip.instance_name,
        contactJid,
        message: msgFinal,
      }),
    });
    const sendResult = await sendResp.json().catch(() => ({}));
    if (!sendResp.ok) {
      return json({ error: "Falha ao enviar a mensagem", details: sendResult }, 500);
    }

    // ── Marca o campanha_leads: 1º contato registrado ──
    // Resolve o campanha_lead (por id explícito, ou por campanha_id+lead_id).
    let clId: string | undefined = campanha_lead_id || undefined;
    let clStatusAtual: string | null = null;
    let clPrimeiroContato: string | null = null;
    {
      let clQuery = supabase.from("campanha_leads").select("id, status, data_primeiro_contato");
      clQuery = campanha_lead_id
        ? clQuery.eq("id", campanha_lead_id)
        : clQuery.eq("campanha_id", campanha_id).eq("lead_id", lead_id);
      const { data: cl } = await clQuery.limit(1).maybeSingle();
      if (cl) {
        clId = cl.id;
        clStatusAtual = cl.status;
        clPrimeiroContato = cl.data_primeiro_contato;
      }
    }
    if (clId) {
      const nowIso = new Date().toISOString();
      await supabase
        .from("campanha_leads")
        .update({
          // só sai de 'frio'; outros status (quente etc) preserva
          status: clStatusAtual === "frio" ? "contatado" : clStatusAtual,
          data_primeiro_contato: clPrimeiroContato || nowIso,
          data_ultimo_contato: nowIso,
          chip_usado_id: chip.id,
          updated_at: nowIso,
        })
        .eq("id", clId);
    }

    // ── leads.ultimo_disparo_em + histórico ──
    const nowIso2 = new Date().toISOString();
    await supabase.from("leads").update({ ultimo_disparo_em: nowIso2, updated_at: nowIso2 }).eq("id", lead_id);
    await supabase.from("lead_historico").insert({
      lead_id,
      tipo_evento: "disparo_manual",
      descricao_resumida: "1º contato manual enviado pela equipe (campanha)",
      metadados: { origem: "manual_1o_contato", campanha_id, campanha_lead_id: clId, instance_id: chip.id, phone_e164: contactPhone, conversation_id: conversationId },
    });

    return json({ success: true, conversation_id: conversationId, message: msgFinal, chip_usado: chip.instance_name });
  } catch (e: any) {
    console.error("[campanha-disparo-manual-1contato] erro:", e);
    return json({ error: e?.message || "Erro interno" }, 500);
  }
});
