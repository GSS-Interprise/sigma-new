import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeTwilioAccountKey, twilioAuthorization } from "../_shared/twilio-auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-sync-key",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function twilioFetch(path: string, init: RequestInit = {}, accountKey = "principal") {
  return twilioFetchUrl(`https://content.twilio.com${path}`, init, accountKey);
}

async function twilioFetchUrl(url: string, init: RequestInit = {}, accountKey = "principal") {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: twilioAuthorization(accountKey),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const raw = await res.text();
  let payload: any = {};
  try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
  if (!res.ok) throw new Error(`twilio_${res.status}:${payload.message || raw.slice(0, 300)}`);
  return payload;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });
    const authorization = req.headers.get("Authorization") || "";
    const serviceRoleToken = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const internalSyncKey = Deno.env.get("TWILIO_INTERNAL_SYNC_KEY") || "";
    const isInternalSync =
      internalSyncKey.length >= 32 &&
      req.headers.get("x-internal-sync-key") === internalSyncKey;
    const isServiceRole =
      authorization === `Bearer ${serviceRoleToken}` ||
      isInternalSync;
    const { data: { user }, error: userError } = isServiceRole
      ? { data: { user: null }, error: null }
      : await auth.auth.getUser();
    if (!isServiceRole && (userError || !user)) {
      return response({ ok: false, error: "unauthorized" }, 401);
    }

    const input = await req.json().catch(() => ({}));
    const action = input.action || "sync";
    const accountKey = normalizeTwilioAccountKey(input.account_key);
    if (accountKey !== "principal" && !isInternalSync && !isServiceRole) {
      const { data: knownSender } = await admin
        .from("whatsapp_official_senders")
        .select("id")
        .eq("twilio_account_key", accountKey)
        .limit(1)
        .maybeSingle();
      if (!knownSender) return response({ ok: false, error: "twilio_account_key_requires_internal_access" }, 403);
    }

    if (action === "sync_senders") {
      const payload = await twilioFetchUrl("https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp", {}, accountKey);
      const senders = payload.senders || payload.channel_senders || [];

      for (const sender of senders) {
        const senderAddress = String(
          sender.sender_id || sender.sender || sender.phone_number || sender.address || "",
        );
        const phone = senderAddress.replace(/^whatsapp:/i, "").trim();
        const sid = String(sender.sid || sender.sender_sid || sender.id || "");
        if (!sid || !phone) continue;

        await admin.from("whatsapp_official_senders").upsert({
          sender_sid: sid,
          phone_e164: phone.startsWith("+") ? phone : `+${phone.replace(/\D/g, "")}`,
          display_name: sender.profile?.name || sender.display_name || sender.friendly_name || null,
          status: String(sender.status || sender.configuration_status || "unknown").toLowerCase(),
          quality_rating: sender.quality_rating || sender.quality?.rating || null,
          messaging_service_sid: sender.messaging_service_sid || null,
          twilio_account_key: accountKey,
          webhook_url: sender.webhook_url || sender.webhook?.url || null,
          provider_payload: sender,
          updated_at: new Date().toISOString(),
        }, { onConflict: "sender_sid" });
      }

      return response({ ok: true, synced: senders.length, senders });
    }

    if (action === "configure_sender_webhook") {
      const senderSid = String(input.sender_sid || "");
      const webhookUrl = String(input.webhook_url || "");
      if (!/^XE[0-9a-f]{32}$/i.test(senderSid) || !webhookUrl.startsWith("https://")) {
        return response({ ok: false, error: "invalid_sender_or_webhook_url" }, 400);
      }

      const { data: senderRow } = await admin
        .from("whatsapp_official_senders")
        .select("twilio_account_key")
        .eq("sender_sid", senderSid)
        .maybeSingle();
      const senderAccountKey = normalizeTwilioAccountKey(senderRow?.twilio_account_key || accountKey);
      const sender = await twilioFetchUrl(
        `https://messaging.twilio.com/v2/Channels/Senders/${senderSid}`,
        {
          method: "POST",
          body: JSON.stringify({
            webhook: {
              callback_url: webhookUrl,
              callback_method: "POST",
              status_callback_url: webhookUrl,
              status_callback_method: "POST",
            },
          }),
        },
        senderAccountKey,
      );
      await admin
        .from("whatsapp_official_senders")
        .update({
          webhook_url: webhookUrl,
          provider_payload: sender,
          twilio_account_key: senderAccountKey,
          updated_at: new Date().toISOString(),
        })
        .eq("sender_sid", senderSid);
      return response({ ok: true, sender });
    }

    if (action === "create") {
      const friendlyName = String(input.friendly_name || "").trim();
      const language = String(input.language || "pt_BR");
      const body = String(input.body || "").trim();
      const variables = input.variables && typeof input.variables === "object" ? input.variables : {};
      if (!friendlyName || !body) return response({ ok: false, error: "name_and_body_required" }, 400);

      const created = await twilioFetch("/v1/Content", {
        method: "POST",
        body: JSON.stringify({
          friendly_name: friendlyName,
          language,
          variables,
          types: { "twilio/text": { body } },
        }),
      }, accountKey);

      await admin.from("whatsapp_official_templates").upsert({
        content_sid: created.sid,
        friendly_name: created.friendly_name,
        language: created.language,
        content_type: "twilio/text",
        body,
        variables,
        twilio_account_key: accountKey,
        approval_status: "unsubmitted",
        twilio_payload: created,
        created_by: user?.id || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "content_sid" });
      return response({ ok: true, template: created });
    }

    if (action === "submit") {
      const contentSid = String(input.content_sid || "");
      const name = String(input.name || "").toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const category = String(input.category || "").toUpperCase();
      if (!/^HX[0-9a-f]{32}$/i.test(contentSid)) return response({ ok: false, error: "invalid_content_sid" }, 400);
      if (!["UTILITY", "MARKETING", "AUTHENTICATION"].includes(category)) {
        return response({ ok: false, error: "invalid_category" }, 400);
      }

      const { data: existingTemplate } = await admin
        .from("whatsapp_official_templates")
        .select("twilio_account_key")
        .eq("content_sid", contentSid)
        .maybeSingle();
      const templateAccountKey = normalizeTwilioAccountKey(existingTemplate?.twilio_account_key || accountKey);
      const approval = await twilioFetch(`/v1/Content/${contentSid}/ApprovalRequests/whatsapp`, {
        method: "POST",
        body: JSON.stringify({ name, category }),
      }, templateAccountKey);
      await admin.from("whatsapp_official_templates").update({
        category,
        approval_status: approval.status || "received",
        rejection_reason: approval.rejection_reason || null,
        twilio_account_key: templateAccountKey,
        updated_at: new Date().toISOString(),
      }).eq("content_sid", contentSid);
      return response({ ok: true, approval });
    }

    const remote = await twilioFetch("/v1/ContentAndApprovals?PageSize=500", {}, accountKey);
    for (const item of remote.contents || []) {
      // ContentAndApprovals has changed shape across Twilio API versions. The
      // per-content endpoint is the source of truth for the WhatsApp review.
      const approval = await twilioFetch(`/v1/Content/${item.sid}/ApprovalRequests`, {}, accountKey)
        .catch(() => ({}));
      const wa =
        approval.whatsapp ||
        item.approvals?.whatsapp ||
        item.approval_requests?.whatsapp ||
        {};
      const typeName = Object.keys(item.types || {})[0] || "twilio/text";
      await admin.from("whatsapp_official_templates").upsert({
        content_sid: item.sid,
        friendly_name: item.friendly_name,
        language: item.language,
        category: wa.category || null,
        content_type: typeName,
        body: item.types?.[typeName]?.body || item.types?.[typeName]?.title || null,
        variables: item.variables || {},
        approval_status: wa.status || "unsubmitted",
        rejection_reason: wa.rejection_reason || null,
        twilio_account_key: accountKey,
        twilio_payload: { ...item, approval_request: approval },
        updated_at: new Date().toISOString(),
      }, { onConflict: "content_sid" });
    }
    return response({ ok: true, synced: (remote.contents || []).length });
  } catch (error) {
    console.error("twilio-content-templates", error);
    return response({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
