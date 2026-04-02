import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Não autorizado');
    }

    // Create Supabase client with auth header
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      throw new Error('Não autorizado');
    }

    console.log("Authenticated user:", user.id);

    const { to, message, templateName, templateParams } = await req.json();

    console.log("Send WhatsApp request:", { to, hasMessage: !!message, templateName });

    // Validação de entrada
    if (!to || (!message && !templateName)) {
      throw new Error("Campo 'to' e ('message' ou 'templateName') são obrigatórios");
    }

    // Validar formato do número
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(to)) {
      throw new Error("Número de telefone inválido");
    }

    // Validar comprimento da mensagem (máximo 4096 caracteres para WhatsApp)
    if (message && message.length > 4096) {
      throw new Error("Mensagem muito longa. Máximo de 4096 caracteres.");
    }

    // Validar parâmetros do template
    if (templateParams && !Array.isArray(templateParams)) {
      throw new Error("templateParams deve ser um array");
    }

    // Check rate limiting - 100 messages per hour per user
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const { data: recentSends, error: rateLimitError } = await supabaseClient
      .from('whatsapp_rate_limit')
      .select('id')
      .eq('user_id', user.id)
      .gte('created_at', oneHourAgo);

    if (rateLimitError) {
      console.error("Rate limit check error:", rateLimitError);
    }

    if (recentSends && recentSends.length >= 100) {
      throw new Error('Taxa de envio excedida. Máximo de 100 mensagens por hora. Tente novamente mais tarde.');
    }

    // Record this send attempt for rate limiting
    const { error: trackError } = await supabaseClient
      .from('whatsapp_rate_limit')
      .insert({ user_id: user.id });

    if (trackError) {
      console.error("Failed to track rate limit:", trackError);
    }

    // Create service role client for accessing configs
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar configurações do WhatsApp
    const { data: configs, error: configError } = await supabase
      .from('config_lista_items')
      .select('campo_nome, valor')
      .in('campo_nome', ['whatsapp_phone_number_id', 'whatsapp_access_token']);

    if (configError) {
      console.error("Erro ao buscar configs:", configError);
      throw new Error("Erro ao buscar configurações");
    }

    const phoneNumberId = configs?.find(c => c.campo_nome === 'whatsapp_phone_number_id')?.valor;
    const accessToken = configs?.find(c => c.campo_nome === 'whatsapp_access_token')?.valor;

    if (!phoneNumberId || !accessToken) {
      throw new Error("WhatsApp não configurado. Configure em Configurações > WhatsApp API");
    }

    // Preparar corpo da mensagem
    let messageBody: any;

    if (templateName) {
      // Enviar template
      messageBody = {
        messaging_product: "whatsapp",
        to: to,
        type: "template",
        template: {
          name: templateName,
          language: {
            code: "pt_BR"
          },
          components: templateParams || []
        }
      };
    } else {
      // Enviar mensagem de texto
      messageBody = {
        messaging_product: "whatsapp",
        to: to,
        type: "text",
        text: {
          body: message
        }
      };
    }

    console.log("Sending to WhatsApp API:", { phoneNumberId, to });

    // Enviar via WhatsApp Business API
    const whatsappResponse = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messageBody),
      }
    );

    const responseData = await whatsappResponse.json();

    if (!whatsappResponse.ok) {
      console.error("WhatsApp API error:", responseData);
      throw new Error(responseData.error?.message || "Erro ao enviar mensagem via WhatsApp");
    }

    console.log("WhatsApp API success:", responseData);

    return new Response(
      JSON.stringify({
        success: true,
        messageId: responseData.messages?.[0]?.id,
        data: responseData
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error: any) {
    console.error('Error in send-whatsapp function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
