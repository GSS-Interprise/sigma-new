import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chakraApi,
  extractBodyText,
  extractTemplateVariables,
  templateLanguage,
  unwrapChakraPayload,
} from "../_shared/chakra.ts";

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

function webhookUrl() {
  const base = (Deno.env.get("SUPABASE_URL") || "").replace(/\/$/, "");
  return `${base}/functions/v1/chakra-webhook`;
}

// O gateway do Supabase valida o JWT desta função (verify_jwt=true). A chave
// disponível dentro das Edge Functions pode ser a secret key nova, enquanto a
// chamada administrativa usa o service_role legado; os dois representam o
// mesmo papel. Depois da validação do gateway, reconhecer o claim evita um
// falso 401 sem relaxar a proteção da função.
function hasServiceRoleClaim(authHeader: string) {
  const token = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
  if (!token) return false;
  try {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded));
    return payload?.role === "service_role";
  } catch {
    return false;
  }
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
    const isServiceRole = authHeader === `Bearer ${serviceRole}` || hasServiceRoleClaim(authHeader);
    const auth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await auth.auth.getUser();
    if (!isServiceRole && (userError || !user)) return json({ ok: false, error: "unauthorized" }, 401);
    const actorId = user?.id || null;

    const [{ data: isAdmin, error: adminError }, { data: canConfigure, error: permissionError }] = await Promise.all([
      actorId ? admin.rpc("is_admin", { _user_id: actorId }) : Promise.resolve({ data: false, error: null }),
      actorId ? admin.rpc("has_captacao_permission", { _user_id: actorId, _permission: "seigzaps_config" }) : Promise.resolve({ data: false, error: null }),
    ]);
    if (!isServiceRole && ((adminError && permissionError) || (!isAdmin && !canConfigure))) {
      return json({ ok: false, error: "disparos_config_permission_required" }, 403);
    }

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

    const configureWebhook = async (pluginId: string, force = false) => {
      const currentConfig = await chakra(`/v1/ext/plugin/whatsapp/${pluginId}/config`);
      const config = currentConfig?._data || currentConfig || {};
      const targetWebhook = webhookUrl();
      const conflictingUrls = [config.passThroughWebhookUrl, config.chakraWebhookUrl]
        .map((value: unknown) => asText(value, 500))
        .filter((value: string) => value && value !== targetWebhook);
      if (conflictingUrls.length > 0 && !force) {
        return { configured: false, targetWebhook, conflictingUrls };
      }
      const result = await chakra(`/v1/ext/plugin/whatsapp/${pluginId}/update-config`, {
        method: "POST",
        body: JSON.stringify({
          passThroughWebhookUrl: targetWebhook,
          enableMessageEchoesForPassThroughWebhook: true,
          enableSendMessageTemplateEventForPassThroughWebhook: true,
          enableChakraWebhook: true,
          chakraWebhookUrl: targetWebhook,
          whichChakraWebhookEventsToSend: ["message", "status", "message_echo", "smb_message_echo"],
        }),
      });
      if (!result?._data?.success && !result?.success) throw new Error("chakra_webhook_configuration_failed");
      return { configured: true, targetWebhook, conflictingUrls: [] };
    };

    if (action === "create_token") {
      const body: Record<string, string> = {};
      const pluginId = asText(input.pluginId, 120);
      if (pluginId) body.pluginId = pluginId;
      else {
        body.newPluginName = asText(input.newPluginName || "Sigma GSS - WhatsApp", 120);
        body.clientReferenceId = actorId || "chakra-system";
        body.clientName = asText(input.clientName || "GSS", 120);
        if (user?.email) body.clientEmail = user.email;
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
      const rawSuccess = input.data && typeof input.data === "object" ? input.data : input;
      const success = rawSuccess?._data && typeof rawSuccess._data === "object"
        ? rawSuccess._data
        : rawSuccess?.data && typeof rawSuccess.data === "object"
          ? rawSuccess.data
          : rawSuccess;
      const pluginId = asText(success.pluginId || success.plugin_id, 120);
      const wabas = Array.isArray(success.whatsappBusinessAccounts)
        ? success.whatsappBusinessAccounts
        : Array.isArray(success.wabas) ? success.wabas : [];
      const phones = Array.isArray(success.whatsappPhoneNumbers)
        ? success.whatsappPhoneNumbers
        : Array.isArray(success.phoneNumbers) ? success.phoneNumbers : [];
      if (!pluginId || phones.length === 0) return json({ ok: false, error: "connection_payload_incomplete" }, 400);

      // O Embedded Signup pode devolver todos os números do plugin. O Sigma
      // nunca deve importar automaticamente números de outra operação: a UI
      // envia o ID escolhido quando há mais de um.
      const selectedPhoneId = phoneIdFrom({
        phoneNumberId: input.phoneNumberId || success.phoneNumberId || success.selectedPhoneNumberId,
      });
      const managedPhones = selectedPhoneId
        ? phones.filter((phone: any) => phoneIdFrom(phone) === selectedPhoneId)
        : phones;
      if (managedPhones.length === 0) return json({ ok: false, error: "selected_phone_not_found" }, 400);
      if (!selectedPhoneId && managedPhones.length > 1) {
        return json({
          ok: false,
          error: "phone_selection_required",
          phones: managedPhones.map((phone: any) => ({
            phoneNumberId: phoneIdFrom(phone),
            phoneE164: phoneFrom(phone),
            displayName: phone?.verifiedName || phone?.displayName || phone?.name || null,
          })),
        }, 409);
      }

      const webhookResult = await configureWebhook(pluginId, input.forceWebhookConfig === true);
      if (!webhookResult.configured) {
        return json({
          ok: false,
          error: "chakra_webhook_conflict",
          message: "O plugin Chakra já possui um webhook de outra operação. Confirme a troca antes de sobrescrever.",
          currentWebhookUrls: webhookResult.conflictingUrls,
        }, 409);
      }

      const wabaId = asText(wabas[0]?.id || wabas[0]?.wabaId || success.wabaId, 120) || null;
      const saved: any[] = [];
      for (const phone of managedPhones) {
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
          created_by: actorId,
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          webhook_configured: true,
          webhook_configured_at: new Date().toISOString(),
          last_webhook_error: null,
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
      return json({ ok: true, saved, webhook: { configured: true, url: webhookResult.targetWebhook } });
    }

    if (action === "sync_templates") {
      const { data: connections, error: connectionError } = await admin
        .from("whatsapp_chakra_connections")
        .select("plugin_id, waba_id")
        .not("plugin_id", "is", null)
        .not("waba_id", "is", null);
      if (connectionError) throw connectionError;

      const uniqueTargets = [...new Map((connections || [])
        .map((connection: any) => [`${connection.plugin_id}:${connection.waba_id}`, connection])).values()];
      const synced: any[] = [];
      for (const target of uniqueTargets) {
        const response = await chakraApi(
          `/v1/ext/plugin/whatsapp/api/v24.0/${target.waba_id}/message_templates?limit=100`,
          { method: "GET" },
        );
        const payload = unwrapChakraPayload(response);
        const templates = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : [];
        for (const remote of templates) {
          const contentSid = `chakra:${target.plugin_id}:${remote.id || remote.name}`;
          const bodyText = extractBodyText(remote);
          const values = {
            provider: "chakra",
            content_sid: contentSid,
            friendly_name: String(remote.name || "template_chakra").slice(0, 120),
            language: templateLanguage(remote.language),
            category: String(remote.category || "MARKETING").toUpperCase(),
            content_type: "whatsapp",
            body: bodyText || null,
            variables: extractTemplateVariables(bodyText),
            approval_status: String(remote.status || "PENDING").toLowerCase(),
            rejection_reason: remote.rejected_reason || null,
            twilio_payload: { ...remote, plugin_id: target.plugin_id, waba_id: target.waba_id },
            twilio_account_key: "chakra",
            updated_at: new Date().toISOString(),
          };
          const { data: existing, error: existingError } = await admin
            .from("whatsapp_official_templates")
            .select("id")
            .eq("content_sid", contentSid)
            .maybeSingle();
          if (existingError) throw existingError;
          const result = existing
            ? await admin.from("whatsapp_official_templates").update(values).eq("id", existing.id).select("id, friendly_name, approval_status").single()
            : await admin.from("whatsapp_official_templates").insert({ ...values, created_by: actorId }).select("id, friendly_name, approval_status").single();
          if (result.error) throw result.error;
          synced.push({ ...result.data, plugin_id: target.plugin_id, waba_id: target.waba_id });
        }
      }
      return json({ ok: true, targets: uniqueTargets.length, synced });
    }

    if (action === "list_templates") {
      const { data: connection, error: connectionError } = await admin
        .from("whatsapp_chakra_connections")
        .select("plugin_id, waba_id")
        .not("plugin_id", "is", null)
        .not("waba_id", "is", null)
        .limit(1)
        .maybeSingle();
      if (connectionError) throw connectionError;
      if (!connection) return json({ ok: true, data: null });
      const response = await chakraApi(
        `/v1/ext/plugin/whatsapp/api/v24.0/${connection.waba_id}/message_templates?limit=100`,
        { method: "GET" },
      );
      return json({ ok: true, plugin_id: connection.plugin_id, waba_id: connection.waba_id, response });
    }

    if (action === "submit_ascii_test_template") {
      const { data: connections, error: connectionError } = await admin
        .from("whatsapp_chakra_connections")
        .select("plugin_id, waba_id")
        .not("plugin_id", "is", null)
        .not("waba_id", "is", null);
      if (connectionError) throw connectionError;
      const targets = [...new Map((connections || [])
        .map((connection: any) => [`${connection.plugin_id}:${connection.waba_id}`, connection])).values()];
      const submitted: any[] = [];
      const testDefinitions: Record<string, { name: string; body: string; variables: Record<string, string> }> = {
        a: {
          name: "gss_teste_ascii_20260817",
          body: "Ola, Dr(a). {{1}}. A GSS Saude tem uma oportunidade para {{2}} em {{3}}. Posso enviar os detalhes?",
          variables: { "1": "Marina", "2": "Pediatria", "3": "Chapeco SC" },
        },
        b: {
          name: "gss_teste_ascii_followup_20260817",
          body: "Ola, Dr(a). {{1}}. Podemos enviar os detalhes da oportunidade de {{2}} em {{3}}? Responda SIM para receber.",
          variables: { "1": "Marina", "2": "Pediatria", "3": "Chapeco SC" },
        },
        c: {
          name: "gss_teste_ascii_agenda_20260817",
          body: "Ola, Dr(a). {{1}}. A equipe GSS pode falar com voce sobre {{2}} em {{3}}. Qual horario e melhor?",
          variables: { "1": "Marina", "2": "Pediatria", "3": "Chapeco SC" },
        },
      };
      const selected = testDefinitions[asText(input.variant, 1).toLowerCase()] || testDefinitions.a;
      const { name, body, variables } = selected;

      for (const target of targets) {
        try {
          const response = await chakraApi(
            `/v1/ext/plugin/whatsapp/api/v24.0/${target.waba_id}/message_templates`,
            {
              method: "POST",
              body: JSON.stringify({
                category: "MARKETING",
                language: "pt_BR",
                name,
                components: [{
                  type: "BODY",
                  text: body,
                  example: { body_text: [[variables["1"], variables["2"], variables["3"]]] },
                }],
              }),
            },
          );
          const remote = unwrapChakraPayload(response);
          const remoteId = String(remote.id || remote.message_template_id || name);
          const values = {
            provider: "chakra",
            content_sid: `chakra:${target.plugin_id}:${remoteId}`,
            friendly_name: name,
            language: "pt_BR",
            category: String(remote.category || "MARKETING").toUpperCase(),
            content_type: "whatsapp",
            body,
            variables,
            approval_status: String(remote.status || "PENDING").toLowerCase(),
            rejection_reason: remote.rejected_reason || null,
            twilio_payload: { ...remote, plugin_id: target.plugin_id, waba_id: target.waba_id, source: "ascii_test" },
            twilio_account_key: "chakra",
            updated_at: new Date().toISOString(),
          };
          const saveResult = await admin
            .from("whatsapp_official_templates")
            .upsert({ ...values, created_by: actorId }, { onConflict: "content_sid" })
            .select("id, friendly_name, approval_status, rejection_reason")
            .single();
          if (saveResult.error) throw saveResult.error;
          submitted.push({ plugin_id: target.plugin_id, ...saveResult.data });
        } catch (error) {
          submitted.push({
            plugin_id: target.plugin_id,
            name,
            status: "error",
            error: error instanceof Error ? error.message : "chakra_template_submit_failed",
          });
        }
      }
      return json({ ok: true, targets: targets.length, submitted });
    }

    if (action === "submit_principal_templates") {
      const { data: connections, error: connectionError } = await admin
        .from("whatsapp_chakra_connections")
        .select("plugin_id, waba_id")
        .not("plugin_id", "is", null)
        .not("waba_id", "is", null);
      if (connectionError) throw connectionError;
      const targets = [...new Map((connections || [])
        .map((connection: any) => [`${connection.plugin_id}:${connection.waba_id}`, connection])).values()];
      const { data: sourceTemplates, error: sourceError } = await admin
        .from("whatsapp_official_templates")
        .select("friendly_name, category, language, body, variables")
        .eq("provider", "twilio")
        .eq("twilio_account_key", "principal")
        .eq("approval_status", "approved")
        .eq("language", "pt_BR");
      if (sourceError) throw sourceError;

      const submitted: any[] = [];
      for (const target of targets) {
        const existingResponse = await chakraApi(
          `/v1/ext/plugin/whatsapp/api/v24.0/${target.waba_id}/message_templates?limit=100`,
          { method: "GET" },
        );
        const existingPayload = unwrapChakraPayload(existingResponse);
        const existingNames = new Set(
          (Array.isArray(existingPayload) ? existingPayload : Array.isArray(existingPayload.data) ? existingPayload.data : [])
            .map((template: any) => String(template.name || "")),
        );

        for (const source of sourceTemplates || []) {
          const cleanName = `gss_${source.friendly_name}_v2`;
          if (!source.body || existingNames.has(cleanName)) {
            submitted.push({ plugin_id: target.plugin_id, name: cleanName, status: "already_exists_or_empty" });
            continue;
          }
          let response: any;
          try {
            response = await chakraApi(
              `/v1/ext/plugin/whatsapp/api/v24.0/${target.waba_id}/message_templates`,
              {
                method: "POST",
                body: JSON.stringify({
                  category: source.category || "MARKETING",
                  language: source.language || "pt_BR",
                  name: cleanName,
                  components: [{
                    type: "BODY",
                    text: source.body,
                    example: { body_text: [[...Object.values(source.variables || {}).map(String)]] },
                  }],
                }),
              },
            );
          } catch (error) {
            submitted.push({ plugin_id: target.plugin_id, name: cleanName, status: "error", error: error instanceof Error ? error.message : "chakra_template_submit_failed" });
            continue;
          }
          const remote = unwrapChakraPayload(response);
          const remoteId = String(remote.id || remote.message_template_id || source.friendly_name);
          const values = {
            provider: "chakra",
            content_sid: `chakra:${target.plugin_id}:${remoteId}`,
            friendly_name: cleanName,
            language: source.language || "pt_BR",
            category: String(remote.category || source.category || "MARKETING").toUpperCase(),
            content_type: "whatsapp",
            body: source.body,
            variables: source.variables || extractTemplateVariables(source.body),
            approval_status: String(remote.status || "PENDING").toLowerCase(),
            twilio_payload: { ...remote, plugin_id: target.plugin_id, waba_id: target.waba_id, source: "principal" },
            twilio_account_key: "chakra",
            updated_at: new Date().toISOString(),
          };
          const { data: existingTemplate, error: existingTemplateError } = await admin
            .from("whatsapp_official_templates")
            .select("id")
            .eq("content_sid", values.content_sid)
            .maybeSingle();
          if (existingTemplateError) throw existingTemplateError;
          const saveResult = existingTemplate
            ? await admin.from("whatsapp_official_templates").update(values).eq("id", existingTemplate.id).select("id, friendly_name, approval_status").single()
            : await admin.from("whatsapp_official_templates").insert({ ...values, created_by: actorId }).select("id, friendly_name, approval_status").single();
          const savedTemplate = saveResult.data;
          if (saveResult.error) throw saveResult.error;
          submitted.push({ plugin_id: target.plugin_id, ...savedTemplate });
        }
      }
      return json({ ok: true, targets: targets.length, submitted });
    }

    if (action === "ensure_webhook") {
      const { data: connections, error: connectionsError } = await admin
        .from("whatsapp_chakra_connections")
        .select("id, plugin_id, phone_number_id")
        .not("plugin_id", "is", null);
      if (connectionsError) throw connectionsError;
      const byPlugin = new Map<string, any[]>();
      for (const connection of connections || []) {
        const current = byPlugin.get(connection.plugin_id) || [];
        current.push(connection);
        byPlugin.set(connection.plugin_id, current);
      }
      const results: any[] = [];
      for (const [connectedPluginId, pluginConnections] of byPlugin.entries()) {
        const result = await configureWebhook(connectedPluginId, input.forceWebhookConfig === true);
        if (result.configured) {
          await admin.from("whatsapp_chakra_connections")
            .update({ webhook_configured: true, webhook_configured_at: new Date().toISOString(), last_webhook_error: null })
            .in("id", pluginConnections.map((connection) => connection.id));
        } else {
          await admin.from("whatsapp_chakra_connections")
            .update({ webhook_configured: false, last_webhook_error: "webhook_conflict" })
            .in("id", pluginConnections.map((connection) => connection.id));
        }
        results.push({ pluginId: connectedPluginId, phoneNumberIds: pluginConnections.map((connection) => connection.phone_number_id), ...result });
      }
      return json({
        ok: true,
        webhooks: results,
        signatureConfigured: Boolean(Deno.env.get("CHAKRA_WEBHOOK_SECRET")?.trim()),
      });
    }

    if (action === "refresh_status") {
      const { data: connections, error: connectionsError } = await admin
        .from("whatsapp_chakra_connections")
        .select("id, phone_number_id, provider_payload")
        .not("phone_number_id", "is", null);
      if (connectionsError) throw connectionsError;

      const refreshed: any[] = [];
      for (const connection of connections || []) {
        const response = await chakra(`/v1/ext/whatsapp-phone-number/${connection.phone_number_id}`);
        const phone = unwrapChakraPayload(response);
        const quality = phone.qualityScore?.score || phone.quality_score || null;
        const nextProviderPayload = {
          ...((connection.provider_payload || {}) as Record<string, any>),
          phone: {
            ...(((connection.provider_payload || {}) as Record<string, any>).phone || {}),
            ...phone,
          },
          refreshedAt: new Date().toISOString(),
        };
        const values = {
          phone_e164: phoneFrom(phone),
          display_name: phone.verifiedName || phone.displayName || phone.display_phone_number || null,
          status: asText(phone.status || phone.chakraStatus || "connected", 40).toLowerCase(),
          quality_rating: quality,
          messaging_limit_tier: phone.messagingLimitTier || phone.messaging_limit_tier || null,
          name_status: phone.nameStatus || phone.name_status || null,
          provider_payload: nextProviderPayload,
          updated_at: new Date().toISOString(),
        };
        const { data: saved, error: saveError } = await admin
          .from("whatsapp_chakra_connections")
          .update(values)
          .eq("id", connection.id)
          .select("phone_number_id, phone_e164, display_name, status, quality_rating, messaging_limit_tier, name_status")
          .single();
        if (saveError) throw saveError;
        await admin.from("whatsapp_official_senders")
          .update({
            phone_e164: values.phone_e164,
            display_name: values.display_name,
            status: values.status,
            quality_rating: values.quality_rating,
            messaging_limit_tier: values.messaging_limit_tier,
            name_status: values.name_status,
            provider_payload: nextProviderPayload,
            updated_at: values.updated_at,
          })
          .eq("provider", "chakra")
          .eq("chakra_phone_number_id", connection.phone_number_id);
        refreshed.push(saved);
      }
      return json({ ok: true, refreshed });
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
