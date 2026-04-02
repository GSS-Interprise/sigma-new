import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmailRecipient {
  nome: string;
  telefone: string;
  email?: string;
}

interface SendBulkEmailsRequest {
  assunto: string;
  corpo: string;
  destinatarios: EmailRecipient[];
  tamanhoLote?: number;
  maxRetries?: number;
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendGmailEmail(
  client: SMTPClient,
  to: string,
  toName: string,
  subject: string,
  html: string,
  maxRetries: number = 3
) {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await client.send({
        from: Deno.env.get("GMAIL_USER")!,
        to: to,
        subject: subject,
        content: "text/html; charset=utf-8",
        html: html,
      });

      // Sucesso! Logar se foi necessário retry
      if (attempt > 0) {
        console.log(`✓ Email enviado para ${to} após ${attempt} tentativa(s)`);
      }
      
      return { success: true };
    } catch (error: any) {
      lastError = error;
      
      // Se ainda há tentativas, fazer backoff exponencial
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        console.log(`⚠ Tentativa ${attempt + 1} falhou para ${to}. Aguardando ${backoffMs}ms antes de tentar novamente...`);
        await sleep(backoffMs);
      }
    }
  }
  
  // Se chegou aqui, todas as tentativas falharam
  console.error(`✗ Todas as ${maxRetries + 1} tentativas falharam para ${to}`);
  throw lastError || new Error('Falha ao enviar email após múltiplas tentativas');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // --- Validação JWT obrigatória ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = userData.user.id;
    // --- Verificação de permissão: admin → gestor_captacao → captacao_leader → permissão granular ---
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const isAdmin = roleData?.some((r: any) => r.role === 'admin');
    const isGestorCaptacao = roleData?.some((r: any) => r.role === 'gestor_captacao');
    const isLider = roleData?.some((r: any) => r.role === 'lideres');

    let allowed = isAdmin || isGestorCaptacao;

    // Verificar is_captacao_leader: role lideres + setor com nome contendo "capta"
    if (!allowed && isLider) {
      const { data: profile } = await adminClient
        .from('profiles')
        .select('setor_id')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.setor_id) {
        const { data: setor } = await adminClient
          .from('setores')
          .select('nome')
          .eq('id', profile.setor_id)
          .maybeSingle();

        if (setor?.nome && setor.nome.toLowerCase().includes('capta')) {
          allowed = true;
        }
      }
    }

    // Verificar permissão granular
    if (!allowed) {
      const { data: permData } = await adminClient
        .from('captacao_permissoes_usuario')
        .select('pode_disparos_email')
        .eq('user_id', userId)
        .maybeSingle();

      if (permData?.pode_disparos_email) {
        allowed = true;
      }
    }

    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: sem permissão para envio de emails' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    // --- Fim validação JWT + permissão ---

    const gmailUser = Deno.env.get('GMAIL_USER');
    const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD');
    
    if (!gmailUser || !gmailPassword) {
      throw new Error('GMAIL_USER ou GMAIL_APP_PASSWORD não configurados');
    }

    const supabase = adminClient;

    const { assunto, corpo, destinatarios, tamanhoLote = 50, maxRetries = 3 }: SendBulkEmailsRequest = await req.json();

    console.log(`Iniciando envio para ${destinatarios.length} destinatarios`);

    if (!assunto?.trim() || !corpo?.trim()) {
      return new Response(JSON.stringify({ success: false, error: 'Assunto e corpo são obrigatórios' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const validos = (destinatarios || []).filter(d => d.email && d.email.includes('@'));
    console.log(`${validos.length} destinatários com email válido`);
    
    if (validos.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Nenhum destinatário com e-mail válido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Configurar cliente SMTP do Gmail
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: gmailUser,
          password: gmailPassword,
        },
      },
    });

    let enviados = 0;
    let falhas = 0;
    const detalhes_falhas: Array<{email?: string; nome?: string; erro: string}> = [];

    for (let i = 0; i < validos.length; i += tamanhoLote) {
      const lote = validos.slice(i, i + tamanhoLote);
      console.log(`Processando lote ${Math.floor(i / tamanhoLote) + 1}: ${lote.length} emails`);

      // Gerar ID único para este lote (usamos timestamp + hash)
      const disparoId = `SIGMA-${Date.now().toString(36).toUpperCase()}`;
      console.log(`🔖 ID do disparo para rastreamento: ${disparoId}`);

      const results = await Promise.all(lote.map(async (dest) => {
        try {
          // Adicionar ID único no assunto para rastreamento de respostas
          const assuntoComId = `${assunto} [${disparoId}]`;
          
          const html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">Olá, ${dest.nome || ''}!</h2>
              <div style="color: #666; line-height: 1.6; white-space: pre-wrap;">
                ${corpo}
              </div>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;" />
              <p style="color: #999; font-size: 12px;">
                Esta mensagem foi enviada pela GSS - Gestão Serviços Saúde
              </p>
              <p style="color: #ccc; font-size: 10px;">
                Ref: ${disparoId}
              </p>
            </div>`;

          await sendGmailEmail(client, dest.email!, dest.nome, assuntoComId, html, maxRetries);
          console.log(`✓ Email enviado para ${dest.email} com ID ${disparoId}`);
          return { ok: true };
        } catch (e: any) {
          console.error(`✗ Falha definitiva ao enviar para ${dest.email}:`, e.message);
          return { ok: false, error: e?.message || 'Erro desconhecido' };
        }
      }));

      results.forEach((r, idx) => {
        if (r.ok) {
          enviados++;
        } else {
          falhas++;
          detalhes_falhas.push({ 
            email: lote[idx].email, 
            nome: lote[idx].nome, 
            erro: r.error! 
          });
        }
      });

      if (i + tamanhoLote < validos.length) {
        await sleep(1000);
      }
    }

    // Fechar conexão SMTP
    await client.close();

    console.log(`Envio concluído: ${enviados} enviados, ${falhas} falhas`);

    return new Response(JSON.stringify({ 
      success: true, 
      enviados, 
      falhas, 
      detalhes_falhas: falhas > 0 ? detalhes_falhas : null 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Erro ao enviar emails:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error?.message || 'Erro desconhecido' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
