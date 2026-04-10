import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SendMessageRequest {
  conversationId: string;
  instanceName: string;
  contactJid: string;
  message?: string;
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  mediaUrl?: string;
  mediaBase64?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaCaption?: string;
  quotedMessageId?: string;
  // New action types
  action?: 'send' | 'react' | 'delete' | 'edit';
  // For reactions
  reaction?: string;
  targetMessageId?: string;
  targetFromMe?: boolean;
  // For edit
  editedText?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verificar autenticação
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: SendMessageRequest = await req.json();
    console.log('📤 Request recebido:', JSON.stringify(body, null, 2));

    const { 
      conversationId, 
      instanceName, 
      contactJid, 
      message, 
      mediaType,
      mediaUrl,
      mediaBase64,
      mediaMimeType,
      mediaFilename,
      mediaCaption,
      quotedMessageId,
      action = 'send',
      reaction,
      targetMessageId,
      targetFromMe,
      editedText
    } = body;

    if (!instanceName || !contactJid) {
      return new Response(JSON.stringify({ error: 'Parâmetros obrigatórios faltando' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar configuração da Evolution API
    const { data: evolutionConfig } = await supabase
      .from('config_lista_items')
      .select('campo_nome, valor')
      .in('campo_nome', ['evolution_api_url', 'evolution_api_key']);

    const rawEvolutionUrl = evolutionConfig?.find(c => c.campo_nome === 'evolution_api_url')?.valor || Deno.env.get('EVOLUTION_API_URL');
    const evolutionUrl = rawEvolutionUrl?.replace(/\/+$/, ''); // Remove trailing slashes
    const evolutionKey = evolutionConfig?.find(c => c.campo_nome === 'evolution_api_key')?.valor || Deno.env.get('EVOLUTION_API_KEY');

    if (!evolutionUrl || !evolutionKey) {
      console.error('❌ Configuração da Evolution API não encontrada');
      return new Response(JSON.stringify({ error: 'Evolution API não configurada' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve real phone number for LID contacts
    let number = contactJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
    
    if (contactJid.includes('@lid')) {
      console.log('🔍 Contato LID detectado, buscando número real...');
      
      // Try to get real JID from remoteJidAlt in a recent message raw_payload
      const { data: recentMsg } = await supabase
        .from('sigzap_messages')
        .select('raw_payload')
        .eq('conversation_id', conversationId || '')
        .not('raw_payload', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(10);
      
      let realJid: string | null = null;
      if (recentMsg) {
        for (const msg of recentMsg) {
          const alt = (msg.raw_payload as any)?.key?.remoteJidAlt;
          if (alt && alt.includes('@s.whatsapp.net')) {
            realJid = alt;
            break;
          }
        }
      }
      
      if (realJid) {
        number = realJid.replace('@s.whatsapp.net', '');
        console.log('✅ Número real encontrado via remoteJidAlt:', number);
      } else {
        // Fallback: try contact phone from sigzap_contacts
        if (conversationId) {
          const { data: conv } = await supabase
            .from('sigzap_conversations')
            .select('contact:sigzap_contacts(contact_phone), lead:leads!sigzap_conversations_lead_id_fkey(phone_e164)')
            .eq('id', conversationId)
            .single();
          
          const leadPhone = (conv?.lead as any)?.phone_e164;
          const contactPhone = (conv?.contact as any)?.contact_phone;
          
          if (leadPhone) {
            number = leadPhone.replace('+', '');
            console.log('✅ Número real do lead vinculado:', number);
          } else if (contactPhone && contactPhone.length <= 15) {
            number = contactPhone.replace(/\D/g, '');
            console.log('✅ Número real do contato:', number);
          } else {
            console.error('❌ Não foi possível resolver número real para contato LID');
            return new Response(JSON.stringify({ 
              error: 'Não foi possível enviar: contato LID sem número real identificado. Vincule um lead primeiro.' 
            }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
      }
    }

    let evolutionEndpoint: string;
    let evolutionBody: any;
    let httpMethod = 'POST';

    // Handle different actions
    switch (action) {
      case 'react':
        // Send reaction to a message
        if (!targetMessageId || reaction === undefined) {
          return new Response(JSON.stringify({ error: 'targetMessageId e reaction são obrigatórios para reagir' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        const encodedInstanceName = encodeURIComponent(instanceName);
        
        evolutionEndpoint = `${evolutionUrl}/message/sendReaction/${encodedInstanceName}`;
        evolutionBody = {
          key: {
            remoteJid: contactJid,
            fromMe: targetFromMe ?? false,
            id: targetMessageId
          },
          reaction: reaction // emoji or empty string to remove
        };
        break;

      case 'delete':
        // Delete message for everyone
        if (!targetMessageId) {
          return new Response(JSON.stringify({ error: 'targetMessageId é obrigatório para deletar' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        httpMethod = 'DELETE';
        evolutionEndpoint = `${evolutionUrl}/chat/deleteMessageForEveryone/${encodeURIComponent(instanceName)}`;
        evolutionBody = {
          id: targetMessageId,
          remoteJid: contactJid,
          fromMe: targetFromMe ?? true
        };
        break;

      case 'edit':
        // Edit message text
        if (!targetMessageId || !editedText) {
          return new Response(JSON.stringify({ error: 'targetMessageId e editedText são obrigatórios para editar' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // Look up the original message's remoteJid from raw_payload
        // because the contact JID might be @lid but the message was sent to @s.whatsapp.net
        let editRemoteJid = contactJid;
        const { data: originalMsg } = await supabase
          .from('sigzap_messages')
          .select('raw_payload')
          .eq('wa_message_id', targetMessageId)
          .single();
        
        if (originalMsg?.raw_payload?.key?.remoteJid) {
          editRemoteJid = originalMsg.raw_payload.key.remoteJid;
          console.log('📝 Usando remoteJid do raw_payload:', editRemoteJid);
        }
        
        httpMethod = 'POST';
        evolutionEndpoint = `${evolutionUrl}/chat/updateMessage/${encodeURIComponent(instanceName)}`;
        evolutionBody = {
          number: editRemoteJid.replace('@s.whatsapp.net', '').replace('@lid', ''),
          key: {
            remoteJid: editRemoteJid,
            fromMe: true,
            id: targetMessageId
          },
          text: editedText
        };
        break;

      case 'send':
      default:
        // Regular message sending
        if (!conversationId) {
          return new Response(JSON.stringify({ error: 'conversationId é obrigatório para enviar mensagem' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        if (!message && !mediaUrl && !mediaBase64) {
          return new Response(JSON.stringify({ error: 'Mensagem ou mídia obrigatória' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Construir payload baseado no tipo de mensagem
        if (mediaType && (mediaUrl || mediaBase64)) {
          // Mensagem com mídia
          evolutionEndpoint = `${evolutionUrl}/message/sendMedia/${encodeURIComponent(instanceName)}`;
          evolutionBody = {
            number,
            mediatype: mediaType,
            mimetype: mediaMimeType,
            caption: mediaCaption || '',
            fileName: mediaFilename,
            ...(mediaUrl ? { media: mediaUrl } : { media: mediaBase64 })
          };

          if (quotedMessageId) {
            evolutionBody.quoted = { key: { id: quotedMessageId } };
          }
        } else {
          // Mensagem de texto
          evolutionEndpoint = `${evolutionUrl}/message/sendText/${encodeURIComponent(instanceName)}`;
          evolutionBody = {
            number,
            text: message
          };

          if (quotedMessageId) {
            evolutionBody.quoted = { key: { id: quotedMessageId } };
          }
        }
        break;
    }

    console.log(`📡 Chamando Evolution API (${httpMethod}):`, evolutionEndpoint);
    console.log('📦 Payload:', JSON.stringify(evolutionBody, null, 2));

    // Enviar para Evolution API
    const evolutionResponse = await fetch(evolutionEndpoint, {
      method: httpMethod,
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey
      },
      body: JSON.stringify(evolutionBody)
    });

    const rawEvolutionResult = await evolutionResponse.text();
    let evolutionResult: any = null;
    try {
      evolutionResult = rawEvolutionResult ? JSON.parse(rawEvolutionResult) : null;
    } catch {
      evolutionResult = { raw: rawEvolutionResult };
    }

    console.log('📩 Resposta Evolution:', JSON.stringify(evolutionResult, null, 2));

    if (!evolutionResponse.ok) {
      console.error('❌ Erro da Evolution API:', evolutionResult);
      return new Response(JSON.stringify({ 
        error: 'Erro ao processar ação',
        details: evolutionResult,
        requestedUrl: evolutionEndpoint,
        payload: evolutionBody,
      }), {
        status: evolutionResponse.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle different action responses
    if (action === 'react') {
      // Salvar reação no banco de dados
      if (targetMessageId && reaction !== undefined) {
        const { error: reactionDbError } = await supabase
          .from('sigzap_messages')
          .update({ reaction: reaction || null })
          .eq('wa_message_id', targetMessageId);
        
        if (reactionDbError) {
          console.error('⚠️ Erro ao salvar reação no DB:', reactionDbError);
        } else {
          console.log('✅ Reação salva no DB:', targetMessageId, '->', reaction || '(removida)');
        }
      }
      
      console.log('✅ Reação enviada com sucesso');
      return new Response(JSON.stringify({ 
        success: true, 
        action: 'react',
        evolutionResponse: evolutionResult
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      // Update message status in database
      if (targetMessageId) {
        await supabase
          .from('sigzap_messages')
          .update({ 
            message_status: 'deleted',
            message_text: '[Mensagem apagada]'
          })
          .eq('wa_message_id', targetMessageId);
      }
      
      console.log('✅ Mensagem deletada com sucesso');
      return new Response(JSON.stringify({ 
        success: true, 
        action: 'delete',
        evolutionResponse: evolutionResult
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'edit') {
      // Update message text in database
      if (targetMessageId && editedText) {
        await supabase
          .from('sigzap_messages')
          .update({ message_text: editedText })
          .eq('wa_message_id', targetMessageId);
      }
      
      console.log('✅ Mensagem editada com sucesso');
      return new Response(JSON.stringify({ 
        success: true, 
        action: 'edit',
        evolutionResponse: evolutionResult
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // For send action - save message to database
    const waMessageId = evolutionResult.key?.id || evolutionResult.id || `sent_${Date.now()}`;
    const messageText = message || mediaCaption || `[${mediaType || 'Mídia'}]`;
    const messageType = mediaType || 'text';

    const { data: savedMessage, error: saveError } = await supabase
      .from('sigzap_messages')
      .insert({
        conversation_id: conversationId,
        wa_message_id: waMessageId,
        from_me: true,
        message_text: messageText,
        message_type: messageType,
        message_status: 'sent',
        raw_payload: evolutionResult,
        media_url: mediaUrl,
        media_mime_type: mediaMimeType,
        media_caption: mediaCaption,
        media_filename: mediaFilename,
        quoted_message_id: quotedMessageId,
        sent_at: new Date().toISOString(),
        sent_by_user_id: user.id,
        sent_via_instance_name: instanceName
      })
      .select('id')
      .single();

    if (saveError) {
      console.error('⚠️ Erro ao salvar mensagem:', saveError);
    }

    // Atualizar conversa
    await supabase
      .from('sigzap_conversations')
      .update({
        last_message_text: messageText,
        last_message_at: new Date().toISOString(),
        unread_count: 0
      })
      .eq('id', conversationId);

    console.log('✅ Mensagem enviada com sucesso:', waMessageId);

    return new Response(JSON.stringify({ 
      success: true, 
      messageId: savedMessage?.id,
      waMessageId,
      evolutionResponse: evolutionResult
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('❌ Erro ao processar requisição:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
