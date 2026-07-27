import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processSigzapOutboxRow, type SigzapOutboxRow } from "../_shared/sigzap-outbox.ts";

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
  clientMessageId?: string;
  // New action types
  action?: 'send' | 'react' | 'delete' | 'edit';
  // For reactions
  reaction?: string;
  targetMessageId?: string;
  targetFromMe?: boolean;
  // For edit
  editedText?: string;
}

const sanitizeBase64Media = (value: string) =>
  value
    .replace(/^data:[^;]+;base64,/, '')
    .replace(/^data:[^,]+,/, '')
    .replace(/\s+/g, '');

const getEvolutionErrorMessage = (result: any) => {
  const message = result?.response?.message;

  if (Array.isArray(message)) {
    return message
      .map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
      .join(' | ');
  }

  if (typeof message === 'string') {
    return message;
  }

  return JSON.stringify(result ?? {});
};


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
      clientMessageId,
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
      
      // Try to get real JID from remoteJidAlt OR remoteJid in recent message raw_payload
      const { data: recentMsg } = await supabase
        .from('sigzap_messages')
        .select('raw_payload')
        .eq('conversation_id', conversationId || '')
        .not('raw_payload', 'is', null)
        .order('sent_at', { ascending: false })
        .limit(20);
      
      let realJid: string | null = null;
      if (recentMsg) {
        for (const msg of recentMsg) {
          const payload = msg.raw_payload as any;
          // First try remoteJidAlt (preferred — always the real number)
          const alt = payload?.key?.remoteJidAlt;
          if (alt && alt.includes('@s.whatsapp.net')) {
            realJid = alt;
            break;
          }
          // Then try remoteJid itself — on sent messages it's the real @s.whatsapp.net JID
          const rjid = payload?.key?.remoteJid;
          if (rjid && rjid.includes('@s.whatsapp.net') && !rjid.includes('@lid')) {
            realJid = rjid;
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
      default: {
        // Regular message sending — usa helper anti-ban (pre_send_check + log + retry)
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

        // Resolve chip_id via instance_name (helper precisa do uuid)
        const { data: chipRow, error: chipErr } = await supabase
          .from('chips')
          .select('id')
          .eq('instance_name', instanceName)
          .maybeSingle();
        if (chipErr || !chipRow?.id) {
          return new Response(JSON.stringify({ error: `Chip não encontrado: ${instanceName}` }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const chipId = chipRow.id as string;

        // Upload de mídia pra Storage (se for envio com mídia)
        let publicMediaUrl: string | null = null;
        const isMediaSend = !!(mediaType && (mediaUrl || mediaBase64));

        if (isMediaSend) {
          const fileName = mediaFilename || `media_${Date.now()}`;
          const filePath = `media-temp/${Date.now()}-${fileName}`;

          if (mediaBase64) {
            const cleanBase64 = sanitizeBase64Media(mediaBase64);
            const binaryString = atob(cleanBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            console.log('📤 Uploading base64 media to Supabase Storage:', filePath);
            const { error: uploadError } = await supabase.storage
              .from('sigzap-media')
              .upload(filePath, bytes, {
                contentType: mediaMimeType || 'application/octet-stream',
                upsert: true,
              });
            if (uploadError) {
              console.error('❌ Erro ao fazer upload para Storage:', uploadError);
              return new Response(JSON.stringify({ error: 'Falha ao fazer upload da mídia', details: uploadError }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }
            const { data: { publicUrl } } = supabase.storage.from('sigzap-media').getPublicUrl(filePath);
            publicMediaUrl = publicUrl;
            console.log('✅ Mídia uploaded, URL pública:', publicMediaUrl);
          } else if (mediaUrl) {
            if (mediaUrl.includes('supabase.co/storage')) {
              publicMediaUrl = mediaUrl;
            } else {
              try {
                const mediaResponse = await fetch(mediaUrl);
                if (mediaResponse.ok) {
                  const arrayBuffer = await mediaResponse.arrayBuffer();
                  const fileBuffer = new Uint8Array(arrayBuffer);
                  const { error: uploadError } = await supabase.storage
                    .from('sigzap-media')
                    .upload(filePath, fileBuffer, {
                      contentType: mediaMimeType || mediaResponse.headers.get('content-type') || 'application/octet-stream',
                      upsert: true,
                    });
                  if (uploadError) {
                    publicMediaUrl = mediaUrl;
                  } else {
                    const { data: { publicUrl } } = supabase.storage.from('sigzap-media').getPublicUrl(filePath);
                    publicMediaUrl = publicUrl;
                  }
                } else {
                  publicMediaUrl = mediaUrl;
                }
              } catch (_e) {
                publicMediaUrl = mediaUrl;
              }
            }
          }

          if (!publicMediaUrl) {
            return new Response(JSON.stringify({ error: 'Nenhuma mídia disponível para envio' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // Envio via helper anti-ban (passa por pre_send_check + log + retry)
        {
          // Clientes ainda em cache nao enviam clientMessageId. Nesse caso,
          // reaproveita uma tentativa identica recente para conter duplo clique.
          let legacyDuplicate: any = null;
          if (!clientMessageId) {
            let duplicateQuery = supabase.from('sigzap_outbox').select('*')
              .eq('conversation_id', conversationId)
              .eq('message_type', mediaType || 'text')
              .in('status', ['queued', 'processing'])
              .gte('created_at', new Date(Date.now() - 5 * 60_000).toISOString())
              .order('created_at', { ascending: false })
              .limit(1);
            duplicateQuery = message
              ? duplicateQuery.eq('message_text', message)
              : duplicateQuery.eq('media_url', publicMediaUrl);
            const { data } = await duplicateQuery.maybeSingle();
            legacyDuplicate = data;
          }
          const stableClientId = clientMessageId || legacyDuplicate?.client_message_id || crypto.randomUUID();
          const { data: existingOutbox } = await supabase
            .from('sigzap_outbox').select('*').eq('client_message_id', stableClientId).maybeSingle();
          if (existingOutbox?.status === 'sent') {
            return Response.json({ success: true, alreadySent: true, messageId: existingOutbox.sigzap_message_id, waMessageId: existingOutbox.wa_message_id }, { headers: corsHeaders });
          }
          if (!clientMessageId && existingOutbox && ['queued', 'processing'].includes(existingOutbox.status)) {
            return Response.json({
              success: false, queued: true, code: existingOutbox.last_error_code,
              outboxId: existingOutbox.id, clientMessageId: stableClientId,
              message: 'Esta mensagem ja esta aguardando envio.',
            }, { status: 202, headers: corsHeaders });
          }

          let outbox: any;
          if (existingOutbox) {
            const { data, error } = await supabase.from('sigzap_outbox').update({
              status: 'processing',
              // Clique manual em "Tentar novamente" abre um novo ciclo de
              // tentativas; retries automaticos continuam limitados no worker.
              attempts: existingOutbox.status === 'failed'
                ? 1
                : Math.min((existingOutbox.attempts || 0) + 1, existingOutbox.max_attempts || 6),
              next_retry_at: new Date().toISOString(),
              last_error_code: null,
              last_error_detail: null,
              updated_at: new Date().toISOString(),
            }).eq('id', existingOutbox.id).select('*').single();
            if (error) throw error;
            outbox = data;
          } else {
            const { data, error } = await supabase.from('sigzap_outbox').insert({
              client_message_id: stableClientId,
              conversation_id: conversationId,
              chip_id: chipId,
              instance_name: instanceName,
              contact_jid: `${number}@s.whatsapp.net`,
              message_text: message || null,
              message_type: mediaType || 'text',
              media_url: publicMediaUrl,
              media_mime_type: mediaMimeType || null,
              media_caption: mediaCaption || null,
              media_filename: mediaFilename || null,
              quoted_message_id: quotedMessageId || null,
              status: 'processing',
              attempts: 1,
              next_retry_at: new Date().toISOString(),
              created_by: user.id,
            }).select('*').single();
            if (error) throw error;
            outbox = data;
          }

          const processed = await processSigzapOutboxRow({
            supabase,
            evo: { url: evolutionUrl, apiKey: evolutionKey },
            row: outbox as SigzapOutboxRow,
          });
          if (!processed.sent) {
            // O Evolution usa HTTP 400 tanto para erros genéricos quanto para
            // telefone inexistente. Preserve a causa para a UI não mandar a
            // operadora reconectar um chip que está saudável.
            const evolutionDetail = typeof processed.evolutionResponse === 'string'
              ? processed.evolutionResponse.toLowerCase()
              : JSON.stringify(processed.evolutionResponse ?? {}).toLowerCase();
            const numberNotOnWhatsApp =
              evolutionDetail.includes('exists":false')
              || evolutionDetail.includes('not on whatsapp');
            return Response.json({
              success: false,
              queued: processed.queued,
              failed: processed.failed,
              code: numberNotOnWhatsApp ? 'NUMBER_NOT_ON_WHATSAPP' : processed.code,
              outboxId: outbox.id,
              clientMessageId: stableClientId,
              message: numberNotOnWhatsApp
                ? 'Esse número não possui WhatsApp ativo. Confira o cadastro ou marque o lead como perdido.'
                : processed.queued
                  ? 'Mensagem salva. Aguardando reconexao do chip.'
                  : 'Mensagem nao enviada. Tente novamente ou escolha outro chip.',
            }, { status: processed.queued ? 202 : 409, headers: corsHeaders });
          }
          return Response.json({
            success: true,
            messageId: processed.messageId,
            waMessageId: processed.waMessageId,
            clientMessageId: stableClientId,
          }, { headers: corsHeaders });
        }

        /* Fluxo legado preservado temporariamente no diff para facilitar auditoria.
        const evoCfg = { url: evolutionUrl, apiKey: evolutionKey };
        const helperResult = isMediaSend
          ? await sendWhatsAppMedia({
              supabase,
              evo: evoCfg,
              chipId,
              instanceName,
              toJid: number,
              mediaType: mediaType as 'image' | 'video' | 'audio' | 'document',
              mediaUrl: publicMediaUrl!,
              mediaMimeType,
              mediaCaption,
              mediaFilename,
              quotedMessageId,
              eventoOrigem: 'manual',
              awaitDelay: true,
            })
          : await sendWhatsAppText({
              supabase,
              evo: evoCfg,
              chipId,
              instanceName,
              toJid: number,
              text: message!,
              quotedMessageId,
              eventoOrigem: 'manual',
              awaitDelay: true,
            });

        if (!helperResult.sent) {
          console.error('❌ Helper rejeitou envio:', helperResult.reason);
          return new Response(JSON.stringify({
            error: 'send_blocked',
            reason: helperResult.reason,
            details: helperResult.evolutionResponse,
            preSendCheck: helperResult.preSendCheck,
          }), {
            status: helperResult.errorCode || 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Sucesso → grava em sigzap_messages + atualiza conversa
        const evolutionResult = helperResult.evolutionResponse || {};
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
            sent_by_user_id: user!.id,
            sent_via_instance_name: instanceName,
          })
          .select('id')
          .single();
        if (saveError) console.error('⚠️ Erro ao salvar mensagem:', saveError);

        await supabase
          .from('sigzap_conversations')
          .update({
            last_message_text: messageText,
            last_message_at: new Date().toISOString(),
            unread_count: 0,
          })
          .eq('id', conversationId);

        console.log('✅ Mensagem enviada via helper anti-ban:', waMessageId);
        return new Response(JSON.stringify({
          success: true,
          messageId: savedMessage?.id,
          waMessageId,
          evolutionResponse: evolutionResult,
          delayApplicadoMs: helperResult.delayApplicadoMs,
          retriesAttempted: helperResult.retriesAttempted,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
        */
      }
    }

    console.log(`📡 Chamando Evolution API (${httpMethod}):`, evolutionEndpoint);
    console.log('📦 Payload:', JSON.stringify(evolutionBody, null, 2));

    const evolutionResponse = await fetch(evolutionEndpoint, {
      method: httpMethod,
      headers: {
        'Content-Type': 'application/json',
        'apikey': evolutionKey
      },
      body: JSON.stringify(evolutionBody)
    });

    const rawEvolutionResult = await evolutionResponse.text();
    let evolutionResult: any;
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

    // Fallback: action desconhecida (não deveria chegar aqui se action é send/react/delete/edit)
    return new Response(JSON.stringify({ error: 'Action não tratada' }), {
      status: 400,
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
