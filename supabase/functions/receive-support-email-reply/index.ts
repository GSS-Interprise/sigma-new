import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature",
};

// Validação do payload de email
interface EmailWebhookPayload {
  subject: string;
  from: string;
  text: string;
  html?: string;
  date: string;
}

const validateEmailPayload = (body: unknown): { valid: true; data: EmailWebhookPayload } | { valid: false; error: string } => {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body must be an object' };
  }

  const payload = body as Record<string, unknown>;

  // Validar subject
  if (typeof payload.subject !== 'string' || payload.subject.length === 0 || payload.subject.length > 500) {
    return { valid: false, error: 'subject must be a string between 1 and 500 characters' };
  }

  // Validar from (email)
  if (typeof payload.from !== 'string' || payload.from.length === 0 || payload.from.length > 320) {
    return { valid: false, error: 'from must be a string between 1 and 320 characters' };
  }
  // Validação básica de email (aceita formato "Nome <email>" ou apenas email)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$|<[^\s@]+@[^\s@]+\.[^\s@]+>/;
  if (!emailRegex.test(payload.from)) {
    return { valid: false, error: 'from must contain a valid email address' };
  }

  // Validar text
  if (typeof payload.text !== 'string') {
    return { valid: false, error: 'text must be a string' };
  }
  if (payload.text.length > 50000) {
    return { valid: false, error: 'text must not exceed 50000 characters' };
  }

  // Validar date (opcional)
  if (payload.date !== undefined && typeof payload.date !== 'string') {
    return { valid: false, error: 'date must be a string if provided' };
  }

  return {
    valid: true,
    data: {
      subject: sanitizeText(payload.subject),
      from: payload.from.trim(),
      text: payload.text,
      html: typeof payload.html === 'string' ? payload.html : undefined,
      date: typeof payload.date === 'string' ? payload.date : new Date().toISOString()
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

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
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
        console.error('❌ Invalid webhook signature for support email reply');
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      console.log('✅ HMAC signature validated');
    } else {
      console.warn('⚠️ WEBHOOK_SECRET not configured - accepting request without signature validation');
    }

    // Parse e validação do payload
    let parsedBody: unknown;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const validation = validateEmailPayload(parsedBody);
    if (!validation.valid) {
      console.error('❌ Validation failed:', validation.error);
      return new Response(
        JSON.stringify({ success: false, error: validation.error }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const payload = validation.data;
    
    console.log("Received email webhook:", {
      subject: payload.subject.substring(0, 50),
      from: payload.from,
    });

    // Extrair número do ticket do assunto usando regex [#SUP-YYYY-NNNNNN]
    const ticketMatch = payload.subject.match(/\[#(SUP-\d{4}-\d{6})\]/);
    
    if (!ticketMatch) {
      console.log("No ticket number found in subject:", payload.subject);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Ticket number not found in subject",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const ticketNumero = ticketMatch[1];
    
    // Validar formato do número do ticket mais rigorosamente
    const ticketFormatRegex = /^SUP-\d{4}-\d{6}$/;
    if (!ticketFormatRegex.test(ticketNumero)) {
      console.error("Invalid ticket number format:", ticketNumero);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Invalid ticket number format",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
    
    console.log("Ticket number extracted:", ticketNumero);

    // Criar cliente Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar ticket pelo número
    const { data: ticket, error: ticketError } = await supabase
      .from("suporte_tickets")
      .select("id")
      .eq("numero", ticketNumero)
      .single();

    if (ticketError || !ticket) {
      console.error("Ticket not found:", ticketNumero, ticketError);
      return new Response(
        JSON.stringify({
          success: false,
          message: "Ticket not found",
        }),
        {
          status: 404,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    // Limpar o conteúdo do email (remover citações antigas, assinaturas, etc)
    let mensagemLimpa = payload.text || "";
    
    // Remover linhas com ">" (citações)
    mensagemLimpa = mensagemLimpa
      .split("\n")
      .filter((linha) => !linha.trim().startsWith(">"))
      .join("\n");
    
    // Remover assinaturas comuns
    mensagemLimpa = mensagemLimpa.split(/\n--\s*\n/)[0];
    mensagemLimpa = mensagemLimpa.split(/\nEm\s+\d{1,2}\/\d{1,2}\/\d{4}/)[0];
    
    // Limitar tamanho e sanitizar
    mensagemLimpa = mensagemLimpa.trim().substring(0, 10000);
    mensagemLimpa = sanitizeText(mensagemLimpa);

    // Extrair nome do email (antes do @) ou usar o email completo
    let autorNome = payload.from.includes('<') 
      ? payload.from.split('<')[0].trim() || payload.from
      : payload.from.split('@')[0];
    
    // Sanitizar e limitar o nome do autor
    autorNome = sanitizeText(autorNome).substring(0, 200);

    console.log("Inserting comment with autor_nome:", autorNome);

    // Inserir comentário na tabela suporte_comentarios
    const { error: comentarioError } = await supabase
      .from("suporte_comentarios")
      .insert({
        ticket_id: ticket.id,
        autor_nome: autorNome,
        autor_email: payload.from.substring(0, 320),
        mensagem: mensagemLimpa,
        is_externo: true,
      });

    if (comentarioError) {
      console.error("Error inserting comment:", comentarioError);
      throw comentarioError;
    }

    // Atualizar data_ultima_atualizacao do ticket
    const { error: updateError } = await supabase
      .from("suporte_tickets")
      .update({ data_ultima_atualizacao: new Date().toISOString() })
      .eq("id", ticket.id);

    if (updateError) {
      console.error("Error updating ticket:", updateError);
    }

    console.log("Comment added successfully to ticket:", ticketNumero);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Comment added to ticket",
        ticketNumero,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: unknown) {
    console.error("Error in receive-support-email-reply function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Internal server error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
