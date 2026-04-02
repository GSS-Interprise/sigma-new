import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticketId } = await req.json();

    console.log("=== RESEND TICKET EMAIL ===");
    console.log("Ticket ID recebido:", ticketId);

    if (!ticketId) {
      return new Response(
        JSON.stringify({ error: "ticketId é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Buscar o ticket
    console.log("Buscando ticket no banco...");
    const { data: ticket, error: ticketError } = await supabase
      .from('suporte_tickets')
      .select('*')
      .eq('id', ticketId)
      .single();

    console.log("Resultado da busca:", { ticket, ticketError });

    if (ticketError || !ticket) {
      console.error("Erro ao buscar ticket:", ticketError);
      return new Response(
        JSON.stringify({ error: "Ticket não encontrado", details: ticketError }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar email do solicitante
    console.log("Buscando perfil do solicitante:", ticket.solicitante_id);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', ticket.solicitante_id)
      .single();

    console.log("Resultado do perfil:", { profile, profileError });

    if (profileError || !profile?.email) {
      console.error("Erro ao buscar perfil:", profileError);
      return new Response(
        JSON.stringify({ error: "Email do solicitante não encontrado", details: profileError }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const solicitanteEmail = profile.email;

    console.log("Reenviando email para ticket:", ticket.numero);

    // Chamar a função send-support-email
    const { error: emailError } = await supabase.functions.invoke(
      "send-support-email",
      {
        body: {
          ticketId: ticketId,
          ticketNumero: ticket.numero,
          solicitanteNome: ticket.solicitante_nome,
          solicitanteEmail: solicitanteEmail,
          setorNome: ticket.setor_nome || "Sem setor",
          dataAbertura: ticket.data_abertura,
          tipo: ticket.tipo,
          destino: ticket.destino,
          fornecedorExterno: ticket.fornecedor_externo || null,
          descricao: ticket.descricao,
          anexosCount: ticket.anexos?.length || 0,
          anexos: ticket.anexos || [],
        },
      }
    );

    if (emailError) {
      console.error("Erro ao enviar email:", emailError);
      
      // Atualizar status de falha
      await supabase
        .from('suporte_tickets')
        .update({
          email_enviado_em: new Date().toISOString(),
          email_status: 'falha',
          email_erro: emailError.message || 'Erro ao enviar email'
        })
        .eq('id', ticketId);
      
      return new Response(
        JSON.stringify({ error: "Erro ao enviar email", details: emailError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Email reenviado com sucesso para ticket:", ticket.numero);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Email reenviado com sucesso para o ticket ${ticket.numero}`,
        ticketNumero: ticket.numero,
        email: solicitanteEmail
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Erro na função resend-ticket-email:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
