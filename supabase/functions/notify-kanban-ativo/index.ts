import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("Starting notify-kanban-ativo function...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Buscar cards na coluna "ativo" com mais de 3 dias
    const { data: cards, error: cardsError } = await supabase
      .from("medico_kanban_cards")
      .select("id, nome, telefone, email, crm, updated_at")
      .eq("status", "ativo");

    if (cardsError) {
      console.error("Error fetching cards:", cardsError);
      throw cardsError;
    }

    console.log(`Found ${cards?.length || 0} cards in 'ativo' status`);

    if (!cards || cards.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No cards to notify", notificationsCreated: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 2. Calcular dias de cada card
    const now = new Date();
    const cardsWithDays = cards.map(card => {
      const updatedAt = new Date(card.updated_at);
      const diffTime = Math.abs(now.getTime() - updatedAt.getTime());
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return { ...card, days: diffDays };
    });

    // Filtrar apenas cards com 3+ dias (que precisam de atenção)
    const cardsNeedingAttention = cardsWithDays.filter(c => c.days >= 3);
    console.log(`Cards needing attention (3+ days): ${cardsNeedingAttention.length}`);

    if (cardsNeedingAttention.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No urgent cards", notificationsCreated: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 3. Buscar setor de "Contratos"
    const { data: setorContratos, error: setorError } = await supabase
      .from("setores")
      .select("id")
      .ilike("nome", "%contrato%")
      .single();

    if (setorError || !setorContratos) {
      console.error("Setor 'Contratos' not found:", setorError);
      throw new Error("Setor 'Contratos' não encontrado");
    }

    console.log(`Found setor Contratos: ${setorContratos.id}`);

    // 4. Buscar usuários do setor de Contratos
    const { data: usersContratos, error: usersError } = await supabase
      .from("profiles")
      .select("id, nome_completo")
      .eq("setor_id", setorContratos.id)
      .eq("ativo", true);

    if (usersError) {
      console.error("Error fetching users:", usersError);
      throw usersError;
    }

    console.log(`Found ${usersContratos?.length || 0} users in Contratos sector`);

    if (!usersContratos || usersContratos.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No users in Contratos sector", notificationsCreated: 0 }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 5. Criar notificações para cada usuário do setor de Contratos
    const notifications: any[] = [];
    const today = now.toISOString().split('T')[0];

    for (const user of usersContratos) {
      for (const card of cardsNeedingAttention) {
        // Verificar se já existe notificação para este card hoje
        const { data: existingNotif } = await supabase
          .from("system_notifications")
          .select("id")
          .eq("user_id", user.id)
          .eq("referencia_id", card.id)
          .eq("tipo", "kanban_ativo")
          .gte("created_at", today)
          .maybeSingle();

        if (!existingNotif) {
          let urgencyText = "";
          if (card.days >= 10) {
            urgencyText = "🔴 URGENTE";
          } else if (card.days >= 6) {
            urgencyText = "🟠 Atenção alta";
          } else {
            urgencyText = "🟡 Pendente";
          }

          notifications.push({
            user_id: user.id,
            tipo: "kanban_ativo",
            titulo: `${urgencyText} - Cadastro médico pendente`,
            mensagem: `${card.nome} está há ${card.days} dias na coluna "Ativo". ${card.crm ? `CRM: ${card.crm}` : ""}`,
            link: "/medicos",
            referencia_id: card.id,
          });
        }
      }
    }

    console.log(`Creating ${notifications.length} notifications...`);

    if (notifications.length > 0) {
      const { error: insertError } = await supabase
        .from("system_notifications")
        .insert(notifications);

      if (insertError) {
        console.error("Error inserting notifications:", insertError);
        throw insertError;
      }
    }

    console.log("Notifications created successfully!");

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Notifications sent", 
        notificationsCreated: notifications.length,
        cardsChecked: cardsNeedingAttention.length,
        usersNotified: usersContratos.length
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in notify-kanban-ativo:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});
