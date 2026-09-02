import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { twilioCredentials } from "../_shared/twilio-auth.ts";
import { chakraApi, unwrapChakraPayload } from "../_shared/chakra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-send-key",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
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

/**
 * Corrige texto UTF-8 que foi interpretado como Latin-1 em alguma etapa do
 * pipeline. Isso é comum em nomes importados, mas não devemos remover acentos
 * nem substituir caracteres válidos: a mensagem precisa chegar ao médico com
 * a grafia original.
 */
function repairMojibake(value: unknown): string {
  let current = String(value ?? "");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!/[ÃÂâð�\u0080-\u009f]/.test(current)) break;
    try {
      const bytes = Uint8Array.from(
        [...current].map((character) => character.charCodeAt(0) & 0xff),
      );
      const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (decoded === current) break;
      current = decoded;
    } catch {
      break;
    }
  }
  return current;
}

// A chave interna nova do Supabase pode chegar como sb_secret, enquanto o
// gateway ainda entrega um JWT com o papel service_role. O gateway já valida
// a assinatura; aqui conferimos apenas o claim para não quebrar chamadas
// administrativas legítimas por comparação literal de chaves.
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

function resolveBinding(binding: string, context: Record<string, unknown>) {
  return binding.replace(/\{\{([^}]+)\}\}/g, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[key];
    }, context);
    return value == null ? "" : repairMojibake(value);
  }).trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authorization = req.headers.get("Authorization") || "";
    const internalSendKey = Deno.env.get("TWILIO_SEND_INTERNAL_KEY") || "";
    const isInternalSend = internalSendKey.length >= 32 &&
      req.headers.get("x-internal-send-key") === internalSendKey;
    const isServiceRole = authorization === `Bearer ${serviceRole}` ||
      hasServiceRoleClaim(authorization) || isInternalSend;
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
    const body = repairMojibake(input.body || "").trim();
    const templateVariables =
      input.template_variables && typeof input.template_variables === "object"
        ? input.template_variables
        : {};
    // Este escape existe apenas para um teste manual, autenticado com a
    // service-role, fora de qualquer campanha. Mantemos o bloqueio normal
    // para evitar que um diagnóstico vire disparo em massa enquanto a Meta
    // sinaliza a WABA como impedida de iniciar conversas.
    const diagnosticBypass = input.diagnostic_bypass === true &&
      isServiceRole &&
      !campaignLeadId &&
      Boolean(leadIdInput) &&
      Boolean(senderIdInput) &&
      Boolean(templateIdInput);

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
          .select(
            "id, nome, nome_remetente, briefing_ia, whatsapp_provider, official_template_id, official_sender_id, official_template_variables",
          )
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
      if (
        !(["twilio", "chakra"] as string[]).includes(campaign.whatsapp_provider)
      ) {
        return json(
          { ok: false, error: "campaign_not_official_provider" },
          409,
        );
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
        .select("external_ref, provider, twilio_account_key")
        .eq("id", data.instance_id)
        .single();
      if (instanceError) throw instanceError;
      if (!(["twilio", "chakra"] as string[]).includes(instance.provider)) {
        return json(
          { ok: false, error: "conversation_not_official_provider" },
          409,
        );
      }
      conversation = { ...data, instance };

      const { data: leadData, error: leadError } = await admin
        .from("leads")
        .select("id, nome, phone_e164")
        .eq("id", data.lead_id)
        .single();
      if (leadError) throw leadError;
      lead = leadData;
    } else if (leadIdInput && (isInternalSend || isServiceRole)) {
      const { data: leadData, error: leadError } = await admin
        .from("leads")
        .select("id, nome, phone_e164")
        .eq("id", leadIdInput)
        .single();
      if (leadError) throw leadError;
      lead = leadData;
    } else {
      return json({
        ok: false,
        error: "campaign_lead_or_conversation_required",
      }, 400);
    }

    const cleanLeadName = repairMojibake(lead?.nome || "").trim();
    const toPhone = e164(lead?.phone_e164 || "");
    if (!toPhone) {
      return json({ ok: false, error: "lead_without_valid_phone" }, 400);
    }

    let senderQuery = admin
      .from("whatsapp_official_senders")
      .select(
        "id, provider, sender_sid, phone_e164, display_name, status, twilio_account_key, chakra_connection_id, chakra_plugin_id, chakra_phone_number_id",
      )
      .in("status", ["approved", "online", "active", "activated", "connected"]);
    if (campaign?.whatsapp_provider) {
      senderQuery = senderQuery.eq("provider", campaign.whatsapp_provider);
    }
    if (campaign?.official_sender_id) {
      senderQuery = senderQuery.eq("id", campaign.official_sender_id);
    }
    if (senderIdInput && (isInternalSend || isServiceRole)) {
      senderQuery = senderQuery.eq("id", senderIdInput);
    }
    if (conversation?.instance?.external_ref) {
      senderQuery = senderQuery.eq(
        "sender_sid",
        conversation.instance.external_ref,
      );
    }
    const { data: senders, error: senderError } = await senderQuery.limit(2);
    if (senderError) throw senderError;
    if (!senders || senders.length !== 1) {
      return json({
        ok: false,
        error: senders?.length
          ? "campaign_sender_required"
          : "no_official_sender_available",
      }, 409);
    }
    const sender = senders[0];
    if (
      !["approved", "online", "active", "activated", "connected"].includes(
        String(sender.status).toLowerCase(),
      )
    ) {
      return json({
        ok: false,
        error: "official_sender_not_active",
        sender_status: sender.status,
      }, 409);
    }

    // "connected" no Chakra/Sigma significa somente que o número está
    // vinculado. A Meta pode continuar bloqueando conversas iniciadas pela
    // empresa (por exemplo, quando o meio de pagamento da WABA falha). Sem
    // esta checagem o disparo ficava parecendo pendente no Sigma, embora nunca
    // pudesse ser aceito pelo provedor.
    if (sender.provider === "chakra") {
      const { data: chakraConnection, error: chakraConnectionError } =
        await admin
          .from("whatsapp_chakra_connections")
          .select(
            "id, status, name_status, provider_payload, webhook_configured",
          )
          .eq("phone_number_id", sender.chakra_phone_number_id || "")
          .maybeSingle();
      if (chakraConnectionError) throw chakraConnectionError;
      if (!chakraConnection) {
        return json({ ok: false, error: "chakra_connection_not_found" }, 409);
      }

      const payload = (chakraConnection.provider_payload || {}) as Record<
        string,
        any
      >;
      const phone = (payload.phone || payload) as Record<string, any>;
      const entities = Array.isArray(phone.healthStatus?.entities)
        ? phone.healthStatus.entities as Array<Record<string, any>>
        : [];
      const blockedEntity = entities.find((entity) =>
        String(entity.can_send_message || "").toUpperCase() === "BLOCKED"
      );
      if (blockedEntity) {
        // O Chakra já aceitou e entregou um envio controlado mesmo com este
        // snapshot marcado como BLOCKED. Mantemos o alerta nos logs e deixamos
        // a resposta real do provedor decidir; bloquear antes escondia a causa
        // e paralisava campanhas de coexistência válidas.
        const providerError = Array.isArray(blockedEntity.errors)
          ? blockedEntity.errors[0]
          : null;
        console.warn("[chakra] health snapshot advisory", {
          entity: blockedEntity.entity_type || null,
          provider_code: providerError?.error_code || null,
        });
      }
    }

    let template: any = null;
    // Em uma conversa existente, texto livre deve continuar sendo texto livre.
    // O template só é automático no primeiro contato; depois disso precisa ser
    // escolhido explicitamente pela operadora quando a janela estiver fechada.
    const templateId = templateIdInput ||
      (!conversationIdInput ? campaign?.official_template_id : "") || "";
    if (templateId) {
      const { data, error } = await admin
        .from("whatsapp_official_templates")
        .select(
          "id, provider, content_sid, approval_status, friendly_name, body, variables, twilio_account_key, language, twilio_payload",
        )
        .eq("id", templateId)
        .single();
      if (error) throw error;
      if (data.provider && data.provider !== sender.provider) {
        return json(
          { ok: false, error: "template_sender_provider_mismatch" },
          409,
        );
      }
      if (data.approval_status !== "approved") {
        return json({ ok: false, error: "template_not_approved" }, 409);
      }
      if (
        sender.provider === "twilio" &&
        data.twilio_account_key !== sender.twilio_account_key
      ) {
        return json({
          ok: false,
          error: "twilio_sender_template_account_mismatch",
        }, 409);
      }
      if (
        sender.provider === "chakra" && /\uFFFD|Ã/.test(String(data.body || ""))
      ) {
        return json({
          ok: false,
          error: "chakra_template_text_corrupted",
          action_required:
            "Sincronize ou reenvie um template com texto UTF-8 correto antes de disparar.",
        }, 409);
      }
      template = data;
    }

    let resolvedTemplateVariables: Record<string, string> = {};
    if (template) {
      const configuredBindings = Object.keys(templateVariables).length > 0
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
      // A conexão Chakra pode ter sido criada pelo sincronizador com
      // `chakra:<phone_number_id>` como external_ref, enquanto o sender
      // guarda o handle do plugin. Reutilizar pelo telefone evita tentar
      // inserir uma segunda instância com o mesmo nome e perder o envio.
      let existingInstance: { id: string } | null = null;
      if (sender.provider === "chakra") {
        const byPhone = await admin
          .from("sigzap_instances")
          .select("id")
          .eq("provider", sender.provider)
          .eq("phone_number", sender.phone_e164)
          .maybeSingle();
        if (byPhone.error) throw byPhone.error;
        existingInstance = byPhone.data;
      }
      if (!existingInstance) {
        const byExternalRef = await admin
          .from("sigzap_instances")
          .select("id")
          .eq("provider", sender.provider)
          .eq("external_ref", sender.sender_sid)
          .maybeSingle();
        if (byExternalRef.error) throw byExternalRef.error;
        existingInstance = byExternalRef.data;
      }

      const { data: instance, error: instanceError } = existingInstance
        ? await admin
          .from("sigzap_instances")
          .update({
            // Keep the existing name: a legacy deleted instance can still
            // reserve the friendly name via the table's unique constraint.
            phone_number: sender.phone_e164,
            status: "connected",
            twilio_account_key: sender.twilio_account_key,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingInstance.id)
          .select("id")
          .single()
        : await admin
          .from("sigzap_instances")
          .insert({
            name: sender.display_name ||
              `WhatsApp oficial ${sender.phone_e164}`,
            phone_number: sender.phone_e164,
            status: "connected",
            provider: sender.provider,
            external_ref: sender.sender_sid,
            twilio_account_key: sender.twilio_account_key,
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
            contact_name: cleanLeadName || toPhone,
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
            contact_name: cleanLeadName || toPhone,
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

    let serviceWindowOpen = conversation.service_window_expires_at &&
      new Date(conversation.service_window_expires_at).getTime() > Date.now();
    // Recuperação para mensagens recebidas antes da correção do receiver ou
    // quando o provedor grava a conversa antes de atualizar seu resumo. A
    // janela continua estritamente limitada a 24h da última mensagem inbound.
    if (!serviceWindowOpen && conversation.id) {
      const { data: latestInbound, error: latestInboundError } = await admin
        .from("sigzap_messages")
        .select("sent_at")
        .eq("conversation_id", conversation.id)
        .eq("from_me", false)
        .order("sent_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestInboundError) throw latestInboundError;
      const latestInboundAt = latestInbound?.sent_at
        ? new Date(latestInbound.sent_at).getTime()
        : 0;
      const recoveredExpiry = latestInboundAt
        ? latestInboundAt + 24 * 60 * 60 * 1000
        : 0;
      serviceWindowOpen = recoveredExpiry > Date.now();
      if (serviceWindowOpen) {
        await admin
          .from("sigzap_conversations")
          .update({
            service_window_expires_at: new Date(recoveredExpiry).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", conversation.id);
      }
    }
    if (!template && !serviceWindowOpen) {
      return json({
        ok: false,
        error: "approved_template_required_outside_service_window",
      }, 409);
    }
    if (!template && !body) {
      return json({ ok: false, error: "message_body_required" }, 400);
    }

    let providerMessage: Record<string, any>;
    if (sender.provider === "chakra") {
      const pluginId = String(sender.chakra_plugin_id || "");
      const phoneNumberId = String(sender.chakra_phone_number_id || "");
      if (!pluginId || !phoneNumberId) {
        return json({ ok: false, error: "chakra_sender_not_configured" }, 409);
      }

      const payload = template
        ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: digits(toPhone),
          type: "template",
          template: {
            name: template.friendly_name,
            language: {
              policy: "deterministic",
              code: template.language || "pt_BR",
            },
            ...(Object.keys(resolvedTemplateVariables).length > 0
              ? {
                components: [{
                  type: "body",
                  parameters: Object.keys(resolvedTemplateVariables).sort((
                    a,
                    b,
                  ) => Number(a) - Number(b))
                    .map((position) => ({
                      type: "text",
                      text: resolvedTemplateVariables[position],
                    })),
                }],
              }
              : {}),
          },
        }
        : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: digits(toPhone),
          type: "text",
          text: { body },
        };
      const chakraResponse = await chakraApi(
        `/v1/ext/plugin/whatsapp/${pluginId}/api/v24.0/${phoneNumberId}/messages`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      const result = unwrapChakraPayload(chakraResponse);
      const messageId = String(
        result.messages?.[0]?.id || result.messageId || result.message_id ||
          result.id || crypto.randomUUID(),
      );
      providerMessage = {
        ...result,
        sid: messageId,
        id: messageId,
        status: String(result.status || "queued").toLowerCase(),
      };
    } else {
      const callbackUrl = Deno.env.get("TWILIO_STATUS_CALLBACK_URL") ||
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

      const credentials = twilioCredentials(sender.twilio_account_key);
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
      providerMessage = twilioMessage;
    }

    const now = new Date().toISOString();
    const visibleBody = repairMojibake(template
      ? Object.entries(resolvedTemplateVariables).reduce(
        (text, [position, value]) => text.replaceAll(`{{${position}}}`, value),
        template.body || `[Template: ${template.friendly_name}]`,
      )
      : body);
    const { error: messageError } = await admin.from("sigzap_messages").insert({
      conversation_id: conversation.id,
      campanha_lead_id: campaignLeadId || null,
      wa_message_id: providerMessage.sid || providerMessage.id,
      provider: sender.provider,
      provider_message_id: providerMessage.sid || providerMessage.id,
      from_me: true,
      sent_by_user_id: user?.id || null,
      message_text: visibleBody,
      message_type: "text",
      message_status: providerMessage.status || "queued",
      raw_payload: providerMessage,
      sent_at: now,
    });
    if (messageError) throw messageError;

    if (campaignLeadId) {
      const { error: accountError } = await admin.rpc(
        "account_whatsapp_campaign_send",
        { p_campanha_lead_id: campaignLeadId },
      );
      if (accountError) throw accountError;
    }

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
          // Sem este vínculo o disparo existe no WhatsApp, mas fica invisível
          // para a contagem diária e para a conversa unificada do lead.
          conversa_id: conversation.id,
          // A API aceitou a tentativa; a confirmação final chega pelo
          // webhook. O contador da campanha é corrigido se esse webhook
          // posteriormente informar falha.
          envio_status: "pending",
          next_retry_at: null,
          erro_envio: null,
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
      message_sid: providerMessage.sid || providerMessage.id,
      status: providerMessage.status,
      provider: sender.provider,
      conversation_id: conversation.id,
      ...(diagnosticBypass ? { diagnostic_bypass: true } : {}),
    });
  } catch (error) {
    console.error("[twilio-send]", error);
    return json({
      ok: false,
      error: errorMessage(error),
    }, 500);
  }
});
