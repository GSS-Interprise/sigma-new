// Importa as bibliotecas necessárias
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// Schema de validação
const validateWhatsAppPayload = (body: unknown): { valid: true; data: WhatsAppPayload } | { valid: false; error: string } => {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }

  const payload = body as Record<string, unknown>;

  // Validar id_conversa
  if (typeof payload.id_conversa !== 'string' || payload.id_conversa.length === 0 || payload.id_conversa.length > 100) {
    return { valid: false, error: 'id_conversa must be a string between 1 and 100 characters' };
  }

  // Validar remetente
  if (typeof payload.remetente !== 'string' || payload.remetente.length === 0 || payload.remetente.length > 200) {
    return { valid: false, error: 'remetente must be a string between 1 and 200 characters' };
  }

  // Validar numero_remetente (formato E.164: +[código país][número])
  if (typeof payload.numero_remetente !== 'string') {
    return { valid: false, error: 'numero_remetente must be a string' };
  }
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  if (!phoneRegex.test(payload.numero_remetente.replace(/\s/g, ''))) {
    return { valid: false, error: 'numero_remetente must be a valid phone number' };
  }

  // Validar mensagem
  if (typeof payload.mensagem !== 'string' || payload.mensagem.length === 0 || payload.mensagem.length > 5000) {
    return { valid: false, error: 'mensagem must be a string between 1 and 5000 characters' };
  }

  // Validar timestamp
  const timestamp = Number(payload.timestamp);
  if (isNaN(timestamp) || timestamp <= 0) {
    return { valid: false, error: 'timestamp must be a positive number' };
  }

  return {
    valid: true,
    data: {
      id_conversa: payload.id_conversa.trim(),
      remetente: sanitizeText(payload.remetente),
      numero_remetente: payload.numero_remetente.replace(/\s/g, ''),
      mensagem: sanitizeText(payload.mensagem),
      timestamp: timestamp
    }
  };
};

// Sanitização de texto para prevenir XSS
const sanitizeText = (text: string): string => {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
};

// Validação de assinatura HMAC
const validateSignature = async (body: string, signature: string | null, secret: string): Promise<boolean> => {
  if (!signature) return false;
  
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const expectedSig = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(body)
    );
    
    const expectedSigBase64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)));
    return signature === expectedSigBase64;
  } catch {
    return false;
  }
};

interface WhatsAppPayload {
  id_conversa: string;
  remetente: string;
  numero_remetente: string;
  mensagem: string;
  timestamp: number;
}

// O Deno (motor do Supabase) começa a servir a função
Deno.serve(async (req) => {
  // Trata do pedido "OPTIONS" (necessário para CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Ler o corpo da requisição como texto para validação de assinatura
    const bodyText = await req.text();
    
    // Verificar assinatura HMAC se o secret estiver configurado
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    if (webhookSecret) {
      const signature = req.headers.get('X-Webhook-Signature');
      const isValid = await validateSignature(bodyText, signature, webhookSecret);
      
      if (!isValid) {
        console.error('❌ Assinatura inválida no webhook WhatsApp');
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
        );
      }
      console.log('✅ Assinatura HMAC validada');
    } else {
      console.warn('⚠️ WEBHOOK_SECRET não configurado - requisição aceita sem validação de assinatura');
    }

    // Parse e validação do payload
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const validation = validateWhatsAppPayload(parsedBody);
    if (!validation.valid) {
      console.error('❌ Validação falhou:', validation.error);
      return new Response(
        JSON.stringify({ error: validation.error }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const body = validation.data;
    console.log('📩 Dados validados:', { id_conversa: body.id_conversa, remetente: body.remetente });

    // 1. INICIALIZAR O CLIENTE SUPABASE
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 3. LÓGICA DA TABELA "CONVERSAS" (PROCURAR OU CRIAR)
    const { data: conversaData, error: conversaError } = await supabase
      .from('conversas')
      .upsert({
        id_conversa: body.id_conversa,
        nome_contato: body.remetente,
        numero_contato: body.numero_remetente
      }, {
        onConflict: 'id_conversa',
        ignoreDuplicates: false
      })
      .select('id')
      .single();

    if (conversaError) {
      console.error('❌ Erro ao criar/atualizar conversa:', conversaError);
      throw conversaError;
    }

    console.log('✅ Conversa criada/atualizada:', conversaData);

    const conversa_uuid = conversaData.id;

    // 4. CORRIGIR O TIMESTAMP
    const isoTimestamp = new Date(body.timestamp * 1000).toISOString();
    console.log('🕒 Timestamp convertido:', isoTimestamp);

    // 5. LÓGICA DA TABELA "MENSAGENS" (INSERIR A NOVA MENSAGEM)
    const { error: mensagemError } = await supabase
      .from('mensagens')
      .insert({
        conversa_pai: conversa_uuid,
        texto_mensagem: body.mensagem,
        direcao: 'entrada',
        timestamp: isoTimestamp
      });

    if (mensagemError) {
      console.error('❌ Erro ao inserir mensagem:', mensagemError);
      throw mensagemError;
    }

    console.log('✅ Mensagem inserida com sucesso');

    // 6. RESPONDER COM SUCESSO
    return new Response(
      JSON.stringify({ 
        status: 'recebido_com_sucesso',
        conversa_id: conversa_uuid 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    console.error('💥 Erro na função receber_mensagem_whatsapp:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
