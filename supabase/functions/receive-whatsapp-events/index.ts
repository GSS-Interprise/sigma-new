import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WhatsAppEvent {
  event?: string;
  instance?: string;
  instanceName?: string;
  data?: {
    state?: string;
    statusReason?: number;
    qrcode?: {
      base64?: string;
      code?: string;
    };
  };
  // Campos adicionais que podem vir
  state?: string;
  qrcode?: string;
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

    const payload: WhatsAppEvent = await req.json();
    console.log('Evento recebido:', JSON.stringify(payload, null, 2));

    const eventType = payload.event || 'unknown';
    const instanceName = payload.instance || payload.instanceName || 'unknown';

    // Processa diferentes tipos de eventos
    switch (eventType) {
      case 'CONNECTION_UPDATE':
      case 'connection.update': {
        const state = payload.data?.state || payload.state || 'unknown';
        console.log(`Atualização de conexão para ${instanceName}: ${state}`);

        // Normaliza o estado para o formato do banco
        const normalizedState = (state === 'open' || state === 'connected') ? 'open' : 'close';

        // Atualiza o estado da instância no banco
        const { error } = await supabase
          .from('chips')
          .update({ 
            connection_state: normalizedState,
            updated_at: new Date().toISOString()
          })
          .eq('instance_name', instanceName);

        if (error) {
          console.error('Erro ao atualizar estado da conexão:', error);
        } else {
          console.log(`Estado da instância ${instanceName} atualizado para ${normalizedState}`);
        }
        break;
      }

      case 'QRCODE_UPDATED':
      case 'qrcode.updated': {
        const qrcode = payload.data?.qrcode?.base64 || payload.qrcode || '';
        console.log(`QR Code atualizado para ${instanceName}`);

        // Opcionalmente, você pode armazenar o QR code temporariamente
        // ou emitir um evento realtime para a UI
        break;
      }

      case 'MESSAGES_UPDATE':
      case 'messages.update': {
        console.log(`Atualização de mensagem para ${instanceName}`);
        // Pode ser usado para atualizar status de entrega/leitura
        break;
      }

      case 'SEND_MESSAGE':
      case 'send.message': {
        console.log(`Mensagem enviada pela instância ${instanceName}`);
        break;
      }

      default:
        console.log(`Evento não tratado: ${eventType}`);
    }

    // Log do evento para auditoria (opcional)
    const { error: logError } = await supabase
      .from('auditoria_logs')
      .insert({
        modulo: 'WhatsApp',
        tabela: 'whatsapp_events',
        acao: eventType,
        usuario_nome: 'Sistema',
        detalhes: `Evento ${eventType} da instância ${instanceName}`,
        metadata: payload
      });

    if (logError) {
      console.error('Erro ao registrar log de auditoria:', logError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Evento processado',
      event: eventType,
      instance: instanceName
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Erro no endpoint de eventos:', error);
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
