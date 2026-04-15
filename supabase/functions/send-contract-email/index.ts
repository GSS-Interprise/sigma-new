import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Anexo {
  nome: string;
  url: string;
}

interface ContratoEmailRequest {
  remetente_email?: string;
  remetente_nome?: string;
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
    cnpj?: string;
    nome_unidade?: string;
    endereco?: string;
    data_termino?: string;
    qtd_aditivos?: number;
    valor_estimado?: number;
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

    const formatDate = (d?: string) => {
      if (!d) return "Não informada";
      return new Date(d).toLocaleDateString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });
    };

    const formatCurrency = (v?: number) => {
      if (v === undefined || v === null) return "Não informado";
      return new Intl.NumberFormat("pt-BR", {
        style: "currency", currency: "BRL",
      }).format(v);
    };

    const dataInicioFormatada = formatDate(contratoData.data_vigencia);
    const dataTerminoFormatada = formatDate(contratoData.data_termino);
    const valorTotalFormatado = formatCurrency(contratoData.valor_total);
    const valorEstimadoFormatado = formatCurrency(contratoData.valor_estimado);

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

    const row = (label: string, value: string | undefined | null) => {
      if (!value) return '';
      return `<tr>
        <td style="padding: 8px 0; font-weight: bold; color: #6b7280; white-space: nowrap; vertical-align: top; width: 180px;">${label}:</td>
        <td style="padding: 8px 0; padding-left: 12px;">${value}</td>
      </tr>`;
    };

    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 650px; margin: 0 auto; color: #1f2937;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); padding: 24px 28px; border-radius: 12px 12px 0 0;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px;">📋 Resumo de Contrato</h2>
          <p style="color: #bfdbfe; margin: 6px 0 0; font-size: 14px;">Sistema SIGMA · Gestão de Contratos</p>
        </div>

        <div style="border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px 28px;">
          <p style="color: #374151; font-size: 15px; margin-top: 0;">Segue o resumo completo do contrato cadastrado no sistema.</p>

          <!-- Dados do Cliente -->
          <div style="background-color: #eff6ff; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <h3 style="margin-top: 0; color: #1e40af; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">🏢 Dados do Cliente</h3>
            <table style="width: 100%; border-collapse: collapse;">
              ${row('Cliente', contratoData.cliente_nome)}
              ${row('CNPJ', contratoData.cnpj)}
              ${row('Unidade', contratoData.nome_unidade)}
              ${row('Endereço', contratoData.endereco)}
            </table>
          </div>

          <!-- Dados do Contrato -->
          <div style="background-color: #f3f4f6; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6b7280;">
            <h3 style="margin-top: 0; color: #374151; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">📄 Dados do Contrato</h3>
            <table style="width: 100%; border-collapse: collapse;">
              ${row('Código', contratoData.codigo_contrato)}
              ${row('Objeto', contratoData.objeto_contrato)}
              ${row('Tipos de Serviço', contratoData.tipos_servico?.join(', ') || 'Não informado')}
              ${row('Status Assinatura', contratoData.status_assinatura)}
              ${row('Tipo Contratação', contratoData.condicao_pagamento)}
            </table>
          </div>

          <!-- Vigência e Valores -->
          <div style="background-color: #f0fdf4; padding: 18px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #16a34a;">
            <h3 style="margin-top: 0; color: #166534; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">💰 Vigência e Valores</h3>
            <table style="width: 100%; border-collapse: collapse;">
              ${row('Data de Início', dataInicioFormatada)}
              ${row('Data de Término', dataTerminoFormatada)}
              ${row('Prazo', contratoData.prazo_meses ? `${contratoData.prazo_meses} meses` : undefined)}
              ${row('Qtd. Aditivos', contratoData.qtd_aditivos !== undefined ? String(contratoData.qtd_aditivos) : undefined)}
              ${row('Valor Total (Itens)', valorTotalFormatado)}
              ${row('Valor Estimado', valorEstimadoFormatado)}
              ${row('Condição de Pagamento', contratoData.condicao_pagamento)}
            </table>
          </div>

          ${anexosHtml}

          <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
            <p>Esta é uma mensagem automática do Sistema SIGMA de Gestão de Contratos.</p>
            <p>Para mais detalhes, acesse o sistema.</p>
          </div>
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
          metadata: {
            cliente: contratoData.cliente_nome,
            valor: contratoData.valor_total,
            cnpj: contratoData.cnpj,
            unidade: contratoData.nome_unidade,
            anexos: contratoData.anexos?.length || 0,
          },
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
