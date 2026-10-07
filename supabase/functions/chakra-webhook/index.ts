import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  chakraApi,
  chakraButtonReply,
  chakraOutrasOportunidadesMessage,
  chakraTextMessage,
  classifyChakraButton,
  isExplicitChakraOptOut,
} from "../_shared/chakra.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-chakra-signature-256",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type AnyRecord = Record<string, any>;
type AdminClient = any;
type WebhookEvent = {
  type: string;
  payload: AnyRecord;
  phoneNumberId: string;
  wabaId: string;
  pluginId: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function firstText(...values: unknown[]) {
  return values.map((value) => text(value, 240)).find(Boolean) || "";
}

function digits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function phoneJid(value: unknown) {
  const number = digits(value);
  return number ? `${number}@s.whatsapp.net` : "";
}

function asObject(value: unknown): AnyRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AnyRecord
    : {};
}

const DELIVERY_STATUS_RANK: Record<string, number> = {
  queued: 0,
  accepted: 1,
  sent: 1,
  failed: 1,
  undelivered: 1,
  delivered: 2,
  read: 3,
};

function shouldApplyDeliveryStatus(current: string, next: string) {
  if (!current || current === next) return true;

  // Webhooks podem chegar fora de ordem. Nunca deixe um evento antigo de
  // fila/falha regredir uma mensagem que o provedor já confirmou entregue.
  if (current === "read") return false;
  if (current === "delivered" &&
    ["queued", "accepted", "sent", "failed", "undelivered"].includes(next)) {
    return false;
  }

  // Uma confirmação posterior de entrega pode corrigir um `failed` transitório
  // registrado antes do retorno final do provedor.
  if (["failed", "undelivered"].includes(current) &&
    ["delivered", "read"].includes(next)) return true;

  return (DELIVERY_STATUS_RANK[next] ?? 0) >=
    (DELIVERY_STATUS_RANK[current] ?? 0);
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function digest(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return toHex(new Uint8Array(bytes));
}

async function verifySignature(rawBody: string, request: Request) {
  const secret = Deno.env.get("CHAKRA_WEBHOOK_SECRET")?.trim();
  if (!secret) return true;
  const received = (request.headers.get("x-chakra-signature-256") || "").trim()
    .toLowerCase();
  if (!received) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  return toHex(new Uint8Array(signature)) === received;
}

function phoneNumberIdFrom(value: AnyRecord) {
  const metadata = asObject(value.metadata);
  const valueObject = asObject(value.value);
  const nestedPayload = asObject(value.payload);
  const nestedMetadata = asObject(nestedPayload.metadata);
  return firstText(
    value.phone_number_id,
    value.phoneNumberId,
    value.whatsappPhoneNumberId,
    value.whatsapp_phone_number_id,
    metadata.phone_number_id,
    metadata.phoneNumberId,
    valueObject.metadata?.phone_number_id,
    valueObject.phone_number_id,
    valueObject.phoneNumberId,
    nestedMetadata.phone_number_id,
    nestedPayload.phone_number_id,
    nestedPayload.phoneNumberId,
  );
}

function wabaIdFrom(value: AnyRecord) {
  const metadata = asObject(value.metadata);
  const valueObject = asObject(value.value);
  const nestedPayload = asObject(value.payload);
  const nestedMetadata = asObject(nestedPayload.metadata);
  return firstText(
    value.waba_id,
    value.wabaId,
    value.whatsapp_business_account_id,
    value.whatsappBusinessAccountId,
    metadata.waba_id,
    metadata.wabaId,
    valueObject.waba_id,
    valueObject.wabaId,
    nestedMetadata.waba_id,
    nestedMetadata.wabaId,
    nestedPayload.waba_id,
    nestedPayload.wabaId,
  );
}

function pluginIdFrom(value: AnyRecord) {
  const payload = asObject(value.payload);
  return firstText(
    value.pluginId,
    value.plugin_id,
    payload.pluginId,
    payload.plugin_id,
  );
}

// Reação, edição e apagar mensagem também chegam como echo, mas não são mensagem nova:
// gravá-los criava balão vazio na conversa e contava como contato com o lead.
function isEchoMessage(item: unknown) {
  return !["reaction", "edit", "revoke"].includes(
    String(asObject(item).type || "").toLowerCase(),
  );
}

function extractMetaEvents(body: AnyRecord) {
  const events: WebhookEvent[] = [];
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = asObject(change?.value);
      const type = text(change?.field || "meta_event", 80);
      const phoneNumberId = phoneNumberIdFrom(value);
      const wabaId = wabaIdFrom({ ...body, ...value });
      const pluginId = pluginIdFrom(body);
      // Meta sometimes delivers delivery statuses inside a `messages` change
      // (especially through coexistence), rather than in a separate `statuses`
      // change. Normalize both shapes here so the status updater receives one
      // concrete status item and can match the original wamid.
      if (type === "messages" && Array.isArray(value.statuses)) {
        for (const item of value.statuses) {
          events.push({
            type: "statuses",
            payload: { ...value, item },
            phoneNumberId,
            wabaId,
            pluginId,
          });
        }
      }

      // Coexistence: o que a equipe envia pelo aplicativo chega como
      // `smb_message_echoes`, com as mensagens na lista `message_echoes`. Sem abrir a
      // lista o evento era marcado como processado e a mensagem nunca era gravada.
      if (["smb_message_echoes", "smb_message_echo"].includes(type)) {
        const echoes = Array.isArray(value.message_echoes)
          ? value.message_echoes
          : [];
        for (const item of echoes.filter(isEchoMessage)) {
          events.push({
            type: "smb_message_echo",
            payload: { ...value, item },
            phoneNumberId,
            wabaId,
            pluginId,
          });
        }
        if (echoes.length) continue;
      }

      const listKey = type === "messages"
        ? "messages"
        : type === "statuses"
        ? "statuses"
        : type === "message_template_status_update"
        ? "message_template_status_update"
        : "";
      const items = listKey && Array.isArray(value[listKey])
        ? value[listKey]
        : (type === "messages" && Array.isArray(value.statuses) ? [] : [value]);
      for (const item of items) {
        events.push({
          type,
          payload: { ...value, item },
          phoneNumberId,
          wabaId,
          pluginId,
        });
      }
    }
  }
  return events;
}

function extractEvents(body: AnyRecord) {
  if (
    body.object === "whatsapp_business_account" || Array.isArray(body.entry)
  ) {
    return extractMetaEvents(body);
  }
  const eventType = firstText(body.event, body.type, body.eventType) ||
    "unknown";
  const payload = asObject(body.payload || body.data || body);
  const phoneNumberId = phoneNumberIdFrom({ ...body, payload });
  const wabaId = wabaIdFrom({ ...body, payload });
  const pluginId = pluginIdFrom({ ...body, payload });

  // Chakra coexistence emits `smb_message_echoes` with an array named
  // `message_echoes`. The previous implementation logged the envelope as
  // processed but never forwarded the individual outgoing messages, which
  // made the WhatsApp/Chakra chat look out of sync with the real device.
  if (["smb_message_echoes", "smb_message_echo"].includes(eventType)) {
    const echoes = Array.isArray(payload.message_echoes)
      ? payload.message_echoes
      : Array.isArray(payload.messageEchoes)
      ? payload.messageEchoes
      : [payload.item || payload];
    return echoes.filter(isEchoMessage).map((item) => ({
      type: "smb_message_echo",
      payload: { ...payload, item },
      phoneNumberId,
      wabaId,
      pluginId,
    }));
  }

  // Some Chakra payloads use a `messages` envelope but carry only statuses.
  // Expand them into the same normalized status events used by Meta webhooks.
  if (
    eventType === "messages" && Array.isArray(payload.statuses) &&
    !Array.isArray(payload.messages)
  ) {
    return payload.statuses.map((item) => ({
      type: "statuses",
      payload: { ...payload, item },
      phoneNumberId,
      wabaId,
      pluginId,
    }));
  }

  return [{ type: eventType, payload, phoneNumberId, wabaId, pluginId }];
}

function messageObject(item: AnyRecord, fromMe: boolean) {
  const type = firstText(item.type, item.message_type, item.messageType)
    .toLowerCase();
  const textBody = firstText(
    item.text?.body,
    item.body,
    item.message_text,
    item.text,
  );
  // Clique em botão (template ou mensagem interativa): o texto do botão é a resposta.
  const buttonReply = chakraButtonReply(item);
  if (buttonReply) return { conversation: buttonReply.text };
  if (type === "image" || item.image) {
    return {
      imageMessage: {
        caption: textBody || item.image?.caption || "",
        mimetype: item.image?.mime_type || item.image?.mimeType,
        id: item.image?.id,
      },
    };
  }
  if (type === "video" || item.video) {
    return {
      videoMessage: {
        caption: textBody || item.video?.caption || "",
        mimetype: item.video?.mime_type || item.video?.mimeType,
        id: item.video?.id,
      },
    };
  }
  if (type === "audio" || item.audio) {
    return {
      audioMessage: {
        mimetype: item.audio?.mime_type || item.audio?.mimeType,
        id: item.audio?.id,
        ptt: true,
      },
    };
  }
  if (type === "document" || item.document) {
    return {
      documentMessage: {
        fileName: item.document?.filename || item.document?.fileName,
        mimetype: item.document?.mime_type || item.document?.mimeType,
        id: item.document?.id,
      },
    };
  }
  if (type === "sticker" || item.sticker) {
    return {
      stickerMessage: {
        mimetype: item.sticker?.mime_type || item.sticker?.mimeType,
        id: item.sticker?.id,
      },
    };
  }
  // Coexistence pode entregar respostas de botoes como `unsupported` (por
  // exemplo, quando o payload interativo ainda nao e exposto pelo Chakra).
  // Antes isso caia no fallback "Mensagem sem conteudo", perdendo o contexto
  // visual e fazendo a IA tratar a interacao como uma mensagem vazia.
  if (type === "unsupported" || item.unsupported) {
    const unsupported = asObject(item.unsupported);
    return {
      interactiveMessage: {
        type: firstText(unsupported.raw_type, unsupported.type, "interativa"),
      },
    };
  }
  if (type === "location" || item.location) {
    return {
      locationMessage: {
        degreesLatitude: item.location?.latitude,
        degreesLongitude: item.location?.longitude,
        name: item.location?.name,
        address: item.location?.address,
      },
    };
  }
  return {
    conversation: textBody ||
      (fromMe ? "[Mensagem enviada pelo Chakra]" : "[Mensagem sem conteúdo]"),
  };
}

function normalizedMessage(
  eventType: string,
  eventPayload: AnyRecord,
  phoneNumberId: string,
  instanceName: string,
) {
  const root = asObject(eventPayload);
  const item = asObject(root.item || root.message || root.message_data || root);
  const fromMe =
    ["message_echo", "smb_message_echo", "smb_message_echoes"].includes(
      eventType,
    ) ||
    item.fromMe === true ||
    root.fromMe === true;
  const contact = asObject(root.contacts?.[0] || root.contact);
  const from = firstText(
    item.from,
    root.from,
    contact.wa_id,
    contact.phone,
    root.sender,
    root.sender_phone,
  );
  const to = firstText(item.to, root.to, root.recipient, root.recipient_phone);
  const remoteJid = phoneJid(fromMe ? to : from);
  const messageId = firstText(
    item.id,
    item.message_id,
    root.id,
    root.messageId,
    root.provider_message_id,
  );
  const timestamp = Number(
    item.timestamp || root.timestamp || Math.floor(Date.now() / 1000),
  );
  if (!remoteJid || !messageId) return null;
  const buttonReply = fromMe ? null : chakraButtonReply(item);
  const normalizedType = buttonReply ? "text" : firstText(
    item.type,
    item.message_type,
    item.messageType,
    item.image ? "image" : "",
    item.video ? "video" : "",
    item.audio ? "audio" : "",
    item.document ? "document" : "",
    item.sticker ? "sticker" : "",
    item.unsupported ? "interactive" : "",
    "text",
  );
  const pushName = firstText(
    contact.profile?.name,
    contact.name,
    root.pushName,
    root.contact_name,
  ) || undefined;
  return {
    provider: "chakra",
    provider_message_id: messageId,
    event: "messages.upsert",
    instance: instanceName,
    instance_name: instanceName,
    instance_uuid: `chakra:${phoneNumberId}`,
    data: {
      key: { remoteJid, fromMe, id: messageId },
      pushName,
      messageTimestamp: timestamp,
      messageType: normalizedType === "unsupported" ? "interactive" : normalizedType,
      message: messageObject(item, fromMe),
      ...(buttonReply ? { buttonReply } : {}),
    },
  };
}

async function updateConnection(
  admin: AdminClient,
  phoneNumberId: string,
  patch: AnyRecord,
) {
  await admin.from("whatsapp_chakra_connections")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("phone_number_id", phoneNumberId);
}

async function ensureInstance(admin: AdminClient, connection: AnyRecord) {
  const externalRef = `chakra:${connection.phone_number_id}`;
  const { data: existing, error: findError } = await admin.from(
    "sigzap_instances",
  )
    .select("id, name")
    .eq("provider", "chakra")
    .eq("external_ref", externalRef)
    .maybeSingle();
  if (findError) throw findError;
  // O nome da instância é globalmente único no SigZap. Prefixar com Chakra
  // evita colidir com um chip Evolution que use o mesmo nome comercial.
  const name = `Chakra ${connection.phone_e164 || connection.phone_number_id}`;
  if (existing) {
    await admin.from("sigzap_instances").update({
      name,
      phone_number: connection.phone_e164,
      profile_name: connection.display_name,
      status: "connected",
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
    return { id: existing.id, name };
  }
  const { data: created, error } = await admin.from("sigzap_instances").insert({
    name,
    phone_number: connection.phone_e164,
    profile_name: connection.display_name,
    status: "connected",
    provider: "chakra",
    external_ref: externalRef,
  }).select("id").single();
  if (error) throw error;
  return { id: created.id, name };
}

async function forwardMessage(
  supabaseUrl: string,
  serviceRole: string,
  payload: AnyRecord,
) {
  const response = await fetch(
    `${supabaseUrl}/functions/v1/receive-whatsapp-messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const responseBody = await response.text();
  let parsed: AnyRecord = {};
  try {
    parsed = responseBody ? JSON.parse(responseBody) : {};
  } catch { /* resposta sem JSON */ }
  if (!response.ok) {
    throw new Error(
      `receiver_${response.status}:${responseBody.slice(0, 300)}`,
    );
  }
  return parsed;
}

/**
 * Nota fiscal chegando pelo WhatsApp do financeiro. Fire-and-forget e isolado: a edge
 * do financeiro ignora sozinha tudo que não for documento no número dela, e qualquer
 * erro aqui não pode atrapalhar prospecção.
 */
async function forwardNfFinanceiro(
  supabaseUrl: string,
  serviceRole: string,
  payload: AnyRecord,
  phoneNumberId: string | null,
) {
  await fetch(`${supabaseUrl}/functions/v1/financeiro-nf-whatsapp-inbound`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payload, phone_number_id: phoneNumberId }),
  });
}

async function forwardCampaignAi(
  supabaseUrl: string,
  serviceRole: string,
  normalized: AnyRecord,
  instanceName: string,
  conversationId?: string,
) {
  const data = asObject(normalized.data);
  const key = asObject(data.key);
  if (key.fromMe) return;
  const phone = digits(String(key.remoteJid || "").split("@")[0]);
  const message = asObject(data.message);
  const messageText = firstText(
    message.conversation,
    message.extendedTextMessage?.text,
  );
  const messageType = firstText(
    data.messageType,
    message.interactiveMessage ? "interactive" : "",
    message.audioMessage ? "audio" : "",
    message.imageMessage ? "image" : "",
    message.videoMessage ? "video" : "",
    message.documentMessage ? "document" : "",
    "text",
  );
  const aiText = messageText || (message.interactiveMessage
    ? `[Mensagem interativa recebida${message.interactiveMessage.type ? ` · ${message.interactiveMessage.type}` : ""}]`
    : "");
  const msgId = firstText(key.id);
  if (!phone || !aiText || !msgId) return;

  const response = await fetch(
    `${supabaseUrl}/functions/v1/campanha-ia-responder`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRole}`,
        apikey: serviceRole,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phone,
        message_text: aiText,
        instance_name: instanceName,
        message_type: messageType,
        msg_id: msgId,
        conversation_id: conversationId || null,
      }),
    },
  );
  const resultText = await response.text();
  if (!response.ok) {
    console.warn(
      `[chakra] IA não respondeu (${response.status}): ${
        resultText.slice(0, 300)
      }`,
    );
  } else {
    console.log(
      `[chakra] IA acionada para ${phone}: ${resultText.slice(0, 300)}`,
    );
  }
}

/**
 * Mensagem enviada pelo aplicativo do WhatsApp (coexistence) para um lead de campanha:
 * é uma pessoa da equipe conduzindo a conversa. Registra o primeiro contato e tira a IA
 * dessa conversa. Disparo feito pelo Sigma não passa aqui: a API não gera echo.
 */
async function markManualContact(
  admin: AdminClient,
  leadId: string,
  conversationId: string | undefined,
  sentAt: string,
) {
  const { data: rows } = await admin.from("campanha_leads")
    .select(
      "id, status, humano_assumiu, data_primeiro_contato, campanha:campanha_id(status, tipo_envio)",
    )
    .eq("lead_id", leadId)
    .in("status", ["frio", "contatado", "sem_resposta", "em_conversa", "aquecido", "quente"])
    .order("created_at", { ascending: false })
    .limit(20);
  const open = (rows || []).filter((row: AnyRecord) =>
    ["ativa", "pausada"].includes(String(asObject(row.campanha).status || ""))
  );
  // Lead ainda não contatado: vale a campanha manual mais recente. Só uma, para um
  // envio não contar como primeiro contato em várias campanhas ao mesmo tempo.
  const first = open.find((row: AnyRecord) =>
    row.status === "frio" &&
    String(asObject(row.campanha).tipo_envio || "ia") === "manual"
  );
  if (first) {
    await admin.from("campanha_leads").update({
      status: "contatado",
      data_status: sentAt,
      data_primeiro_contato: first.data_primeiro_contato || sentAt,
      data_ultimo_contato: sentAt,
      humano_assumiu: true,
      canal_atual: "whatsapp",
      ...(conversationId ? { conversa_id: conversationId } : {}),
    }).eq("id", first.id).eq("status", "frio");
  }
  const ongoing = open.filter((row: AnyRecord) => row.status !== "frio").map((
    row: AnyRecord,
  ) => row.id);
  if (ongoing.length) {
    await admin.from("campanha_leads").update({
      data_ultimo_contato: sentAt,
      humano_assumiu: true,
    }).in("id", ongoing);
  }
  return { contatado: first?.id || null, em_andamento: ongoing.length };
}

async function updateDeliveryStatus(
  admin: AdminClient,
  eventPayload: AnyRecord,
) {
  const item = asObject(
    eventPayload.item || eventPayload.status || eventPayload,
  );
  // O Chakra usa dois identificadores para o mesmo envio: `messageId` é o
  // id interno do evento e `externalId` é o wamid devolvido no envio. O
  // wamid fica dentro de raw_payload.whatsappMessageId no Sigma, então não
  // podemos depender apenas das colunas provider_message_id/wa_message_id.
  const externalId = firstText(
    item.externalId,
    eventPayload.externalId,
  );
  const messageId = firstText(
    item.id,
    item.message_id,
    item.messageId,
    eventPayload.id,
  );
  const status = firstText(
    item.status,
    item.deliveryStatus,
    eventPayload.status,
    eventPayload.deliveryStatus,
    eventPayload.message_status,
  ).toLowerCase();
  if (!messageId || !status) return;
  let message: AnyRecord | null = null;
  const candidates = [...new Set([messageId, externalId].filter(Boolean))];

  // pedido de NF do financeiro: enviada → entregue → lida, para a tela de cobrança.
  // Isolado: falha aqui não pode travar o status das mensagens de campanha.
  for (const candidate of candidates) {
    try {
      await admin.rpc("fin_nf_status_entrega", { p_wamid: candidate, p_status: status });
    } catch (error) {
      console.warn("[chakra] status de entrega do pedido de NF", error);
    }
  }

  // Evita montar filtros `.or(...)` com IDs externos que podem conter
  // caracteres especiais (como os pontos do wamid).
  for (const candidate of candidates) {
    const byProviderId = await admin.from("sigzap_messages")
      .select("id")
      .eq("provider", "chakra")
      .eq("provider_message_id", candidate)
      .limit(1)
      .maybeSingle();
    if (byProviderId.data?.id) {
      message = byProviderId.data;
      break;
    }

    const byWhatsAppId = await admin.from("sigzap_messages")
      .select("id")
      .eq("provider", "chakra")
      .eq("wa_message_id", candidate)
      .limit(1)
      .maybeSingle();
    if (byWhatsAppId.data?.id) {
      message = byWhatsAppId.data;
      break;
    }
  }

  if (!message && externalId) {
    const byRawPayload = await admin.from("sigzap_messages")
      .select("id")
      .eq("provider", "chakra")
      .contains("raw_payload", { whatsappMessageId: externalId })
      .limit(1)
      .maybeSingle();
    message = byRawPayload.data ?? null;
  }
  if (message?.id) {
    const { data: currentMessage, error: currentMessageError } = await admin
      .from("sigzap_messages")
      .select("id, message_status, raw_payload, conversation_id, campanha_lead_id")
      .eq("id", message.id)
      .maybeSingle();
    if (currentMessageError) throw currentMessageError;
    const currentStatus = firstText(currentMessage?.message_status).toLowerCase();
    if (!shouldApplyDeliveryStatus(currentStatus, status)) return;

    // O Chakra normaliza alguns erros no nível de `errors`/`error`, mas os
    // eventos reais de Coexistence também chegam no formato
    // `errorContext.providerPayload`. Unificamos as fontes para não perder o
    // código original da Meta (ex.: 131042, 131049) na reconciliação.
    const errorContext = asObject(item.errorContext);
    const providerPayload = asObject(errorContext.providerPayload);
    const errorItem = Array.isArray(item.errors)
      ? asObject(item.errors[0])
      : Object.keys(asObject(item.error)).length
      ? asObject(item.error)
      : providerPayload;
    const patch: AnyRecord = {
      message_status: status,
      // Mantém a resposta inicial do envio e registra a confirmação recebida
      // pelo webhook para auditoria/reconciliação sem perder dados.
      raw_payload: {
        ...asObject(currentMessage?.raw_payload),
        chakra_delivery: {
          status,
          message_id: messageId,
          external_id: externalId || null,
          received_at: new Date().toISOString(),
        },
      },
    };
    if (["failed", "undelivered"].includes(status)) {
      const providerCode = firstText(
        errorItem.code,
        errorItem.error_code,
        item.error_code,
        providerPayload.code,
      );
      const providerMessage = firstText(
        errorItem.title,
        errorItem.message,
        errorItem.error,
        item.error_message,
        providerPayload.title,
        providerPayload.message,
        errorContext.message,
      );
      if (providerCode) patch.provider_error_code = providerCode;
      if (providerMessage) patch.provider_error_message = providerMessage;
    }
    await admin.from("sigzap_messages").update(patch).eq("id", message.id);

    // Reconcilia a oportunidade e o contador da campanha com o resultado
    // assíncrono real do provedor. O POST pode retornar 200 e só depois a Meta
    // informar 131042/131026; sem esta etapa o Sigma contava uma falha como
    // envio e deixava o lead preso em "contatado".
    if (["sent", "delivered", "read", "accepted", "failed", "undelivered", "error"].includes(status)) {
      let campanhaLeadId = currentMessage?.campanha_lead_id || null;
      if (!campanhaLeadId && currentMessage?.conversation_id) {
        const { data: campaignLead } = await admin
          .from("campanha_leads")
          .select("id")
          .eq("conversa_id", currentMessage.conversation_id)
          .limit(1)
          .maybeSingle();
        campanhaLeadId = campaignLead?.id || null;
      }
      if (campanhaLeadId) {
        const providerCode = [
          errorItem.code,
          errorItem.error_code,
          item.error_code,
          providerPayload.code,
        ].find((value) => value != null && String(value).trim());
        const providerMessage = [
          errorItem.title,
          errorItem.message,
          errorItem.error,
          item.error_message,
          providerPayload.title,
          providerPayload.message,
          errorContext.message,
        ].find((value) => value != null && String(value).trim());
        const { error: reconcileError } = await admin.rpc(
          "reconcile_whatsapp_delivery",
          {
            p_campanha_lead_id: campanhaLeadId,
            p_status: status,
            p_error_code: providerCode ? String(providerCode) : null,
            p_error_message: providerMessage ? String(providerMessage) : null,
          },
        );
        if (reconcileError) {
          console.warn("[chakra] falha ao reconciliar entrega da campanha", {
            campanhaLeadId,
            status,
            error: reconcileError.message,
          });
        }

        // A API pode aceitar o envio e só depois devolver 131042 no webhook.
        // Como esse bloqueio pertence à WABA/remetente, interrompemos todas as
        // campanhas que compartilham o sender antes que a fila avance.
        const normalizedProviderCode = String(providerCode || "").trim();
        const wabaPaymentBlocked = normalizedProviderCode === "131042" ||
          /business eligibility payment issue/i.test(String(providerMessage || ""));
        if (wabaPaymentBlocked && ["failed", "undelivered", "error"].includes(status)) {
          const { data: linkedLead } = await admin
            .from("campanha_leads")
            .select("campanha_id")
            .eq("id", campanhaLeadId)
            .maybeSingle();
          if (linkedLead?.campanha_id) {
            const { data: campaign } = await admin
              .from("campanhas")
              .select("id, official_sender_id")
              .eq("id", linkedLead.campanha_id)
              .maybeSingle();
            const senderId = String(campaign?.official_sender_id || "").trim();
            const pauseQuery = admin
              .from("campanhas")
              .update({ status: "pausada", next_batch_at: null })
              .eq("status", "ativa");
            if (senderId) {
              await pauseQuery.eq("official_sender_id", senderId);
            } else {
              await pauseQuery.eq("id", linkedLead.campanha_id);
            }
            console.warn("[chakra] campanhas pausadas por bloqueio de pagamento da WABA", {
              campanhaLeadId,
              providerCode: normalizedProviderCode,
              officialSenderId: senderId || null,
            });
          }
        }
      }
    }
  }
}

async function updateTemplateStatus(
  admin: AdminClient,
  eventPayload: AnyRecord,
) {
  const item = asObject(
    eventPayload.item || eventPayload.message_template_status_update ||
      eventPayload,
  );
  const templateId = firstText(
    item.message_template_id,
    item.id,
    item.template_id,
  );
  const status = firstText(
    item.event,
    item.status,
    item.message_template_status,
  ).toLowerCase();
  if (!templateId || !status) return;
  // content_sid é "chakra:<plugin>:<id da Meta>" — comparar com o id cru nunca casava,
  // então o status vindo do webhook se perdia. O sufixo é o que identifica o template.
  await admin.from("whatsapp_official_templates")
    .update({
      approval_status: status,
      rejection_reason: item.reason || null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider", "chakra")
    .like("content_sid", `%:${templateId}`);
}

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const rawBody = await request.text();
  if (!(await verifySignature(rawBody, request))) {
    return json({ ok: false, error: "invalid_chakra_signature" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRole) {
    return json({ ok: false, error: "supabase_not_configured" }, 503);
  }
  const admin = createClient(supabaseUrl, serviceRole);

  let body: AnyRecord;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }
  const events = extractEvents(body);
  const results: AnyRecord[] = [];

  for (const event of events) {
    const eventHash = await digest(
      JSON.stringify({ type: event.type, payload: event.payload }),
    );
    const receivedAt = new Date().toISOString();
    const { error: logError } = await admin.from(
      "whatsapp_chakra_webhook_events",
    ).insert({
      plugin_id: event.pluginId || null,
      phone_number_id: event.phoneNumberId || null,
      event_type: event.type,
      event_hash: eventHash,
      payload: event.payload,
      processing_status: "received",
      received_at: receivedAt,
    });
    if (logError?.code === "23505") {
      results.push({ type: event.type, status: "duplicate" });
      continue;
    }
    if (logError) throw logError;

    if (!event.phoneNumberId && !event.wabaId) {
      await admin.from("whatsapp_chakra_webhook_events").update({
        processing_status: "ignored",
      }).eq("event_hash", eventHash);
      results.push({
        type: event.type,
        status: "ignored_missing_phone_and_waba",
      });
      continue;
    }

    const connectionQuery = admin.from("whatsapp_chakra_connections")
      .select(
        "id, plugin_id, waba_id, phone_number_id, phone_e164, display_name, somente_leads",
      );
    const { data: connection } = event.phoneNumberId
      ? await connectionQuery.eq("phone_number_id", event.phoneNumberId)
        .maybeSingle()
      : event.wabaId
      ? await connectionQuery.eq("waba_id", event.wabaId).maybeSingle()
      : { data: null };
    if (!connection) {
      await admin.from("whatsapp_chakra_webhook_events").update({
        processing_status: "ignored",
      }).eq("event_hash", eventHash);
      results.push({
        type: event.type,
        phoneNumberId: event.phoneNumberId,
        status: "ignored_unmanaged_phone",
      });
      continue;
    }
    if (event.pluginId && connection.plugin_id !== event.pluginId) {
      await admin.from("whatsapp_chakra_webhook_events").update({
        processing_status: "ignored",
      }).eq("event_hash", eventHash);
      results.push({
        type: event.type,
        phoneNumberId: event.phoneNumberId,
        status: "ignored_plugin_mismatch",
      });
      continue;
    }

    // Chakra coexistence events identify the WABA, while the Sigma instance is
    // keyed by phone number. Resolve the phone once before processing so the
    // event is not discarded and status updates can match the original wamid.
    const resolvedPhoneNumberId = event.phoneNumberId ||
      connection.phone_number_id;
    if (!event.phoneNumberId && resolvedPhoneNumberId) {
      event.phoneNumberId = resolvedPhoneNumberId;
      await admin.from("whatsapp_chakra_webhook_events")
        .update({ phone_number_id: resolvedPhoneNumberId })
        .eq("event_hash", eventHash);
    }

    try {
      await updateConnection(admin, event.phoneNumberId, {
        last_webhook_event_at: receivedAt,
        last_webhook_event_type: event.type,
        last_webhook_error: null,
      });

      if (
        ["message", "message_echo", "smb_message_echo", "messages"].includes(
          event.type,
        )
      ) {
        const instance = await ensureInstance(admin, connection);
        const payload = normalizedMessage(
          event.type,
          event.payload,
          event.phoneNumberId,
          instance.name,
        );
        const contactDigits = payload
          ? digits(String(asObject(asObject(payload.data).key).remoteJid || "").split("@")[0])
          : "";
        const fromApp = event.type === "smb_message_echo";
        // Número de uso pessoal da equipe: só entra no Sigma a conversa com quem está
        // na base de leads. O resto do WhatsApp da pessoa não é gravado.
        let leadId: string | null = null;
        if (payload && contactDigits && (fromApp || connection.somente_leads)) {
          const { data } = await admin.rpc("find_lead_by_phone", {
            p_phone: `+${contactDigits}`,
          });
          leadId = (data as string | null) || null;
        }
        if (payload && connection.somente_leads && !leadId) {
          await admin.from("whatsapp_chakra_webhook_events").update({
            processing_status: "ignored",
            payload: { descartado: "contato_fora_da_base" },
          }).eq("event_hash", eventHash);
          results.push({ type: event.type, status: "ignored_not_a_lead" });
          continue;
        }
        if (payload) {
          const forwarded = await forwardMessage(
            supabaseUrl,
            serviceRole,
            payload,
          );
          const conversationId = forwarded?.data?.conversationId;
          if (fromApp && leadId) {
            const sentAt = new Date(
              Number(asObject(payload.data).messageTimestamp || Date.now() / 1000) * 1000,
            ).toISOString();
            await markManualContact(admin, leadId, conversationId, sentAt)
              .catch((error) =>
                console.warn("[chakra] falha ao registrar contato manual:", error)
              );
          }
          const messageData = asObject(payload.data);
          const messageKey = asObject(messageData.key);
          const inboundMessage = asObject(messageData.message);
          const inboundText = firstText(
            inboundMessage.conversation,
            inboundMessage.extendedTextMessage?.text,
          );
          // Clique em botão: "Sem interesse" encerra só esta vaga e pergunta sobre
          // outras oportunidades; a resposta a essa pergunta decide o bloqueio geral.
          const buttonIntent = messageKey.fromMe
            ? null
            : classifyChakraButton(messageData.buttonReply ?? null);
          const contactPhone = digits(String(messageKey.remoteJid || "").split("@")[0]);
          const replyToContact = async (message: AnyRecord) => {
            try {
              await chakraApi(
                `/v1/ext/plugin/whatsapp/${connection.plugin_id}/api/v24.0/${event.phoneNumberId}/messages`,
                { method: "POST", body: JSON.stringify(message) },
              );
            } catch (error) {
              console.warn("[chakra] falha ao responder clique de botao:", error);
            }
          };
          if (buttonIntent === "outras_sim") {
            // Fica no cadastro para futuras vagas; nada a registrar nem a mandar para a IA.
            await replyToContact(chakraTextMessage(
              contactPhone,
              "Combinado! Quando aparecer uma oportunidade com o seu perfil, a gente te avisa por aqui.",
            ));
          } else if (!messageKey.fromMe && (buttonIntent === "outras_nao" || isExplicitChakraOptOut(inboundText))) {
            // O canal oficial não passa pelo bridge Evolution. Processar o
            // descadastro antes da IA evita resposta e novo contato indevido.
            const phone = contactPhone;
            const optOutResponse = await fetch(
              `${supabaseUrl}/functions/v1/campanha-opt-out-handler`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${serviceRole}`,
                  apikey: serviceRole,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ phone, msg_text: inboundText, instance_name: "" }),
              },
            );
            if (!optOutResponse.ok) {
              throw new Error(`opt_out_handler_${optOutResponse.status}`);
            }
            if (buttonIntent === "outras_nao") {
              await replyToContact(chakraTextMessage(
                contactPhone,
                "Entendido. Não vamos mais te enviar mensagens. Se mudar de ideia, é só chamar por aqui.",
              ));
            }
          } else {
            // O receiver persiste a mensagem; Chakra precisa acionar a IA
            // diretamente porque não passa pelo bridge Evolution.
            void forwardCampaignAi(
              supabaseUrl,
              serviceRole,
              payload,
              instance.name,
              conversationId,
            )
              .catch((error) =>
                console.warn("[chakra] falha ao acionar IA:", error)
              );
            void forwardNfFinanceiro(
              supabaseUrl,
              serviceRole,
              event.payload,
              event.phoneNumberId,
            )
              .catch((error) =>
                console.warn("[chakra] falha no inbound de NF:", error)
              );
            // A IA acima registra o desinteresse NESTA campanha (e não responde);
            // aqui só perguntamos se a pessoa quer continuar recebendo outras vagas.
            if (buttonIntent === "sem_interesse") {
              await replyToContact(chakraOutrasOportunidadesMessage(contactPhone));
            }
          }
        }
      } else if (["status", "statuses"].includes(event.type)) {
        await updateDeliveryStatus(admin, event.payload);
      } else if (event.type === "message_template_status_update") {
        await updateTemplateStatus(admin, event.payload);
      }
      await admin.from("whatsapp_chakra_webhook_events").update({
        processing_status: "processed",
      }).eq("event_hash", eventHash);
      results.push({
        type: event.type,
        phoneNumberId: event.phoneNumberId,
        status: "processed",
      });
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "processing_failed";
      await admin.from("whatsapp_chakra_webhook_events").update({
        processing_status: "failed",
        error_message: message,
      }).eq("event_hash", eventHash);
      await updateConnection(admin, event.phoneNumberId, {
        last_webhook_error: message,
      });
      throw error;
    }
  }

  return json({ ok: true, processed: results });
});
