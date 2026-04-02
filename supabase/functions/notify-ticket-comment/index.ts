import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

const gmailUser = Deno.env.get("GMAIL_USER");
const gmailPassword = Deno.env.get("GMAIL_APP_PASSWORD");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface CommentNotificationRequest {
  ticketNumero: string;
  solicitanteNome: string;
  solicitanteEmail: string;
  autorNome: string;
  mensagem: string;
  dataComentario: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const {
      ticketNumero,
      solicitanteNome,
      solicitanteEmail,
      autorNome,
      mensagem,
      dataComentario,
    }: CommentNotificationRequest = await req.json();

    console.log("Processing comment notification for ticket:", ticketNumero);

    // Formatar data
    const dataFormatada = new Date(dataComentario).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Email HTML para notificação de comentário
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Nova Mensagem no Ticket ${ticketNumero}</h2>
        
        <p style="color: #374151; font-size: 16px;">Olá, <strong>${solicitanteNome}</strong>!</p>
        
        <p style="color: #374151;">Há uma nova mensagem no seu ticket de suporte:</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Nº do Ticket:</td>
              <td style="padding: 8px 0;">${ticketNumero}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">De:</td>
              <td style="padding: 8px 0;">${autorNome}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Data:</td>
              <td style="padding: 8px 0;">${dataFormatada}</td>
            </tr>
          </table>
        </div>

        <div style="margin: 20px 0;">
          <h3 style="color: #374151;">Mensagem</h3>
          <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb;">
            <p style="margin: 0; white-space: pre-wrap;">${mensagem}</p>
          </div>
        </div>

        <div style="margin-top: 30px;">
          <p style="color: #374151;">Para visualizar o ticket completo e responder, acesse o sistema SIGMA.</p>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p>Esta é uma mensagem automática do Sistema SIGMA de Gestão de Suporte.</p>
          <p>Você receberá notificações sobre todas as atualizações do seu ticket.</p>
        </div>
      </div>
    `;

    // Enviar email usando Gmail SMTP
    console.log("Enviando notificação de comentário para:", solicitanteEmail);
    
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
      to: solicitanteEmail,
      replyTo: gmailUser!,
      subject: `[#${ticketNumero}] Nova mensagem no seu ticket`,
      html: emailHtml,
    });

    console.log("Comment notification email sent successfully to:", solicitanteEmail);

    await client.close();

    return new Response(
      JSON.stringify({
        success: true,
        message: "Comment notification email sent successfully",
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
    console.error("Error in notify-ticket-comment function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
