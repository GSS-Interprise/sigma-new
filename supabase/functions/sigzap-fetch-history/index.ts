import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify user authentication using anon client + getClaims
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role client for data operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { conversationId, page = 1 } = await req.json();
    const limit = 50;

    if (!conversationId) {
      return new Response(
        JSON.stringify({ error: "conversationId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Get conversation details with instance and contact
    const { data: conversa, error: convError } = await supabase
      .from("sigzap_conversations")
      .select(`
        id,
        contact:sigzap_contacts(contact_jid, contact_phone),
        instance:sigzap_instances(name, instance_uuid)
      `)
      .eq("id", conversationId)
      .single();

    if (convError || !conversa) {
      return new Response(
        JSON.stringify({ error: "Conversa não encontrada" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const contact = conversa.contact as any;
    const instance = conversa.instance as any;

    if (!instance?.name || !contact?.contact_jid) {
      return new Response(
        JSON.stringify({ error: "Instância ou contato inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get Evolution API config
    const { data: configItems } = await supabase
      .from("config_lista_items")
      .select("campo_nome, valor")
      .in("campo_nome", ["evolution_api_url", "evolution_api_key"]);

    let evolutionUrl = configItems?.find((i: any) => i.campo_nome === "evolution_api_url")?.valor || Deno.env.get("EVOLUTION_API_URL");
    let evolutionKey = configItems?.find((i: any) => i.campo_nome === "evolution_api_key")?.valor || Deno.env.get("EVOLUTION_API_KEY");

    if (!evolutionUrl || !evolutionKey) {
      return new Response(
        JSON.stringify({ error: "Evolution API não configurada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Call Evolution API findMessages
    console.log(`Fetching messages for instance=${instance.name}, jid=${contact.contact_jid}, page=${page}`);

    const findResponse = await fetch(`${evolutionUrl}/chat/findMessages/${instance.name}`, {
      method: "POST",
      headers: {
        "apikey": evolutionKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        where: {
          key: {
            remoteJid: contact.contact_jid,
          },
        },
        limit,
        page,
      }),
    });

    if (!findResponse.ok) {
      const errorText = await findResponse.text();
      console.error("Evolution API error:", findResponse.status, errorText);
      // Return graceful response for missing instances (404) instead of propagating the error
      if (findResponse.status === 404) {
        return new Response(
          JSON.stringify({ imported: 0, total: 0, message: "Instância não encontrada na Evolution API. Pode ter sido removida.", instance_missing: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: `Evolution API retornou ${findResponse.status}`, details: errorText }),
        { status: findResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiMessages = await findResponse.json();
    console.log(`Received ${Array.isArray(apiMessages) ? apiMessages.length : 'non-array'} messages from API`);
    
    // Log response structure for debugging
    if (!Array.isArray(apiMessages)) {
      console.log(`API response keys: ${JSON.stringify(Object.keys(apiMessages || {}))}`);
      console.log(`API response preview: ${JSON.stringify(apiMessages).substring(0, 500)}`);
    }

    // Handle both array and object responses from Evolution API
    const messagesList = Array.isArray(apiMessages) 
      ? apiMessages 
      : (apiMessages?.messages?.records || apiMessages?.messages || apiMessages?.records || apiMessages?.data || []);

    if (!Array.isArray(messagesList) || messagesList.length === 0) {
      return new Response(
        JSON.stringify({ imported: 0, total: 0, message: "Nenhuma mensagem encontrada na API" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Get existing wa_message_ids to avoid duplicates
    const waMessageIds = messagesList
      .map((m: any) => m.key?.id || m.id)
      .filter(Boolean);

    const { data: existing } = await supabase
      .from("sigzap_messages")
      .select("wa_message_id")
      .eq("conversation_id", conversationId)
      .in("wa_message_id", waMessageIds);

    const existingIds = new Set((existing || []).map(e => e.wa_message_id));

    // 5. Process and insert new messages
    let imported = 0;
    const toInsert: any[] = [];

    for (const msg of messagesList) {
      const waId = msg.key?.id || msg.id;
      if (!waId || existingIds.has(waId)) continue;

      const fromMe = msg.key?.fromMe === true;
      
      // Extract message content
      let messageText: string | null = null;
      let messageType = "text";
      let mediaUrl: string | null = null;
      let mediaMimeType: string | null = null;
      let mediaCaption: string | null = null;
      let mediaFilename: string | null = null;

      const msgContent = msg.message || {};

      if (msgContent.conversation) {
        messageText = msgContent.conversation;
        messageType = "text";
      } else if (msgContent.extendedTextMessage) {
        messageText = msgContent.extendedTextMessage.text || null;
        messageType = "text";
      } else if (msgContent.imageMessage) {
        messageType = "image";
        mediaUrl = msgContent.imageMessage.url || null;
        mediaMimeType = msgContent.imageMessage.mimetype || null;
        mediaCaption = msgContent.imageMessage.caption || null;
      } else if (msgContent.videoMessage) {
        messageType = "video";
        mediaUrl = msgContent.videoMessage.url || null;
        mediaMimeType = msgContent.videoMessage.mimetype || null;
        mediaCaption = msgContent.videoMessage.caption || null;
      } else if (msgContent.audioMessage) {
        messageType = "audio";
        mediaUrl = msgContent.audioMessage.url || null;
        mediaMimeType = msgContent.audioMessage.mimetype || null;
      } else if (msgContent.documentMessage) {
        messageType = "document";
        mediaUrl = msgContent.documentMessage.url || null;
        mediaMimeType = msgContent.documentMessage.mimetype || null;
        mediaFilename = msgContent.documentMessage.fileName || null;
      } else if (msgContent.stickerMessage) {
        messageType = "sticker";
        mediaUrl = msgContent.stickerMessage.url || null;
      } else if (msgContent.contactMessage || msgContent.contactsArrayMessage) {
        messageType = "contact";
        messageText = msgContent.contactMessage?.displayName || "Contato";
      } else if (msgContent.locationMessage) {
        messageType = "location";
        const lat = msgContent.locationMessage.degreesLatitude;
        const lng = msgContent.locationMessage.degreesLongitude;
        messageText = lat && lng ? `📍 ${lat}, ${lng}` : "Localização";
      } else if (msgContent.reactionMessage) {
        // Skip reactions
        continue;
      } else if (msgContent.protocolMessage) {
        // Skip protocol messages (deletes, etc)
        continue;
      }

      // Determine sent_at timestamp
      const timestamp = msg.messageTimestamp 
        ? new Date(typeof msg.messageTimestamp === 'number' 
            ? msg.messageTimestamp * 1000 
            : parseInt(msg.messageTimestamp) * 1000
          ).toISOString()
        : new Date().toISOString();

      // Determine status
      let status = "sent";
      if (msg.status) {
        const statusNum = typeof msg.status === 'number' ? msg.status : parseInt(msg.status);
        if (statusNum === 0 || msg.status === 'ERROR') status = 'error';
        else if (statusNum === 1 || msg.status === 'PENDING') status = 'pending';
        else if (statusNum === 2 || msg.status === 'SERVER_ACK') status = 'sent';
        else if (statusNum === 3 || msg.status === 'DELIVERY_ACK') status = 'delivered';
        else if (statusNum === 4 || msg.status === 'READ') status = 'read';
        else if (statusNum === 5 || msg.status === 'PLAYED') status = 'read';
      }

      toInsert.push({
        conversation_id: conversationId,
        wa_message_id: waId,
        from_me: fromMe,
        sender_jid: fromMe ? null : contact.contact_jid,
        message_text: messageText,
        message_type: messageType,
        message_status: status,
        media_url: mediaUrl,
        media_mime_type: mediaMimeType,
        media_caption: mediaCaption,
        media_filename: mediaFilename,
        raw_payload: msg,
        sent_at: timestamp,
      });
    }

    if (toInsert.length > 0) {
      // Insert in batches of 50
      for (let i = 0; i < toInsert.length; i += 50) {
        const batch = toInsert.slice(i, i + 50);
        const { error: insertError } = await supabase
          .from("sigzap_messages")
          .insert(batch);

        if (insertError) {
          console.error("Error inserting batch:", insertError);
          // Continue with other batches
        } else {
          imported += batch.length;
        }
      }
    }

    console.log(`✅ Imported ${imported} new messages (${existingIds.size} already existed)`);

    // 6. Update contact profile (name + photo) from Evolution API
    let profileUpdated = false;
    try {
      const profileUrl = `${evolutionUrl}/chat/fetchProfile/${instance.name}`;
      const profileResp = await fetch(profileUrl, {
        method: "POST",
        headers: { "apikey": evolutionKey, "Content-Type": "application/json" },
        body: JSON.stringify({ number: contact.contact_phone || contact.contact_jid }),
      });

      if (profileResp.ok) {
        const profileData = await profileResp.json();
        console.log(`Profile data keys: ${JSON.stringify(Object.keys(profileData || {}))}`);
        
        const newName = profileData?.name || profileData?.pushName || profileData?.verifiedName || null;
        const newPicUrl = profileData?.picture || profileData?.profilePictureUrl || profileData?.imgUrl || null;

        const updates: Record<string, string> = {};
        if (newName) updates.contact_name = newName;
        if (newPicUrl) updates.profile_picture_url = newPicUrl;

        if (Object.keys(updates).length > 0) {
          const contactId = (conversa.contact as any)?.id;
          if (contactId) {
            await supabase
              .from("sigzap_contacts")
              .update(updates)
              .eq("id", contactId);
            profileUpdated = true;
            console.log(`✅ Contact profile updated: ${JSON.stringify(updates)}`);
          }
        }
      } else {
        console.log(`Profile fetch failed: ${profileResp.status}`);
      }
    } catch (profileErr) {
      console.log(`Profile fetch error (non-blocking): ${profileErr}`);
    }

    return new Response(
      JSON.stringify({ 
        imported, 
        total: messagesList.length,
        already_existed: existingIds.size,
        page,
        has_more: messagesList.length === limit,
        profile_updated: profileUpdated,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in sigzap-fetch-history:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro interno";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
