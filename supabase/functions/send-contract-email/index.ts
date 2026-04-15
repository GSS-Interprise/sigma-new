import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const resendFromEmail = "Sistema SIGMA <bi@gestaoservicosaude.com.br>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Anexo {
  nome: string;
  url: string;
}

interface ContratoEmailRequest {
  emails: string[];
  contratoData: {
    cliente_nome: string;
    tipos_servico: string[];
    status_assinatura: string;
    valor_total: number;
    data_vigencia: string;
    contrato_id: string;
    codigo_contrato?: string;
    objeto_contrato?: string;
    prazo_meses?: number;
    condicao_pagamento?: string;
    anexos?: Anexo[];
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { emails, contratoData }: ContratoEmailRequest = await req.json();

    console.log("Enviando resumo de contrato para:", emails);

    if (!emails || emails.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum email para enviar" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const dataFormatada = contratoData.data_vigencia
      ? new Date(contratoData.data_vigencia).toLocaleDateString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
        })
      : "Não informada";

    const valorFormatado = new Intl.NumberFormat("pt-BR", {
      style: "currency", currency: "BRL",
    }).format(contratoData.valor_total);

    const anexosHtml = contratoData.anexos && contratoData.anexos.length > 0
      ? `
        <div style="background-color: #f9fafb; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #374151; font-size: 14px;">📎 Anexos do Contrato (${contratoData.anexos.length})</h3>
          <ul style="margin: 0; padding-left: 20px;">
            ${contratoData.anexos.map(a => `<li style="padding: 4px 0;"><a href="${a.url}" style="color: #2563eb; text-decoration: underline;" target="_blank">${a.nome}</a></li>`).join('')}
          </ul>
        </div>
      `
      : '';

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Resumo de Contrato</h2>
        
        <p style="color: #374151; font-size: 16px;">Segue o resumo do contrato cadastrado no sistema SIGMA.</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Informações do Contrato</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            ${contratoData.codigo_contrato ? `<tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Código:</td>
              <td style="padding: 8px 0;">${contratoData.codigo_contrato}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Cliente:</td>
              <td style="padding: 8px 0;">${contratoData.cliente_nome}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Tipos de Serviço:</td>
              <td style="padding: 8px 0;">${contratoData.tipos_servico.join(", ") || "Não informado"}</td>
            </tr>
            ${contratoData.objeto_contrato ? `<tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Objeto:</td>
              <td style="padding: 8px 0;">${contratoData.objeto_contrato}</td>
            </tr>` : ''}
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Status de Assinatura:</td>
              <td style="padding: 8px 0;">${contratoData.status_assinatura}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Valor Total:</td>
              <td style="padding: 8px 0;">${valorFormatado}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Data de Início:</td>
              <td style="padding: 8px 0;">${dataFormatada}</td>
            </tr>
            ${contratoData.prazo_meses ? `<tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Prazo:</td>
              <td style="padding: 8px 0;">${contratoData.prazo_meses} meses</td>
            </tr>` : ''}
            ${contratoData.condicao_pagamento ? `<tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Condição de Pagamento:</td>
              <td style="padding: 8px 0;">${contratoData.condicao_pagamento}</td>
            </tr>` : ''}
          </table>
        </div>

        ${anexosHtml}

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p>Esta é uma mensagem automática do Sistema SIGMA de Gestão de Contratos.</p>
          <p>Para mais detalhes, acesse o sistema.</p>
        </div>
      </div>
    `;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let sentCount = 0;
    const subjectContrato = `Resumo de Contrato${contratoData.codigo_contrato ? ` ${contratoData.codigo_contrato}` : ''} - ${contratoData.cliente_nome}`;

    for (const email of emails) {
      try {
        await resend.emails.send({
          from: resendFromEmail,
          to: email,
          subject: subjectContrato,
          html: emailHtml,
        });
        sentCount++;

        await supabase.from('sigma_email_log').insert({
          modulo: 'contratos',
          referencia_id: contratoData.contrato_id,
          destinatario_email: email,
          assunto: subjectContrato,
          status: 'enviado',
          metadata: { cliente: contratoData.cliente_nome, valor: contratoData.valor_total, anexos: contratoData.anexos?.length || 0 },
        });
      } catch (emailError: any) {
        console.error(`Erro ao enviar email para ${email}:`, emailError?.message || emailError);
        
        await supabase.from('sigma_email_log').insert({
          modulo: 'contratos',
          referencia_id: contratoData.contrato_id,
          destinatario_email: email,
          assunto: subjectContrato,
          status: 'falha',
          erro: emailError?.message || 'Erro desconhecido',
          metadata: { cliente: contratoData.cliente_nome },
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: "Emails enviados com sucesso", emailsSent: sentCount }),
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
