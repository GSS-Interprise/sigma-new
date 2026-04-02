import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar tickets parados há mais de 7 dias em "aguardando_usuario" ou "em_validacao"
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoffDate = sevenDaysAgo.toISOString();

    const { data: staleTickets, error: fetchError } = await supabase
      .from("suporte_tickets")
      .select("id, numero, status, updated_at")
      .in("status", ["aguardando_usuario", "em_validacao"])
      .lt("updated_at", cutoffDate);

    if (fetchError) {
      console.error("Erro ao buscar tickets:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!staleTickets || staleTickets.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Nenhum ticket encontrado para encerramento automático",
          closed_count: 0 
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const closedTickets: string[] = [];
    const errors: string[] = [];

    for (const ticket of staleTickets) {
      const statusAnterior = ticket.status === "aguardando_usuario" 
        ? "Aguardando Usuário" 
        : "Em Validação";

      // Adicionar comentário de encerramento automático
      const { error: commentError } = await supabase
        .from("suporte_comentarios")
        .insert({
          ticket_id: ticket.id,
          autor_nome: "Sistema Automático",
          mensagem: `🔒 **Encerramento Automático**\n\nEste ticket foi encerrado automaticamente após permanecer mais de 7 dias no status "${statusAnterior}" sem movimentação.\n\nCaso o problema persista, por favor abra um novo chamado.`,
          is_externo: false,
        });

      if (commentError) {
        console.error(`Erro ao adicionar comentário no ticket ${ticket.numero}:`, commentError);
        errors.push(`Comentário: ${ticket.numero}`);
        continue;
      }

      // Atualizar status para concluído
      const { error: updateError } = await supabase
        .from("suporte_tickets")
        .update({ 
          status: "concluido",
          data_resolucao: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", ticket.id);

      if (updateError) {
        console.error(`Erro ao encerrar ticket ${ticket.numero}:`, updateError);
        errors.push(`Update: ${ticket.numero}`);
        continue;
      }

      closedTickets.push(ticket.numero);
      console.log(`Ticket ${ticket.numero} encerrado automaticamente (estava em ${statusAnterior})`);
    }

    // Log de auditoria
    if (closedTickets.length > 0) {
      await supabase.from("auditoria_logs").insert({
        usuario_nome: "Sistema Automático",
        modulo: "Suporte",
        tabela: "suporte_tickets",
        acao: "AUTO_CLOSE",
        detalhes: `Encerramento automático de ${closedTickets.length} ticket(s) parados há mais de 7 dias: ${closedTickets.join(", ")}`,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `${closedTickets.length} ticket(s) encerrado(s) automaticamente`,
        closed_count: closedTickets.length,
        closed_tickets: closedTickets,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erro na execução:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
