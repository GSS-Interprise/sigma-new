import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const XML_OK = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function xmlResponse(status = 200) {
  return new Response(XML_OK, {
    status,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

function stripChannel(value: string) {
  return value.replace(/^whatsapp:/i, "").trim();
}

function phoneDigits(value: string) {
  return stripChannel(value).replace(/\D/g, "");
}

function phoneE164(value: string) {
  const digits = phoneDigits(value);
  return digits ? `+${digits}` : "";
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function validateTwilioSignature(req: Request, params: URLSearchParams) {
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const received = req.headers.get("x-twilio-signature") || "";
  if (!token || !received) return false;

  // Twilio signs the exact public URL plus alphabetically sorted form fields.
  const publicUrl = Deno.env.get("TWILIO_WEBHOOK_PUBLIC_URL") || req.url;
  const pairs = Array.from(params.entries()).sort(([keyA, valueA], [keyB, valueB]) =>
    keyA === keyB ? valueA.localeCompare(valueB) : keyA.localeCompare(keyB)
  );
  const source = publicUrl + pairs.map(([key, value]) => `${key}${value}`).join("");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(source)),
  );
  return bytesToBase64(signature) === received;
}

serve(async (req) => {
  if (req.method !== "POST") return xmlResponse(405);

  try {
    const rawBody = await req.text();
    const params = new URLSearchParams(rawBody);
    if (!(await validateTwilioSignature(req, params))) {
      console.warn("[twilio-webhook] invalid signature");
      return xmlResponse(403);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const messageSid = params.get("MessageSid") || params.get("SmsSid") || "";
    const messageStatus = params.get("MessageStatus") || "";

    if (messageStatus) {
      const errorCode = params.get("ErrorCode");
      const errorMessage = params.get("ErrorMessage");
      await admin
        .from("sigzap_messages")
        .update({
          message_status: messageStatus,
          provider_error_code: errorCode || null,
          provider_error_message: errorMessage || null,
        })
        .eq("provider", "twilio")
        .eq("provider_message_id", messageSid);
      return xmlResponse();
    }

    const from = params.get("From") || "";
    const to = params.get("To") || "";
    const contactPhone = phoneE164(from);
    const senderPhone = phoneE164(to);
    if (!messageSid || !contactPhone || !senderPhone) {
      console.warn("[twilio-webhook] missing message identity");
      return xmlResponse(400);
    }

    const { data: duplicate } = await admin
      .from("sigzap_messages")
      .select("id")
      .eq("provider", "twilio")
      .eq("provider_message_id", messageSid)
      .maybeSingle();
    if (duplicate) return xmlResponse();

    const { data: sender } = await admin
      .from("whatsapp_official_senders")
      .select("id, sender_sid, display_name")
      .eq("phone_e164", senderPhone)
      .maybeSingle();
    if (!sender) {
      console.error("[twilio-webhook] sender not synchronized", senderPhone);
      return xmlResponse(500);
    }

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
          name: sender.display_name || `WhatsApp oficial ${senderPhone}`,
          phone_number: senderPhone,
          status: "connected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingInstance.id)
        .select("id")
        .single()
      : await admin
        .from("sigzap_instances")
        .insert({
        name: sender.display_name || `WhatsApp oficial ${senderPhone}`,
        phone_number: senderPhone,
        status: "connected",
        provider: "twilio",
        external_ref: sender.sender_sid,
        updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    if (instanceError) throw instanceError;

    const { data: lead } = await admin
      .from("leads")
      .select("id")
      .eq("phone_e164", contactPhone)
      .maybeSingle();

    const contactJid = `${phoneDigits(contactPhone)}@s.whatsapp.net`;
    const profileName = params.get("ProfileName") || contactPhone;
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
          contact_phone: contactPhone,
          contact_name: profileName,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingContact.id)
        .select("id")
        .single()
      : await admin
        .from("sigzap_contacts")
        .insert({
        contact_jid: contactJid,
        contact_phone: contactPhone,
        contact_name: profileName,
        instance_id: instance.id,
        updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();
    if (contactError) throw contactError;

    const { data: existingConversation } = await admin
      .from("sigzap_conversations")
      .select("id, unread_count")
      .eq("contact_id", contact.id)
      .eq("instance_id", instance.id)
      .maybeSingle();

    const now = new Date();
    const serviceWindowExpiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    let conversationId: string;
    if (existingConversation) {
      conversationId = existingConversation.id;
      const { error } = await admin
        .from("sigzap_conversations")
        .update({
          lead_id: lead?.id || null,
          last_message_text: params.get("Body") || `[${params.get("MessageType") || "mídia"}]`,
          last_message_at: now.toISOString(),
          unread_count: (existingConversation.unread_count || 0) + 1,
          service_window_expires_at: serviceWindowExpiresAt,
          updated_at: now.toISOString(),
        })
        .eq("id", conversationId);
      if (error) throw error;
    } else {
      const { data: created, error } = await admin
        .from("sigzap_conversations")
        .insert({
          contact_id: contact.id,
          instance_id: instance.id,
          lead_id: lead?.id || null,
          last_message_text: params.get("Body") || `[${params.get("MessageType") || "mídia"}]`,
          last_message_at: now.toISOString(),
          unread_count: 1,
          status: "open",
          service_window_expires_at: serviceWindowExpiresAt,
        })
        .select("id")
        .single();
      if (error) throw error;
      conversationId = created.id;
    }

    const numMedia = Number(params.get("NumMedia") || 0);
    const rawPayload = Object.fromEntries(params.entries());
    const { error: messageError } = await admin.from("sigzap_messages").insert({
      conversation_id: conversationId,
      wa_message_id: messageSid,
      provider: "twilio",
      provider_message_id: messageSid,
      from_me: false,
      sender_jid: from,
      message_text: params.get("Body") || null,
      message_type: numMedia > 0 ? "media" : "text",
      message_status: "received",
      media_url: numMedia > 0 ? params.get("MediaUrl0") : null,
      media_mime_type: numMedia > 0 ? params.get("MediaContentType0") : null,
      raw_payload: rawPayload,
      sent_at: now.toISOString(),
    });
    if (messageError) throw messageError;

    return xmlResponse();
  } catch (error) {
    console.error("[twilio-webhook]", error);
    return xmlResponse(500);
  }
});
