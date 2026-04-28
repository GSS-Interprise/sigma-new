import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EvolutionMessage {
  // Campos vindos diretamente da Evolution API (formato raw)
  instance?: string;
  instanceName?: string;
  remoteJid?: string;
  pushName?: string;
  messageType?: string;
  message?: {
    conversation?: string;
    extendedTextMessage?: { text?: string; contextInfo?: { quotedMessage?: any; stanzaId?: string } };
    imageMessage?: { caption?: string; mimetype?: string; url?: string };
    videoMessage?: { caption?: string; mimetype?: string; url?: string };
    audioMessage?: { mimetype?: string; url?: string; ptt?: boolean };
    documentMessage?: { fileName?: string; mimetype?: string; url?: string };
    stickerMessage?: { mimetype?: string; url?: string };
    locationMessage?: { degreesLatitude?: number; degreesLongitude?: number };
    contactMessage?: { displayName?: string };
  };
  messageId?: string;
  messageTimestamp?: number;
  fromMe?: boolean;
  status?: string;
  
  // Campos que podem vir do n8n após processamento (formato alternativo)
  contact_jid?: string;
  contact_name?: string;
  contact_phone?: string;
  instance_name?: string;
  instance_uuid?: string;
  sender_jid?: string;
  wa_message_id?: string;
  from_me?: boolean | string;
  message_text?: string;
  message_type?: string;
  message_status?: string;
  raw_payload?: any;
  event?: string;
  server_url?: string;
  source?: string;
  sender_lid?: string;
  
  // Campos novos do fluxo sigma-evo (n8n) - opcionais, ignorados no fluxo antigo
  is_forwarded?: boolean;
  forward_score?: number;
  location_data?: any;
  contact_data?: any;
  quoted_message_type?: string;
  quoted_message_participant?: string;
  
  // Campos legados
  texto?: string;
  numero?: string;
  nome?: string;
  timestamp?: number;
  eventType?: string;
}

function extractMessageContent(payload: EvolutionMessage): {
  text: string;
  type: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaCaption?: string;
  mediaFilename?: string;
  quotedMessageId?: string;
  quotedMessageText?: string;
} {
  // IMPORTANTE: O n8n pode enviar raw_payload como string JSON que precisa ser parseado
  let rawData: any = null;
  if (payload.raw_payload) {
    try {
      rawData = typeof payload.raw_payload === 'string' 
        ? JSON.parse(payload.raw_payload) 
        : payload.raw_payload;
    } catch (e) {
      console.log('⚠️ Erro ao parsear raw_payload:', e);
    }
  }
  
  // A estrutura da Evolution API é: raw_payload.data.message.{imageMessage|videoMessage|etc}
  const evolutionData = rawData?.data || (payload as any).data || {};
  const evolutionMessage = evolutionData.message || {};
  
  // Se veio processado pelo n8n com campo message_text (texto simples)
  if (payload.message_text && payload.message_type === 'text') {
    return { text: payload.message_text, type: 'text' };
  }
  
  // Se veio processado pelo n8n com campo texto
  if (payload.texto) {
    return { text: payload.texto, type: 'text' };
  }
  
  // Detectar tipo de mídia pelo message_type do n8n ou pelo campo presente na Evolution message
  const msgType = payload.message_type || evolutionData.messageType;
  
  // Para mensagens de mídia, extrair URL diretamente da estrutura Evolution
  // Estrutura: evolutionMessage.imageMessage.url, evolutionMessage.videoMessage.url, etc.
  
  // Imagem
  if (msgType === 'image' || evolutionMessage.imageMessage) {
    const imgMsg = evolutionMessage.imageMessage || {};
    return {
      text: imgMsg.caption || '[Imagem]',
      type: 'image',
      mediaUrl: imgMsg.url,
      mediaMimeType: imgMsg.mimetype,
      mediaCaption: imgMsg.caption
    };
  }
  
  // Vídeo
  if (msgType === 'video' || evolutionMessage.videoMessage) {
    const vidMsg = evolutionMessage.videoMessage || {};
    return {
      text: vidMsg.caption || '[Vídeo]',
      type: 'video',
      mediaUrl: vidMsg.url,
      mediaMimeType: vidMsg.mimetype,
      mediaCaption: vidMsg.caption
    };
  }
  
  // Áudio
  if (msgType === 'audio' || msgType === 'ptt' || evolutionMessage.audioMessage) {
    const audMsg = evolutionMessage.audioMessage || {};
    return {
      text: audMsg.ptt ? '[Mensagem de voz]' : '[Áudio]',
      type: 'audio',
      mediaUrl: audMsg.url,
      mediaMimeType: audMsg.mimetype
    };
  }
  
  // Documento
  if (msgType === 'document' || evolutionMessage.documentMessage) {
    const docMsg = evolutionMessage.documentMessage || {};
    return {
      text: `[Documento: ${docMsg.fileName || 'arquivo'}]`,
      type: 'document',
      mediaUrl: docMsg.url,
      mediaMimeType: docMsg.mimetype,
      mediaFilename: docMsg.fileName
    };
  }
  
  // Sticker
  if (msgType === 'sticker' || evolutionMessage.stickerMessage) {
    const stkMsg = evolutionMessage.stickerMessage || {};
    return {
      text: '[Sticker]',
      type: 'sticker',
      mediaUrl: stkMsg.url,
      mediaMimeType: stkMsg.mimetype
    };
  }
  
  // Localização
  if (msgType === 'location' || evolutionMessage.locationMessage) {
    const locMsg = evolutionMessage.locationMessage || {};
    return {
      text: `[Localização: ${locMsg.degreesLatitude}, ${locMsg.degreesLongitude}]`,
      type: 'location'
    };
  }
  
  // Contato
  if (msgType === 'contact' || msgType === 'vcard' || evolutionMessage.contactMessage) {
    const ctcMsg = evolutionMessage.contactMessage || {};
    return {
      text: `[Contato: ${ctcMsg.displayName || 'sem nome'}]`,
      type: 'contact'
    };
  }

  const msg = payload.message;
  if (!msg) {
    return { text: '[Mensagem sem conteúdo]', type: 'unknown' };
  }

  // Texto simples
  if (msg.conversation) {
    return { text: msg.conversation, type: 'text' };
  }

  // Texto estendido (com formatação ou citação)
  if (msg.extendedTextMessage) {
    const quoted = msg.extendedTextMessage.contextInfo;
    return {
      text: msg.extendedTextMessage.text || '',
      type: 'text',
      quotedMessageId: quoted?.stanzaId,
      quotedMessageText: quoted?.quotedMessage?.conversation || quoted?.quotedMessage?.extendedTextMessage?.text
    };
  }

  // Imagem
  if (msg.imageMessage) {
    return {
      text: msg.imageMessage.caption || '[Imagem]',
      type: 'image',
      mediaUrl: msg.imageMessage.url,
      mediaMimeType: msg.imageMessage.mimetype,
      mediaCaption: msg.imageMessage.caption
    };
  }

  // Vídeo
  if (msg.videoMessage) {
    return {
      text: msg.videoMessage.caption || '[Vídeo]',
      type: 'video',
      mediaUrl: msg.videoMessage.url,
      mediaMimeType: msg.videoMessage.mimetype,
      mediaCaption: msg.videoMessage.caption
    };
  }

  // Áudio
  if (msg.audioMessage) {
    return {
      text: msg.audioMessage.ptt ? '[Mensagem de voz]' : '[Áudio]',
      type: 'audio',
      mediaUrl: msg.audioMessage.url,
      mediaMimeType: msg.audioMessage.mimetype
    };
  }

  // Documento
  if (msg.documentMessage) {
    return {
      text: `[Documento: ${msg.documentMessage.fileName || 'arquivo'}]`,
      type: 'document',
      mediaUrl: msg.documentMessage.url,
      mediaMimeType: msg.documentMessage.mimetype,
      mediaFilename: msg.documentMessage.fileName
    };
  }

  // Sticker
  if (msg.stickerMessage) {
    return {
      text: '[Sticker]',
      type: 'sticker',
      mediaUrl: msg.stickerMessage.url,
      mediaMimeType: msg.stickerMessage.mimetype
    };
  }

  // Localização
  if (msg.locationMessage) {
    return {
      text: `[Localização: ${msg.locationMessage.degreesLatitude}, ${msg.locationMessage.degreesLongitude}]`,
      type: 'location'
    };
  }

  // Contato
  if (msg.contactMessage) {
    return {
      text: `[Contato: ${msg.contactMessage.displayName || 'sem nome'}]`,
      type: 'contact'
    };
  }

  return { text: '[Mídia não suportada]', type: 'unknown' };
}

// Função para baixar mídia do WhatsApp via Evolution API e salvar no storage
async function downloadAndStoreMedia(
  supabase: any,
  mediaUrl: string,
  instanceId: string,
  conversationId: string,
  messageId: string,
  mimeType: string,
  instanceName: string,
  serverUrl?: string,
  payloadApiKey?: string
): Promise<string | null> {
  if (!mediaUrl) {
    console.log('⚠️ URL de mídia não fornecida');
    return null;
  }

  try {
    console.log('📥 Tentando baixar mídia:', mediaUrl.substring(0, 100) + '...');
    
    // Determinar extensão do arquivo baseada no mimeType
    const extension = getExtensionFromMimeType(mimeType);
    const fileName = `${messageId}${extension}`;
    const storagePath = `${instanceId}/${conversationId}/${fileName}`;
    
    let arrayBuffer: ArrayBuffer | null = null;
    
    // Se a URL for do WhatsApp (mmg.whatsapp.net), precisamos usar a Evolution API para baixar
    if (mediaUrl.includes('mmg.whatsapp.net') || mediaUrl.includes('whatsapp.net')) {
      console.log('🔄 URL do WhatsApp detectada, usando Evolution API para download...');
      
      const evolutionUrl = serverUrl || Deno.env.get('EVOLUTION_API_URL');
      const evolutionKey = payloadApiKey || Deno.env.get('EVOLUTION_API_KEY');
      
      if (!evolutionUrl || !evolutionKey) {
        console.error('❌ Evolution API URL ou Key não configuradas');
        return null;
      }
      
      // Usar endpoint de download de mídia da Evolution
      // GET /message/getBase64FromMediaMessage/{instanceName}
      const downloadEndpoint = `${evolutionUrl}/chat/getBase64FromMediaMessage/${instanceName}`;
      
      console.log('📡 Chamando Evolution API:', downloadEndpoint);
      
      const response = await fetch(downloadEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionKey
        },
        body: JSON.stringify({
          message: {
            key: {
              id: messageId
            }
          },
          convertToMp4: false
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Erro na Evolution API:', response.status, errorText);
        
        // Fallback: tentar download direto mesmo assim
        console.log('🔄 Tentando download direto como fallback...');
        const directResponse = await fetch(mediaUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': '*/*',
          },
        });
        
        if (directResponse.ok) {
          arrayBuffer = await directResponse.arrayBuffer();
        } else {
          return null;
        }
      } else {
        const data = await response.json();
        
        if (data.base64) {
          // Converter base64 para ArrayBuffer
          const base64Data = data.base64.includes(',') 
            ? data.base64.split(',')[1] 
            : data.base64;
          
          // Decodificar base64
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          arrayBuffer = bytes.buffer;
          
          // Se a Evolution retornou o mimetype, usar ele
          if (data.mimetype) {
            mimeType = data.mimetype;
          }
          
          console.log('✅ Mídia obtida via Evolution API, tamanho:', arrayBuffer.byteLength, 'bytes');
        } else {
          console.error('❌ Evolution API não retornou base64:', JSON.stringify(data));
          return null;
        }
      }
    } else {
      // URL já é pública ou de outro servidor, fazer download direto
      console.log('🌐 URL pública detectada, fazendo download direto...');
      
      const response = await fetch(mediaUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'image/*,video/*,audio/*,*/*',
        },
      });

      if (!response.ok) {
        console.error('❌ Erro ao baixar mídia:', response.status, response.statusText);
        return null;
      }

      arrayBuffer = await response.arrayBuffer();
    }

    if (!arrayBuffer || arrayBuffer.byteLength === 0) {
      console.error('❌ Arquivo de mídia vazio');
      return null;
    }

    console.log('✅ Mídia baixada, tamanho:', arrayBuffer.byteLength, 'bytes');

    console.log('📤 Fazendo upload para storage:', storagePath);

    // Upload para o storage
    const { data, error } = await supabase.storage
      .from('sigzap-media')
      .upload(storagePath, arrayBuffer, {
        contentType: mimeType,
        upsert: true
      });

    if (error) {
      console.error('❌ Erro ao fazer upload:', error);
      return null;
    }

    // Gerar URL pública
    const { data: urlData } = supabase.storage
      .from('sigzap-media')
      .getPublicUrl(storagePath);

    console.log('✅ Mídia salva no storage:', urlData.publicUrl);
    return urlData.publicUrl;
  } catch (error) {
    console.error('❌ Erro ao processar mídia:', error);
    return null;
  }
}

function getExtensionFromMimeType(mimeType: string): string {
  const mimeToExt: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'video/mp4': '.mp4',
    'video/3gpp': '.3gp',
    'video/quicktime': '.mov',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/aac': '.aac',
    'application/pdf': '.pdf',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  };
  return mimeToExt[mimeType] || '.bin';
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const payload: EvolutionMessage = await req.json();
    console.log('📩 Payload recebido:', JSON.stringify(payload, null, 2));

    // Detecta o tipo de evento
    const eventType = payload.eventType || payload.event;
    console.log('📌 Tipo de evento:', eventType);
    
    // HANDLER: Eventos de CONTACTS (atualização de contatos da Evolution API)
    const isContactEvent = eventType === 'contacts.upsert' || eventType === 'contacts.update' || 
                           eventType === 'CONTACTS_UPSERT' || eventType === 'CONTACTS_UPDATE';
    
    if (isContactEvent) {
      console.log('👤 Evento de contatos recebido');
      
      const contactsData = (payload as any).data || [];
      const instanceName = payload.instance || payload.instanceName || payload.instance_name;
      
      if (!instanceName) {
        console.log('⚠️ Nome da instância não encontrado no evento de contatos');
        return new Response(JSON.stringify({ success: true, message: 'Instância não identificada' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Buscar instância
      const { data: instance } = await supabase
        .from('sigzap_instances')
        .select('id')
        .eq('name', instanceName)
        .maybeSingle();
      
      if (!instance) {
        console.log('⚠️ Instância não encontrada:', instanceName);
        return new Response(JSON.stringify({ success: true, message: 'Instância não encontrada' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      // Processar cada contato
      const contacts = Array.isArray(contactsData) ? contactsData : [contactsData];
      
      for (const contactInfo of contacts) {
        const contactJid = contactInfo.id || contactInfo.remoteJid;
        const contactName = contactInfo.pushName || contactInfo.name || contactInfo.notify;
        const profilePictureUrl = contactInfo.profilePictureUrl || contactInfo.imgUrl || contactInfo.profilePicThumbObj?.eurl;
        
        if (!contactJid) continue;
        
        // Preparar dados para atualização
        const updateData: Record<string, any> = {};
        if (contactName) updateData.contact_name = contactName;
        if (profilePictureUrl) updateData.profile_picture_url = profilePictureUrl;
        
        if (Object.keys(updateData).length === 0) continue;
        
        // Atualizar nome e foto do contato se existir
        const { error: updateError } = await supabase
          .from('sigzap_contacts')
          .update(updateData)
          .eq('contact_jid', contactJid)
          .eq('instance_id', instance.id);
        
        if (!updateError) {
          console.log('✅ Contato atualizado via evento CONTACTS:', contactJid, updateData);
        }
      }
      
      return new Response(JSON.stringify({ success: true, message: 'Contatos atualizados' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // IMPORTANTE: Ignorar eventos que NÃO são mensagens novas
    // messages.update = atualização de status (lida, entregue, etc) - NÃO é mensagem nova
    // Só processar: messages.upsert (nova mensagem) ou payloads sem event (formato legado)
    const isMessageUpdate = eventType === 'messages.update';
    const isNewMessage = eventType === 'messages.upsert' || !eventType;
    
    // HANDLER: Reações recebidas via messages.upsert com reactionMessage
    const rawData = (() => {
      if (payload.raw_payload) {
        try {
          return typeof payload.raw_payload === 'string' ? JSON.parse(payload.raw_payload) : payload.raw_payload;
        } catch { return null; }
      }
      return null;
    })();
    const evolutionDataCheck = rawData?.data || (payload as any).data || {};
    const evolutionMsgCheck = evolutionDataCheck.message || payload.message || {};
    const reactionMessage = evolutionMsgCheck.reactionMessage;
    
    if (reactionMessage) {
      console.log('😀 Reação recebida:', JSON.stringify(reactionMessage));
      
      // reactionMessage.key = key da mensagem sendo reagida
      // reactionMessage.text = emoji (vazio = remover reação)
      const targetKey = reactionMessage.key;
      const reactionEmoji = reactionMessage.text || '';
      const targetMessageId = targetKey?.id;
      
      if (targetMessageId) {
        const updateData: Record<string, any> = { 
          reaction: reactionEmoji || null 
        };
        
        const { error: reactionError } = await supabase
          .from('sigzap_messages')
          .update(updateData)
          .eq('wa_message_id', targetMessageId);
        
        if (reactionError) {
          console.error('❌ Erro ao salvar reação:', reactionError);
        } else {
          console.log('✅ Reação salva:', targetMessageId, '->', reactionEmoji || '(removida)');
        }
      }
      
      return new Response(JSON.stringify({ success: true, message: 'Reação processada' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const hasMessageContent = payload.message_text || payload.texto || payload.message?.conversation || 
                               payload.message?.extendedTextMessage || payload.message?.imageMessage ||
                               payload.message?.videoMessage || payload.message?.audioMessage ||
                               payload.message?.documentMessage;
    
    // Se for update de status, apenas atualizar o status da mensagem existente
    if (isMessageUpdate) {
      console.log('📝 Evento de atualização de status recebido, atualizando mensagem existente');
      
      const keyId = (payload as any).data?.keyId;
      const newStatus = (payload as any).data?.status;
      
      if (keyId && newStatus) {
        await supabase
          .from('sigzap_messages')
          .update({ message_status: newStatus })
          .eq('wa_message_id', keyId);
        console.log('✅ Status da mensagem atualizado:', keyId, '->', newStatus);
      }
      
      return new Response(JSON.stringify({ success: true, message: 'Status atualizado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Se não tem conteúdo de mensagem, ignorar
    if (!hasMessageContent && !isNewMessage) {
      console.log('📝 Evento sem conteúdo de mensagem, ignorando:', eventType);
      return new Response(JSON.stringify({ success: true, message: 'Evento ignorado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extrai dados da mensagem - suporta múltiplos formatos de payload
    // Formato Evolution API direto
    const instanceName = payload.instance || payload.instanceName || payload.instance_name || 'unknown';
    const instanceUuid = payload.instance_uuid || instanceName;
    
    // Formato Evolution: remoteJid | Formato n8n: contact_jid | Formato legado: numero
    let remoteJid = payload.remoteJid || payload.contact_jid || payload.sender_jid || payload.numero || '';

    // IMPORTANTE: Evolution API pode enviar 'lid' (Link ID) em vez do número real
    // Quando isso acontece, o número real está em remoteJidAlt ou no campo sender
    const isLidJid = remoteJid.includes('@lid');

    // Buscar número real de campos alternativos quando for lid
    const data = (payload as any).data || {};
    const key = data.key || {};
    const remoteJidAlt = key.remoteJidAlt || (payload as any).sender || '';

    // Se for lid e tiver alternativa, usar o número real
    const realJid = isLidJid && remoteJidAlt ? remoteJidAlt : remoteJid;

    // Nome do contato
    const pushName = data.pushName || payload.pushName || payload.contact_name || payload.nome || 'Desconhecido';

    // Se a mensagem é enviada ou recebida
    const fromMeValue = key.fromMe ?? payload.fromMe ?? payload.from_me;
    const fromMe = fromMeValue === true || fromMeValue === 'true';

    // ID da mensagem
    const messageId = key.id || payload.messageId || payload.wa_message_id || `msg_${Date.now()}`;

    // Timestamp
    const timestamp = data.messageTimestamp || payload.messageTimestamp || payload.timestamp || Math.floor(Date.now() / 1000);

    // Status da mensagem
    const messageStatus = data.status || payload.status || payload.message_status || 'received';

    // Canonicaliza o JID para evitar duplicar contatos/conversas (@lid vs @s.whatsapp.net)
    // Preferimos sempre o JID "real" quando disponível
    const contactJid = realJid || remoteJid;

    // Canonicaliza telefone (somente dígitos)
    const contactPhoneRaw = payload.contact_phone || (realJid ? realJid.replace(/@.*$/, '') : '');
    const contactPhone = String(contactPhoneRaw).replace(/\D/g, '');

    console.log('📊 Dados extraídos:', {
      instanceName,
      instanceUuid,
      contactJid,
      contactPhone,
      realJid,
      isLidJid,
      pushName,
      fromMe,
      messageId
    });

    if (!contactPhone) {
      console.log('⚠️ Número de contato não encontrado no payload');
      return new Response(JSON.stringify({ 
        success: false, 
        message: 'Número de contato não encontrado',
        receivedFields: Object.keys(payload)
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extrai conteúdo da mensagem
    const messageContent = extractMessageContent(payload);
    console.log('📝 Conteúdo extraído:', messageContent);

    // 1. Buscar instância - PRIORIZAR o nome da instância sobre o UUID
    // O n8n pode enviar valores incorretos no instance_uuid (como o sender_jid)
    let { data: instance, error: instanceError } = await supabase
      .from('sigzap_instances')
      .select('id')
      .eq('name', instanceName)
      .maybeSingle();

    // Se não achou pelo nome, tentar pelo instance_uuid (mas só se parece um UUID válido, não um JID)
    if (!instance && instanceUuid && !instanceUuid.includes('@')) {
      const { data: instanceByUuid } = await supabase
        .from('sigzap_instances')
        .select('id')
        .eq('instance_uuid', instanceUuid)
        .maybeSingle();
      
      if (instanceByUuid) {
        instance = instanceByUuid;
      }
    }

    if (instanceError) {
      console.error('❌ Erro ao buscar instância:', instanceError);
    }

    if (!instance) {
      // Criar ou buscar instância existente usando upsert para evitar duplicatas
      // (race condition em chamadas simultâneas)
      const safeInstanceUuid = instanceUuid && !instanceUuid.includes('@') 
        ? instanceUuid 
        : `auto_${Date.now()}`;
      
      const { data: newInstance, error: createInstanceError } = await supabase
        .from('sigzap_instances')
        .upsert({
          name: instanceName,
          instance_uuid: safeInstanceUuid,
          status: 'connected'
        }, {
          onConflict: 'name',
          ignoreDuplicates: false
        })
        .select('id')
        .single();

      if (createInstanceError) {
        // Se deu erro de constraint, buscar a existente
        console.log('⚠️ Upsert falhou, buscando instância existente...');
        const { data: existingInstance } = await supabase
          .from('sigzap_instances')
          .select('id')
          .eq('name', instanceName)
          .neq('status', 'deleted')
          .maybeSingle();
        
        if (existingInstance) {
          instance = existingInstance;
          console.log('✅ Instância existente encontrada:', instance.id);
        } else {
          console.error('❌ Erro ao criar/buscar instância:', createInstanceError);
          throw createInstanceError;
        }
      } else {
        instance = newInstance;
        console.log('✅ Instância criada/atualizada:', instance.id);
      }
    }

    // 2. Buscar ou criar contato
    let { data: contact, error: contactError } = await supabase
      .from('sigzap_contacts')
      .select('id')
      .eq('contact_jid', contactJid)
      .eq('instance_id', instance.id)
      .maybeSingle();

    if (contactError) {
      console.error('❌ Erro ao buscar contato:', contactError);
    }

    if (!contact) {
      // IMPORTANTE: Se fromMe = true, não usar o pushName porque é o nome da nossa instância
      // Usar apenas o número do telefone como nome inicial
      const contactNameToUse = fromMe ? contactPhone : (pushName || contactPhone);
      
      const { data: newContact, error: createContactError } = await supabase
        .from('sigzap_contacts')
        .insert({
          contact_jid: contactJid,
          contact_phone: contactPhone,
          contact_name: contactNameToUse,
          instance_id: instance.id
        })
        .select('id')
        .single();

      if (createContactError) {
        console.error('❌ Erro ao criar contato:', createContactError);
        throw createContactError;
      }
      contact = newContact;
      console.log('✅ Contato criado:', contact.id, 'Nome:', contactNameToUse);
    } else {
      // Atualizar nome do contato se mudou - APENAS quando a mensagem NÃO é enviada por nós (fromMe = false)
      // Isso evita sobrescrever o nome do contato com o nome do nosso perfil/instância
      if (pushName && pushName !== 'Desconhecido' && !fromMe) {
        await supabase
          .from('sigzap_contacts')
          .update({ contact_name: pushName })
          .eq('id', contact.id);
        console.log('✅ Nome do contato atualizado:', contact.id, '->', pushName);
      }
    }

    // 3. Buscar ou criar conversa
    let { data: conversation, error: conversationError } = await supabase
      .from('sigzap_conversations')
      .select('id, unread_count')
      .eq('contact_id', contact.id)
      .eq('instance_id', instance.id)
      .maybeSingle();

    if (conversationError) {
      console.error('❌ Erro ao buscar conversa:', conversationError);
    }

    const sentAt = new Date(timestamp * 1000).toISOString();

    if (!conversation) {
      const { data: newConversation, error: createConversationError } = await supabase
        .from('sigzap_conversations')
        .insert({
          contact_id: contact.id,
          instance_id: instance.id,
          last_message_text: messageContent.text,
          last_message_at: sentAt,
          unread_count: fromMe ? 0 : 1,
          status: 'open'
        })
        .select('id, unread_count')
        .single();

      if (createConversationError) {
        console.error('❌ Erro ao criar conversa:', createConversationError);
        throw createConversationError;
      }
      conversation = newConversation;
      console.log('✅ Conversa criada:', conversation.id);
    } else {
      // Atualizar conversa existente
      const newUnreadCount = fromMe ? 0 : (conversation.unread_count || 0) + 1;
      
      await supabase
        .from('sigzap_conversations')
        .update({
          last_message_text: messageContent.text,
          last_message_at: sentAt,
          unread_count: newUnreadCount,
          status: 'open'
        })
        .eq('id', conversation.id);
      
      console.log('✅ Conversa atualizada:', conversation.id);
    }

    // 3.5 Vincular lead à conversa (se ainda não vinculado)
    try {
      const contactPhone = contact.contact_phone || '';
      let normalizedPhone = contactPhone.replace(/\D/g, '');
      if (normalizedPhone.length >= 10 && !normalizedPhone.startsWith('+')) {
        normalizedPhone = normalizedPhone.startsWith('55') ? '+' + normalizedPhone : '+55' + normalizedPhone;
      } else if (normalizedPhone.startsWith('+')) {
        // already has +
      } else {
        normalizedPhone = '+' + normalizedPhone;
      }

      const { data: leadId } = await supabase.rpc('find_lead_by_phone', { p_phone: normalizedPhone });
      
      if (leadId) {
        // Setar lead_id na conversa
        await supabase
          .from('sigzap_conversations')
          .update({ lead_id: leadId })
          .eq('id', conversation.id)
          .is('lead_id', null);

        // Auto-transicionar lead para "Acompanhamento" se status for "Novo"
        const { data: leadData } = await supabase
          .from('leads')
          .select('status')
          .eq('id', leadId)
          .single();

        if (leadData?.status === 'Novo') {
          await supabase
            .from('leads')
            .update({ status: 'Acompanhamento', updated_at: new Date().toISOString() })
            .eq('id', leadId);
          console.log('✅ Lead atualizado para Acompanhamento:', leadId);
        }

        console.log('✅ Lead vinculado à conversa:', leadId);

        // 3.6 Auto-routing: se lead está em campanha ativa, chamar IA (non-blocking)
        if (!isFromMe && messageText) {
          try {
            const { data: campLeadCheck } = await supabase
              .from('campanha_leads')
              .select('id, campanha_id')
              .eq('lead_id', leadId)
              .in('status', ['contatado', 'em_conversa', 'aquecido'])
              .limit(1)
              .maybeSingle();

            if (campLeadCheck) {
              const iaPayload = {
                phone: normalizedPhone.replace('+', ''),
                message_text: messageText,
                instance_name: instanceName,
                message_type: messageType || 'text',
              };
              console.log('🤖 Lead em campanha ativa, chamando IA...', JSON.stringify({
                lead_id: leadId,
                campanha_id: campLeadCheck.campanha_id,
                phone: iaPayload.phone,
                instance: iaPayload.instance_name,
                msg_preview: messageText?.slice(0, 50),
              }));
              // Fire-and-forget: não bloqueia o webhook
              supabase.functions.invoke('campanha-ia-responder', {
                body: iaPayload,
              }).then((result: any) => {
                console.log('🤖 IA resultado:', JSON.stringify(result?.data || result?.error || 'sem resposta'));
              }).catch((iaErr: any) => {
                console.warn('⚠️ Erro ao chamar IA (não-crítico):', iaErr?.message);
              });
            }
          } catch (campCheckErr) {
            console.warn('⚠️ Erro ao verificar campanha (não-crítico):', campCheckErr);
          }
        }
      }
    } catch (leadLinkError) {
      console.warn('⚠️ Erro ao vincular lead (não-crítico):', leadLinkError);
    }

    // 4. Verificar se a mensagem já existe (evitar duplicatas)
    if (messageId && !messageId.startsWith('msg_')) {
      const { data: existingMessage } = await supabase
        .from('sigzap_messages')
        .select('id')
        .eq('wa_message_id', messageId)
        .maybeSingle();

      if (existingMessage) {
        console.log('⚠️ Mensagem já existe, ignorando duplicata:', messageId);
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Mensagem já processada',
          data: { conversationId: conversation.id, messageId: existingMessage.id }
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // 5. Se tiver mídia, baixar e salvar no storage
    let storedMediaUrl: string | null = null;
    const serverUrl = (payload as any).server_url;
    const payloadApiKey = (payload as any).apikey;
    
    if (messageContent.mediaUrl && ['image', 'video', 'audio', 'document', 'sticker'].includes(messageContent.type)) {
      storedMediaUrl = await downloadAndStoreMedia(
        supabase,
        messageContent.mediaUrl,
        instance.id,
        conversation.id,
        messageId,
        messageContent.mediaMimeType || 'application/octet-stream',
        instanceName,
        serverUrl,
        payloadApiKey
      );
    }

    // 6. Inserir mensagem
    const rawPayload = payload.raw_payload || payload;
    
    const { data: newMessage, error: msgError } = await supabase
      .from('sigzap_messages')
      .insert({
        conversation_id: conversation.id,
        wa_message_id: messageId,
        from_me: fromMe,
        sender_jid: fromMe ? null : contactJid,
        message_text: messageContent.text,
        message_type: messageContent.type,
        message_status: messageStatus,
        raw_payload: rawPayload,
        media_url: storedMediaUrl || messageContent.mediaUrl, // Usar URL do storage se disponível
        media_mime_type: messageContent.mediaMimeType,
        media_caption: messageContent.mediaCaption,
        media_filename: messageContent.mediaFilename,
        quoted_message_id: messageContent.quotedMessageId,
        quoted_message_text: messageContent.quotedMessageText,
        sent_at: sentAt,
        // Campos do fluxo novo sigma-evo (NULL quando vierem do fluxo antigo)
        is_forwarded: payload.is_forwarded ?? null,
        forward_score: payload.forward_score ?? null,
        location_data: payload.location_data ?? null,
        contact_data: payload.contact_data ?? null,
        quoted_message_type: payload.quoted_message_type ?? null,
        quoted_message_participant: payload.quoted_message_participant ?? null
      })
      .select('id')
      .single();

    if (msgError) {
      console.error('❌ Erro ao inserir mensagem:', msgError);
      throw msgError;
    }

    console.log('✅ Mensagem processada com sucesso:', { 
      conversationId: conversation.id, 
      messageId: newMessage.id,
      fromMe,
      type: messageContent.type
    });

    // ========== IA AUTO-RESPOSTA PARA DISPAROS ==========
    // Se a mensagem NÃO é enviada por nós (é do médico) e é texto, verificar se deve acionar IA
    if (!fromMe && messageContent.type === 'text' && messageContent.text && contactPhone) {
      try {
        console.log('[IA-CHECK] Verificando se contato pertence a campanha com IA ativa...');
        
        // Chamar a edge function de IA de forma assíncrona (fire-and-forget com timeout)
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        
        const iaPayload = {
          telefone_medico: contactPhone,
          mensagem_medico: messageContent.text,
          nome_medico: pushName !== 'Desconhecido' ? pushName : undefined,
          instance_name: instanceName,
        };

        // Fire-and-forget: não bloqueia o fluxo principal
        fetch(`${supabaseUrl}/functions/v1/ia-resposta-medico`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify(iaPayload),
        }).then(async (res) => {
          const result = await res.json();
          if (result.skip) {
            console.log('[IA-CHECK] IA ignorada:', result.reason);
          } else if (result.success) {
            console.log('[IA-CHECK] IA respondeu com sucesso, transferido:', result.transferred);
          } else if (result.error) {
            console.error('[IA-CHECK] Erro na IA:', result.error);
          }
        }).catch((err) => {
          console.error('[IA-CHECK] Erro ao chamar IA (não crítico):', err);
        });
      } catch (iaError) {
        // Erro na IA não deve impedir o fluxo normal
        console.error('[IA-CHECK] Erro ao iniciar chamada IA:', iaError);
      }
    }
    // ========== FIM IA AUTO-RESPOSTA ==========

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Mensagem processada',
      data: { 
        conversationId: conversation.id, 
        messageId: newMessage.id,
        instanceId: instance.id,
        contactId: contact.id
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Erro no endpoint de mensagens:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ 
      success: false, 
      error: errorMessage 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
