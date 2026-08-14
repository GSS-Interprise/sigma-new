import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function asText(value: unknown, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function phoneFrom(value: any) {
  const raw = value?.displayPhoneNumber || value?.phoneNumber || value?.phone_number || value?.phone || "";
  const digits = String(raw).replace(/[^\d+]/g, "");
  return digits ? (digits.startsWith("+") ? digits : `+${digits}`) : null;
}

function phoneIdFrom(value: any) {
  return asText(value?.whatsappPhoneNumberId || value?.phoneNumberId || value?.phone_number_id || value?.id, 120);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const chakraKey = Deno.env.get("CHAKRA_API_KEY");
    if (!chakraKey) return json({ ok: false, error: "chakra_not_configured" }, 503);

    const admin = createClient(supabaseUrl, serviceRole);
    const authHeader = req.headers.get("Authorization") || "";
    const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await auth.auth.getUser();
    if (userError || !user) return json({ ok: false, error: "unauthorized" }, 401);

    const { data: isAdmin, error: adminError } = await admin.rpc("is_admin", { _user_id: user.id });
    if (adminError || !isAdmin) return json({ ok: false, error: "admin_required" }, 403);

    const input = await req.json().catch(() => ({}));
    const action = asText(input.action || "create_token", 40);
    const chakra = async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`https://api.chakrahq.com${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${chakraKey}`,
          "Content-Type": "application/json",
          ...(init.headers || {}),
        },
      });
      const raw = await response.text();
      let payload: any = {};
      try { payload = raw ? JSON.parse(raw) : {}; } catch { payload = { raw }; }
      if (!response.ok) throw new Error(`chakra_${response.status}:${payload?.message || payload?.error || raw.slice(0, 240)}`);
      return payload;
    };

    if (action === "create_token") {
      const body: Record<string, string> = {};
      const pluginId = asText(input.pluginId, 120);
      if (pluginId) body.pluginId = pluginId;
      else {
        body.newPluginName = asText(input.newPluginName || "Sigma GSS - WhatsApp", 120);
        body.clientReferenceId = user.id;
        body.clientName = asText(input.clientName || "GSS", 120);
        if (user.email) body.clientEmail = user.email;
      }
      const result = await chakra("/v1/ext/whatsapp-partner/create-connect-token", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const connectToken = result?._data?.connectToken || result?.connectToken;
      if (!connectToken) return json({ ok: false, error: "chakra_token_missing" }, 502);
      return json({ ok: true, connectToken, expiresInSeconds: 3600 });
    }

    if (action === "save_connection") {
      const success = input.data && typeof input.data === "object" ? input.data : input;
      const pluginId = asText(success.pluginId || success.plugin_id, 120);
      const wabas = Array.isArray(success.whatsappBusinessAccounts)
        ? success.whatsappBusinessAccounts
        : Array.isArray(success.wabas) ? success.wabas : [];
      const phones = Array.isArray(success.whatsappPhoneNumbers)
        ? success.whatsappPhoneNumbers
        : Array.isArray(success.phoneNumbers) ? success.phoneNumbers : [];
      if (!pluginId || phones.length === 0) return json({ ok: false, error: "connection_payload_incomplete" }, 400);

      const wabaId = asText(wabas[0]?.id || wabas[0]?.wabaId || success.wabaId, 120) || null;
      const saved: any[] = [];
      for (const phone of phones) {
        const phoneNumberId = phoneIdFrom(phone);
        if (!phoneNumberId) continue;
        const payload = { pluginId, wabaId, phone, connectedAt: new Date().toISOString() };
        const connection = {
          plugin_id: pluginId,
          waba_id: wabaId,
          phone_number_id: phoneNumberId,
          phone_e164: phoneFrom(phone),
          display_name: phone?.verifiedName || phone?.displayName || phone?.name || null,
          status: asText(phone?.status || phone?.codeVerificationStatus || "connected", 40).toLowerCase(),
          quality_rating: phone?.qualityRating || phone?.quality_rating || phone?.quality || null,
          messaging_limit_tier: phone?.messagingLimitTier || phone?.messaging_limit_tier || null,
          name_status: phone?.nameStatus || phone?.name_status || null,
          provider_payload: payload,
          created_by: user.id,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const { data: savedConnection, error: connectionError } = await admin
          .from("whatsapp_chakra_connections")
          .upsert(connection, { onConflict: "phone_number_id" })
          .select("*")
          .single();
        if (connectionError) throw connectionError;

        const senderSid = `chakra:${phoneNumberId}`;
        const sender = {
          provider: "chakra",
          sender_sid: senderSid,
          phone_e164: connection.phone_e164 || `+${phoneNumberId}`,
          display_name: connection.display_name,
          status: connection.status,
          quality_rating: connection.quality_rating,
          provider_payload: payload,
          chakra_connection_id: savedConnection.id,
          chakra_plugin_id: pluginId,
          chakra_waba_id: wabaId,
          chakra_phone_number_id: phoneNumberId,
          messaging_limit_tier: connection.messaging_limit_tier,
          name_status: connection.name_status,
          updated_at: new Date().toISOString(),
        };
        const { data: savedSender, error: senderError } = await admin
          .from("whatsapp_official_senders")
          .upsert(sender, { onConflict: "sender_sid" })
          .select("*")
          .single();
        if (senderError) throw senderError;
        saved.push({ connection: savedConnection, sender: savedSender });
      }
      return json({ ok: true, saved });
    }

    if (action === "list_phone_numbers") {
      const result = await chakra("/v1/ext/whatsapp-phone-number");
      return json({ ok: true, data: result });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (error) {
    console.error("chakra-connect error", error);
    return json({ ok: false, error: error instanceof Error ? error.message : "chakra_request_failed" }, 500);
  }
});
