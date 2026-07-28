import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function twilioAuthorization() {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!sid || !token) throw new Error("twilio_secrets_not_configured");
  return `Basic ${btoa(`${sid}:${token}`)}`;
}

async function twilioFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`https://content.twilio.com${path}`, {
    ...init,
    headers: {
      Authorization: twilioAuthorization(),
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
    const { data: { user }, error: userError } = await auth.auth.getUser();
    if (userError || !user) return response({ ok: false, error: "unauthorized" }, 401);

    const input = await req.json().catch(() => ({}));
    const action = input.action || "sync";

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
      });

      await admin.from("whatsapp_official_templates").upsert({
        content_sid: created.sid,
        friendly_name: created.friendly_name,
        language: created.language,
        content_type: "twilio/text",
        body,
        variables,
        approval_status: "unsubmitted",
        twilio_payload: created,
        created_by: user.id,
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

      const approval = await twilioFetch(`/v1/Content/${contentSid}/ApprovalRequests/whatsapp`, {
        method: "POST",
        body: JSON.stringify({ name, category }),
      });
      await admin.from("whatsapp_official_templates").update({
        category,
        approval_status: approval.status || "received",
        rejection_reason: approval.rejection_reason || null,
        updated_at: new Date().toISOString(),
      }).eq("content_sid", contentSid);
      return response({ ok: true, approval });
    }

    const remote = await twilioFetch("/v1/ContentAndApprovals?PageSize=500");
    for (const item of remote.contents || []) {
      const wa = item.approvals?.whatsapp || {};
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
        twilio_payload: item,
        updated_at: new Date().toISOString(),
      }, { onConflict: "content_sid" });
    }
    return response({ ok: true, synced: (remote.contents || []).length });
  } catch (error) {
    console.error("twilio-content-templates", error);
    return response({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
