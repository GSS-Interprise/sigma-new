import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const resendFromEmail = "Sistema SIGMA <bi@gestaoservicosaude.com.br>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ContratoEmailRequest {
  emails: string[];
  contratoData: {
    cliente_nome: string;
    tipos_servico: string[];
    status_assinatura: string;
    valor_total: number;
    data_vigencia: string;
    contrato_id: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { emails, contratoData }: ContratoEmailRequest = await req.json();

    console.log("Enviando resumo de contrato para:", emails);
    console.log("Dados do contrato:", contratoData);

    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum email para enviar" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const dataFormatada = new Date(contratoData.data_vigencia).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const valorFormatado = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(contratoData.valor_total);

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Resumo de Contrato Cadastrado</h2>
        
        <p style="color: #374151; font-size: 16px;">Um novo contrato foi cadastrado no sistema SIGMA.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Informações do Contrato</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Cliente:</td>
              <td style="padding: 8px 0;">${contratoData.cliente_nome}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Tipos de Serviço:</td>
              <td style="padding: 8px 0;">${contratoData.tipos_servico.join(", ")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Status de Assinatura:</td>
              <td style="padding: 8px 0;">${contratoData.status_assinatura}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Valor Total:</td>
              <td style="padding: 8px 0;">${valorFormatado}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Data de Início da Vigência:</td>
              <td style="padding: 8px 0;">${dataFormatada}</td>
            </tr>
          </table>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p>Esta é uma mensagem automática do Sistema SIGMA de Gestão de Contratos.</p>
          <p>Para mais detalhes, acesse o sistema.</p>
        </div>
      </div>
    `;

    let sentCount = 0;
    for (const email of emails) {
      try {
        console.log("Enviando email para:", email);
        await resend.emails.send({
          from: resendFromEmail,
          to: email,
          subject: `Resumo de Contrato - ${contratoData.cliente_nome}`,
          html: emailHtml,
        });
        sentCount++;
        console.log("Email enviado com sucesso para:", email);
      } catch (emailError: any) {
        console.error(`Erro ao enviar email para ${email}:`, emailError?.message || emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Emails enviados com sucesso",
        emailsSent: sentCount,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Erro ao enviar emails:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
