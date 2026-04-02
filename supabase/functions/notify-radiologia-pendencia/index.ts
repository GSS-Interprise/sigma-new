import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const gmailUser = Deno.env.get("GMAIL_USER");
const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface NotifyPendenciaRequest {
  pendenciaId: string;
  medicoEmail: string;
  medicoNome: string;
  clienteNome: string;
  segmento: string;
  quantidadePendente: number;
  descricaoInicial: string;
  prazoLimiteSla: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      pendenciaId,
      medicoEmail,
      medicoNome,
      clienteNome,
      segmento,
      quantidadePendente,
      descricaoInicial,
      prazoLimiteSla,
    }: NotifyPendenciaRequest = await req.json();

    console.log("Enviando notificação de pendência:", {
      pendenciaId,
      medicoEmail,
      medicoNome,
    });

    const prazoFormatado = new Date(prazoLimiteSla).toLocaleString("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
    });

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a1a;">Nova Pendência de Laudo</h2>
        
        <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0; color: #666;"><strong>Médico:</strong> ${medicoNome}</p>
          <p style="margin: 10px 0 0 0; color: #666;"><strong>Cliente:</strong> ${clienteNome}</p>
          <p style="margin: 10px 0 0 0; color: #666;"><strong>Segmento:</strong> ${segmento}</p>
          <p style="margin: 10px 0 0 0; color: #666;"><strong>Quantidade Pendente:</strong> ${quantidadePendente}</p>
          <p style="margin: 10px 0 0 0; color: #666;"><strong>Prazo Limite (SLA):</strong> ${prazoFormatado}</p>
        </div>

        <div style="margin: 20px 0;">
          <p style="margin: 0; color: #333;"><strong>Descrição:</strong></p>
          <p style="margin: 10px 0 0 0; color: #666;">${descricaoInicial || "Sem descrição adicional"}</p>
        </div>

        <div style="margin: 30px 0; padding: 15px; background-color: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
          <p style="margin: 0; color: #856404;">
            <strong>Atenção:</strong> Esta pendência possui um prazo limite (SLA). 
            Por favor, providencie a resolução o mais breve possível.
          </p>
        </div>

        <div style="margin: 30px 0;">
          <a href="${Deno.env.get("VITE_SUPABASE_URL")}" 
             style="background-color: #0066cc; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">
            Acessar Sistema Sigma
          </a>
        </div>

        <p style="color: #999; font-size: 12px; margin-top: 30px;">
          Esta é uma mensagem automática do Sistema Sigma de Gestão. Por favor, não responda este e-mail.
        </p>
      </div>
    `;

    console.log("Enviando email para:", medicoEmail);

    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: gmailUser!,
          password: gmailPassword!,
        },
      },
    });

    await client.send({
      from: gmailUser!,
      to: medicoEmail,
      subject: `Pendência de Laudo - ${clienteNome} - ${segmento}`,
      html: emailHtml,
    });

    await client.close();

    console.log("E-mail enviado com sucesso para:", medicoEmail);

    // Registrar no histórico
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        {
          global: {
            headers: { Authorization: authHeader },
          },
        }
      );

      await supabase.from("radiologia_pendencias_historico").insert({
        pendencia_id: pendenciaId,
        usuario_nome: "Sistema",
        acao: "email_enviado",
        detalhes: `E-mail de notificação enviado para ${medicoEmail}`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email sent successfully",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Erro ao enviar notificação de pendência:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
