import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-send-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return "Erro não serializável";
    }
  }
  return String(error);
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function e164(value: string) {
  const normalized = digits(value);
  return normalized ? `+${normalized}` : "";
}

function twilioAuthorization() {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!sid || !token) throw new Error("twilio_secrets_not_configured");
  return { sid, header: `Basic ${btoa(`${sid}:${token}`)}` };
}

function resolveBinding(binding: string, context: Record<string, unknown>) {
  return binding.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[key];
    }, context);
    return value == null ? "" : String(value);
  }).trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization") || "";
    const internalSendKey = Deno.env.get("TWILIO_SEND_INTERNAL_KEY") || "";
    const isInternalSend =
      internalSendKey.length >= 32 &&
      req.headers.get("x-internal-send-key") === internalSendKey;
    const isServiceRole = authorization === `Bearer ${serviceRole}` || isInternalSend;
    const admin = createClient(supabaseUrl, serviceRole);
    const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = isServiceRole
      ? { data: { user: null }, error: null }
      : await auth.auth.getUser();
    if (!isServiceRole && (userError || !user)) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const campaignLeadId = String(input.campaign_lead_id || "");
    const conversationIdInput = String(input.conversation_id || "");
    const leadIdInput = String(input.lead_id || "");
    const senderIdInput = String(input.sender_id || "");
    const templateIdInput = String(input.template_id || "");
    const body = String(input.body || "").trim();
    const templateVariables =
      input.template_variables && typeof input.template_variables === "object"
        ? input.template_variables
        : {};

    let campaign: any = null;
    let lead: any = null;
    let conversation: any = null;

    if (campaignLeadId) {
      const { data: campaignLead, error } = await admin
        .from("campanha_leads")
        .select("id, campanha_id, lead_id")
        .eq("id", campaignLeadId)
        .single();
      if (error) throw error;

      const [campaignResult, leadResult] = await Promise.all([
        admin
          .from("campanhas")
          .select("id, nome, nome_remetente, briefing_ia, whatsapp_provider, official_template_id, official_sender_id, official_template_variables")
          .eq("id", campaignLead.campanha_id)
          .single(),
        admin
          .from("leads")
          .select("id, nome, phone_e164")
          .eq("id", campaignLead.lead_id)
          .single(),
      ]);
      if (campaignResult.error) throw campaignResult.error;
      if (leadResult.error) throw leadResult.error;
      campaign = campaignResult.data;
      lead = leadResult.data;
      if (campaign.whatsapp_provider !== "twilio") {
        return json({ ok: false, error: "campaign_not_twilio" }, 409);
      }
    } else if (conversationIdInput) {
      const { data, error } = await admin
        .from("sigzap_conversations")
        .select("id, lead_id, instance_id, service_window_expires_at")
        .eq("id", conversationIdInput)
        .single();
      if (error) throw error;
      const { data: instance, error: instanceError } = await admin
        .from("sigzap_instances")
        .select("external_ref, provider")
        .eq("id", data.instance_id)
        .single();
      if (instanceError) throw instanceError;
      if (instance.provider !== "twilio") {
        return json({ ok: false, error: "conversation_not_twilio" }, 409);
      }
      conversation = { ...data, instance };

      const { data: leadData, error: leadError } = await admin
        .from("leads")
        .select("id, nome, phone_e164")
        .eq("id", data.lead_id)
        .single();
      if (leadError) throw leadError;
      lead = leadData;
    } else if (leadIdInput && isInternalSend) {
      const { data: leadData, error: leadError } = await admin
        .from("leads")
        .select("id, nome, phone_e164")
        .eq("id", leadIdInput)
        .single();
      if (leadError) throw leadError;
      lead = leadData;
    } else {
      return json({ ok: false, error: "campaign_lead_or_conversation_required" }, 400);
    }

    const toPhone = e164(lead?.phone_e164 || "");
    if (!toPhone) return json({ ok: false, error: "lead_without_valid_phone" }, 400);

    let senderQuery = admin
      .from("whatsapp_official_senders")
      .select("id, sender_sid, phone_e164, display_name, status")
      .in("status", ["approved", "online", "active", "activated"]);
    if (campaign?.official_sender_id) senderQuery = senderQuery.eq("id", campaign.official_sender_id);
    if (senderIdInput && isInternalSend) senderQuery = senderQuery.eq("id", senderIdInput);
    if (conversation?.instance?.external_ref) {
      senderQuery = senderQuery.eq("sender_sid", conversation.instance.external_ref);
    }
    const { data: senders, error: senderError } = await senderQuery.limit(2);
    if (senderError) throw senderError;
    if (!senders || senders.length !== 1) {
      return json({
        ok: false,
        error: senders?.length ? "campaign_sender_required" : "no_official_sender_available",
      }, 409);
    }
    const sender = senders[0];
    if (!["approved", "online", "active", "activated"].includes(String(sender.status).toLowerCase())) {
      return json({ ok: false, error: "official_sender_not_active", sender_status: sender.status }, 409);
    }

    let template: any = null;
    const templateId = templateIdInput || campaign?.official_template_id || "";
    if (templateId) {
      const { data, error } = await admin
        .from("whatsapp_official_templates")
        .select("id, content_sid, approval_status, friendly_name, body, variables")
        .eq("id", templateId)
        .single();
      if (error) throw error;
      if (data.approval_status !== "approved") {
        return json({ ok: false, error: "template_not_approved" }, 409);
      }
      template = data;
    }

    let resolvedTemplateVariables: Record<string, string> = {};
    if (template) {
      const configuredBindings =
        Object.keys(templateVariables).length > 0
          ? templateVariables
          : campaign?.official_template_variables || {};
      const positions = Object.keys(template.variables || {});
      const context = {
        lead,
        campanha: campaign,
        briefing: campaign?.briefing_ia || {},
      };
      for (const position of positions) {
        const binding = String(configuredBindings[position] || "");
        const resolved = resolveBinding(binding, context);
        if (!resolved) {
          return json({
            ok: false,
            error: "template_variable_not_configured",
            variable: position,
          }, 409);
        }
        resolvedTemplateVariables[position] = resolved;
      }
    }

    if (!conversation) {
      const { data: existingInstance, error: existingInstanceError } = await admin
        .from("sigzap_instances")
        .select("id")
        .eq("provider", "twilio")
        .eq("external_ref", sender.sender_sid)
        .maybeSingle();
      if (existingInstanceError) throw existingInstanceError;

      const { data: instance, error: instanceError } = existingInstance
        ? await admin
          .from("sigzap_instances")
          .update({
            name: sender.display_name || `WhatsApp oficial ${sender.phone_e164}`,
            phone_number: sender.phone_e164,
            status: "connected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingInstance.id)
          .select("id")
          .single()
        : await admin
          .from("sigzap_instances")
          .insert({
          name: sender.display_name || `WhatsApp oficial ${sender.phone_e164}`,
          phone_number: sender.phone_e164,
          status: "connected",
          provider: "twilio",
          external_ref: sender.sender_sid,
          updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();
      if (instanceError) throw instanceError;

      const contactJid = `${digits(toPhone)}@s.whatsapp.net`;
      const { data: existingContact, error: existingContactError } = await admin
        .from("sigzap_contacts")
        .select("id")
        .eq("contact_jid", contactJid)
        .eq("instance_id", instance.id)
        .maybeSingle();
      if (existingContactError) throw existingContactError;

      const { data: contact, error: contactError } = existingContact
        ? await admin
          .from("sigzap_contacts")
          .update({
            contact_phone: toPhone,
            contact_name: lead.nome || toPhone,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingContact.id)
          .select("id")
          .single()
        : await admin
          .from("sigzap_contacts")
          .insert({
          contact_jid: contactJid,
          contact_phone: toPhone,
          contact_name: lead.nome || toPhone,
          instance_id: instance.id,
          updated_at: new Date().toISOString(),
          })
          .select("id")
          .single();
      if (contactError) throw contactError;

      const { data: existing } = await admin
        .from("sigzap_conversations")
        .select("id, lead_id, instance_id, service_window_expires_at")
        .eq("contact_id", contact.id)
        .eq("instance_id", instance.id)
        .maybeSingle();
      if (existing) {
        conversation = existing;
      } else {
        const { data: created, error } = await admin
          .from("sigzap_conversations")
          .insert({
            contact_id: contact.id,
            instance_id: instance.id,
            lead_id: lead.id,
            status: "open",
          })
          .select("id, lead_id, instance_id, service_window_expires_at")
          .single();
        if (error) throw error;
        conversation = created;
      }
    }

    const serviceWindowOpen =
      conversation.service_window_expires_at &&
      new Date(conversation.service_window_expires_at).getTime() > Date.now();
    if (!template && !serviceWindowOpen) {
      return json({ ok: false, error: "approved_template_required_outside_service_window" }, 409);
    }
    if (!template && !body) return json({ ok: false, error: "message_body_required" }, 400);

    const callbackUrl =
      Deno.env.get("TWILIO_STATUS_CALLBACK_URL") ||
      `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook`;
    const form = new URLSearchParams({
      From: `whatsapp:${sender.phone_e164}`,
      To: `whatsapp:${toPhone}`,
      StatusCallback: callbackUrl,
    });
    if (template) {
      form.set("ContentSid", template.content_sid);
      form.set("ContentVariables", JSON.stringify(resolvedTemplateVariables));
    } else {
      form.set("Body", body);
    }

    const credentials = twilioAuthorization();
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${credentials.sid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: credentials.header,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      },
    );
    const twilioMessage = await twilioResponse.json();
    if (!twilioResponse.ok) {
      console.error("[twilio-send]", twilioMessage);
      return json({
        ok: false,
        error: "twilio_send_failed",
        provider_code: twilioMessage.code || null,
        provider_message: twilioMessage.message || null,
      }, 502);
    }

    const now = new Date().toISOString();
    const visibleBody = template
      ? Object.entries(resolvedTemplateVariables).reduce(
          (text, [position, value]) => text.replaceAll(`{{${position}}}`, value),
          template.body || `[Template: ${template.friendly_name}]`,
        )
      : body;
    const { error: messageError } = await admin.from("sigzap_messages").insert({
      conversation_id: conversation.id,
      wa_message_id: twilioMessage.sid,
      provider: "twilio",
      provider_message_id: twilioMessage.sid,
      from_me: true,
      sent_by_user_id: user?.id || null,
      message_text: visibleBody,
      message_type: "text",
      message_status: twilioMessage.status || "queued",
      raw_payload: twilioMessage,
      sent_at: now,
    });
    if (messageError) throw messageError;

    await admin
      .from("sigzap_conversations")
      .update({
        last_message_text: visibleBody,
        last_message_at: now,
        updated_at: now,
      })
      .eq("id", conversation.id);

    if (campaignLeadId) {
      // Toda mensagem manual atualiza a atividade do card, inclusive respostas
      // livres enviadas depois do primeiro contato dentro da janela de 24h.
      await admin
        .from("campanha_leads")
        .update({
          data_ultimo_contato: now,
          updated_at: now,
        })
        .eq("id", campaignLeadId);

      await admin
        .from("campanha_leads")
        .update({
          status: "contatado",
          data_primeiro_contato: now,
          data_status: now,
        })
        .eq("id", campaignLeadId)
        .eq("status", "frio");
    }

    return json({
      ok: true,
      message_sid: twilioMessage.sid,
      status: twilioMessage.status,
      conversation_id: conversation.id,
    });
  } catch (error) {
    console.error("[twilio-send]", error);
    return json({
      ok: false,
      error: errorMessage(error),
    }, 500);
  }
});
