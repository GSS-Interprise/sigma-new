import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const resendFromEmail = "Sistema SIGMA <bi@gestaoservicosaude.com.br>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SupportEmailRequest {
  ticketNumero: string;
  solicitanteNome: string;
  solicitanteEmail: string;
  setorNome: string;
  dataAbertura: string;
  tipo: string;
  destino: string;
  fornecedorExterno: string;
  descricao: string;
  anexosCount: number;
  anexos?: string[];
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
      setorNome,
      dataAbertura,
      tipo,
      destino,
      fornecedorExterno,
      descricao,
      anexosCount,
      anexos = [],
      ticketId,
    }: SupportEmailRequest & { ticketId?: string } = await req.json();

    console.log("Processing support email for ticket:", ticketNumero);
    console.log("Anexos recebidos:", anexos?.length || 0);

    // Criar cliente Supabase para baixar anexos
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Baixar anexos do Storage
    const attachments = [];
    for (const anexoUrl of anexos) {
      try {
        console.log("Processando anexo:", anexoUrl);
        
        // Extrair o path do anexo (aceita URL completa ou path relativo)
        let filePath: string;
        
        if (anexoUrl.includes('/suporte-anexos/')) {
          // URL completa
          const urlParts = anexoUrl.split('/suporte-anexos/');
          filePath = urlParts[1];
        } else if (anexoUrl.startsWith('http')) {
          // URL completa sem o path esperado
          console.warn("URL de anexo não contém /suporte-anexos/:", anexoUrl);
          continue;
        } else {
          // Path relativo (ex: "user-id/filename.png")
          filePath = anexoUrl;
        }
        
        const fileName = filePath.split('/').pop() || 'anexo';
        console.log("Path do arquivo:", filePath);
        console.log("Nome do arquivo:", fileName);
        
        console.log("Baixando arquivo:", filePath);
        
        // Baixar o arquivo do Storage
        const { data, error } = await supabase.storage
          .from('suporte-anexos')
          .download(filePath);
        
        if (error) {
          console.error("Erro ao baixar anexo:", error);
          continue;
        }
        
        // Converter para base64
        const arrayBuffer = await data.arrayBuffer();
        const base64 = btoa(
          new Uint8Array(arrayBuffer)
            .reduce((data, byte) => data + String.fromCharCode(byte), '')
        );
        
        attachments.push({
          filename: fileName,
          content: base64,
        });
        
        console.log("Anexo processado com sucesso:", fileName);
      } catch (error) {
        console.error("Erro ao processar anexo:", error);
      }
    }

    console.log("Total de anexos processados:", attachments.length);

    // Formatar data
    const dataFormatada = new Date(dataAbertura).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    // Truncar descrição se necessário (máximo 1000 caracteres)
    const descricaoTruncada = descricao.length > 1000 
      ? descricao.substring(0, 1000) + "..." 
      : descricao;

    // Email para o solicitante (sempre enviado)
    const emailSolicitanteHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Confirmação de Abertura - Ticket ${ticketNumero}</h2>
        
        <p style="color: #374151; font-size: 16px;">Olá, <strong>${solicitanteNome}</strong>!</p>
        
        <p style="color: #374151;">Seu ticket de suporte foi criado com sucesso. Veja os detalhes abaixo:</p>
        
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #374151;">Informações do Ticket</h3>
          
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Nº do Ticket:</td>
              <td style="padding: 8px 0;">${ticketNumero}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Setor:</td>
              <td style="padding: 8px 0;">${setorNome}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Data de Abertura:</td>
              <td style="padding: 8px 0;">${dataFormatada}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Tipo:</td>
              <td style="padding: 8px 0;">${tipo === "software" ? "Software" : "Hardware"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Destino:</td>
              <td style="padding: 8px 0;">${destino === "interno" ? "Interno" : "Externo"}</td>
            </tr>
            ${anexosCount > 0 ? `
            <tr>
              <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Anexos:</td>
              <td style="padding: 8px 0;">${anexosCount} arquivo(s)</td>
            </tr>
            ` : ""}
          </table>
        </div>

        <div style="margin: 20px 0;">
          <h3 style="color: #374151;">Descrição</h3>
          <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb;">
            <p style="margin: 0; white-space: pre-wrap;">${descricaoTruncada}</p>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
          <p>Esta é uma mensagem automática do Sistema SIGMA de Gestão de Suporte.</p>
          <p>Você será notificado sobre atualizações no status do seu ticket.</p>
        </div>
      </div>
    `;

    // Enviar email para o solicitante usando Resend
    console.log("Enviando email para:", solicitanteEmail);
    
    await resend.emails.send({
      from: resendFromEmail,
      to: solicitanteEmail,
      subject: `[#${ticketNumero}] Ticket criado - ${tipo === "software" ? "Software" : "Hardware"}`,
      html: emailSolicitanteHtml,
      attachments: attachments.length > 0 ? attachments : undefined,
    });

    console.log("Email sent to requester:", solicitanteEmail);

    // Se for ticket externo, enviar também para o fornecedor
    if (destino === "externo" && fornecedorExterno) {
      let destinatario = "";
      let nomeDestinatario = "";
      
      if (fornecedorExterno === "infra_ti") {
        destinatario = "suporte@fredsouza.com";
        nomeDestinatario = "Infraestrutura de TI";
      } else if (fornecedorExterno === "dr_escala") {
        destinatario = "suporte@drescala.com.br";
        nomeDestinatario = "Dr. Escala";
      }

      if (destinatario) {
        const emailFornecedorHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Novo Ticket de Suporte - ${ticketNumero}</h2>
            
            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #374151;">Informações do Ticket</h3>
              
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Nº do Ticket:</td>
                  <td style="padding: 8px 0;">${ticketNumero}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Solicitante:</td>
                  <td style="padding: 8px 0;">${solicitanteNome}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Setor:</td>
                  <td style="padding: 8px 0;">${setorNome}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Data de Abertura:</td>
                  <td style="padding: 8px 0;">${dataFormatada}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Tipo:</td>
                  <td style="padding: 8px 0;">${tipo === "software" ? "Software" : "Hardware"}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Fornecedor:</td>
                  <td style="padding: 8px 0;">${nomeDestinatario}</td>
                </tr>
                ${anexosCount > 0 ? `
                <tr>
                  <td style="padding: 8px 0; font-weight: bold; color: #6b7280;">Anexos:</td>
                  <td style="padding: 8px 0;">${anexosCount} arquivo(s)</td>
                </tr>
                ` : ""}
              </table>
            </div>

            <div style="margin: 20px 0;">
              <h3 style="color: #374151;">Descrição do Pedido</h3>
              <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; border-left: 4px solid #2563eb;">
                <p style="margin: 0; white-space: pre-wrap;">${descricaoTruncada}</p>
              </div>
            </div>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px;">
              <p>Esta é uma mensagem automática do Sistema SIGMA de Gestão de Suporte.</p>
              <p>Por favor, não responda diretamente a este email.</p>
            </div>
          </div>
        `;

        console.log("Enviando email para fornecedor:", destinatario);
        
        await resend.emails.send({
          from: resendFromEmail,
          to: destinatario,
          subject: `[#${ticketNumero}] Novo Ticket – ${tipo === "software" ? "Software" : "Hardware"} – Externo`,
          html: emailFornecedorHtml,
          attachments: attachments.length > 0 ? attachments : undefined,
        });

        console.log("Email sent to supplier:", destinatario);
      }
    }

    // Atualizar status do email no ticket se ticketId foi fornecido
    if (ticketId) {
      await supabase
        .from('suporte_tickets')
        .update({
          email_enviado_em: new Date().toISOString(),
          email_status: 'enviado',
          email_erro: null
        })
        .eq('numero', ticketNumero);
      
      console.log("Status do email atualizado no ticket:", ticketNumero);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Emails sent successfully",
        attachmentsSent: attachments.length,
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
    console.error("Error in send-support-email function:", error);
    
    // Registrar falha no envio se ticketId foi fornecido
    if (req.method === 'POST') {
      try {
        const body = await req.clone().json();
        if (body.ticketId) {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const supabase = createClient(supabaseUrl, supabaseKey);
          
          await supabase
            .from('suporte_tickets')
            .update({
              email_enviado_em: new Date().toISOString(),
              email_status: 'falha',
              email_erro: error.message
            })
            .eq('numero', body.ticketNumero);
        }
      } catch (updateError) {
        console.error("Erro ao atualizar status de falha:", updateError);
      }
    }
    
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
