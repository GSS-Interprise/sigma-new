import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function resolveSpintax(text: string): string {
  let result = text.replace(/\[OPCIONAL\]\s*([^\n]*)/gi, () => (Math.random() > 0.5 ? "" : ""));
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { campanha_proposta_id, lead_id, phone_e164, instance_id, mensagem } = body;

    if (!campanha_proposta_id || !lead_id || !phone_e164 || !instance_id || !mensagem) {
      return new Response(JSON.stringify({ error: "Parâmetros obrigatórios faltando" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar lead para template
    const { data: lead } = await supabase
      .from("leads")
      .select("id, nome, especialidade, uf, cidade")
      .eq("id", lead_id)
      .single();

    // Resolver spintax + variáveis
    const msgResolved = resolveSpintax(mensagem);
    const msgFinal = applyVars(msgResolved, {
      nome: lead?.nome?.split(" ")[0] || "Dr(a)",
      nome_completo: lead?.nome || "",
      especialidade: lead?.especialidade || "",
      uf: lead?.uf || "",
      cidade: lead?.cidade || "",
    });

    // Buscar instância (chip) para pegar instance_name e sigzap_instance_id
    const { data: chip, error: chipErr } = await supabase
      .from("chips")
      .select("id, instance_name, instance_id")
      .eq("id", instance_id)
      .single();
    if (chipErr || !chip?.instance_name) {
      return new Response(JSON.stringify({ error: "Instância não encontrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar sigzap_instance_id pelo name
    const { data: sigzapInstance } = await supabase
      .from("sigzap_instances")
      .select("id")
      .eq("name", chip.instance_name)
      .maybeSingle();

    if (!sigzapInstance) {
      return new Response(JSON.stringify({ error: "Instância SIG Zap não registrada" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sigzapInstanceId = sigzapInstance.id;
    const numberDigits = normalizePhone(phone_e164);
    const contactJid = `${numberDigits}@s.whatsapp.net`;
    const contactPhone = `+${numberDigits}`;

    // Upsert sigzap_contacts (instance_id + contact_jid)
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

    // Upsert sigzap_conversations
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
        .insert({
          instance_id: sigzapInstanceId,
          contact_id: contactId,
          lead_id,
          status: "open",
        })
        .select("id")
        .single();
      if (convErr) throw convErr;
      conversationId = newConv!.id;
    }

    // Chamar send-sigzap-message
    const sendResp = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/send-sigzap-message`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          conversationId,
          instanceName: chip.instance_name,
          contactJid,
          message: msgFinal,
          action: "send",
        }),
      }
    );

    const sendResult = await sendResp.json().catch(() => ({}));
    const sendOk = sendResp.ok;

    // Auditoria
    await supabase.from("disparo_manual_envios").insert({
      campanha_proposta_id,
      lead_id,
      phone_e164: contactPhone,
      instance_id,
      conversation_id: conversationId,
      mensagem: msgFinal,
      status: sendOk ? "enviado" : "falhou",
      erro: sendOk ? null : JSON.stringify(sendResult).slice(0, 1000),
      enviado_por: user.id,
    });

    if (!sendOk) {
      return new Response(JSON.stringify({ error: "Falha ao enviar", details: sendResult }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Sincroniza com a fila do disparo em massa: marca como ENVIADO
    // qualquer registro pendente desse lead nessa proposta para evitar
    // que o n8n busque o mesmo lead novamente.
    try {
      const { error: syncErr } = await supabase
        .from("disparos_contatos")
        .update({ status: "4-ENVIADO", updated_at: new Date().toISOString() })
        .eq("campanha_proposta_id", campanha_proposta_id)
        .eq("lead_id", lead_id)
        .in("status", ["1-ENVIAR", "2-REENVIAR", "3-TRATANDO"]);
      if (syncErr) {
        console.warn("[send-disparo-manual] falha ao sincronizar disparos_contatos:", syncErr);
      }
    } catch (e) {
      console.warn("[send-disparo-manual] erro inesperado ao sincronizar disparos_contatos:", e);
    }

    // Atualiza ultimo_disparo_em no lead — dispara a automação de status (Acompanhamento)
    try {
      await supabase
        .from("leads")
        .update({
          ultimo_disparo_em: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", lead_id);
    } catch (e) {
      console.warn("[send-disparo-manual] falha ao atualizar ultimo_disparo_em:", e);
    }

    // Histórico do lead
    await supabase.from("lead_historico").insert({
      lead_id,
      tipo_evento: "disparo_manual",
      descricao_resumida: "Disparo manual enviado via SIG Zap",
      metadados: {
        origem: "manual",
        campanha_proposta_id,
        instance_id,
        phone_e164: contactPhone,
        conversation_id: conversationId,
      },
    });

    return new Response(
      JSON.stringify({ success: true, conversation_id: conversationId, message: msgFinal }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("[send-disparo-manual] erro:", e);
    return new Response(JSON.stringify({ error: e?.message || "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});