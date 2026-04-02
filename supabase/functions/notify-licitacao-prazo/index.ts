import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const agora = new Date();
    const em24Horas = new Date(agora.getTime() + 24 * 60 * 60 * 1000);

    // Buscar mensagens com prazo próximo (menos de 24h) que ainda não foram notificadas
    const { data: mensagensPrazoProximo, error: errorProximo } = await supabase
      .from("licitacoes_atividades")
      .select(`
        id,
        licitacao_id,
        descricao,
        resposta_esperada_ate,
        responsavel_resposta_id,
        setor_responsavel,
        is_critico,
        user_id,
        licitacoes:licitacao_id (titulo, numero_edital)
      `)
      .is("respondido_em", null)
      .not("resposta_esperada_ate", "is", null)
      .gt("resposta_esperada_ate", agora.toISOString())
      .lte("resposta_esperada_ate", em24Horas.toISOString())
      .eq("tipo", "comentario");

    if (errorProximo) {
      console.error("Erro ao buscar mensagens com prazo próximo:", errorProximo);
      throw errorProximo;
    }

    // Buscar mensagens com prazo vencido que ainda não foram notificadas
    const { data: mensagensPrazoVencido, error: errorVencido } = await supabase
      .from("licitacoes_atividades")
      .select(`
        id,
        licitacao_id,
        descricao,
        resposta_esperada_ate,
        responsavel_resposta_id,
        setor_responsavel,
        is_critico,
        user_id,
        licitacoes:licitacao_id (titulo, numero_edital)
      `)
      .is("respondido_em", null)
      .not("resposta_esperada_ate", "is", null)
      .lt("resposta_esperada_ate", agora.toISOString())
      .eq("tipo", "comentario");

    if (errorVencido) {
      console.error("Erro ao buscar mensagens com prazo vencido:", errorVencido);
      throw errorVencido;
    }

    let notificacoesCriadas = 0;

    // Processar mensagens com prazo próximo
    for (const mensagem of (mensagensPrazoProximo || [])) {
      // Verificar se já foi notificado sobre prazo próximo
      const { data: jaNotificado } = await supabase
        .from("licitacoes_notificacoes_prazo")
        .select("id")
        .eq("atividade_id", mensagem.id)
        .eq("tipo_notificacao", "prazo_proximo")
        .single();

      if (jaNotificado) continue;

      // Determinar quem notificar
      const destinatarios: string[] = [];
      
      if (mensagem.responsavel_resposta_id) {
        destinatarios.push(mensagem.responsavel_resposta_id);
      }
      
      // Se tem setor, buscar usuários do setor
      if (mensagem.setor_responsavel) {
        const { data: usuariosSetor } = await supabase
          .from("profiles")
          .select("id, setores!inner(nome)")
          .eq("setores.nome", mensagem.setor_responsavel);
        
        if (usuariosSetor) {
          destinatarios.push(...usuariosSetor.map((u: any) => u.id));
        }
      }
      
      // Se não tem responsável específico, notificar quem criou a mensagem
      if (destinatarios.length === 0 && mensagem.user_id) {
        destinatarios.push(mensagem.user_id);
      }

      // Extract licitacao data - it comes as an array from the join
      const licitacaoData = Array.isArray(mensagem.licitacoes) 
        ? mensagem.licitacoes[0] 
        : mensagem.licitacoes;
      const tituloLicitacao = licitacaoData?.titulo || licitacaoData?.numero_edital || "Licitação";

      // Criar notificações
      for (const userId of [...new Set(destinatarios)]) {
        const { error: notifError } = await supabase
          .from("system_notifications")
          .insert({
            user_id: userId,
            tipo: "licitacao_prazo_proximo",
            titulo: mensagem.is_critico ? "⚠️ Prazo de mensagem crítica próximo" : "Prazo de resposta próximo",
            mensagem: `A mensagem "${mensagem.descricao.slice(0, 50)}${mensagem.descricao.length > 50 ? '...' : ''}" na licitação "${tituloLicitacao}" precisa de resposta em menos de 24 horas.`,
            link: `/licitacoes?open=${mensagem.licitacao_id}`,
            referencia_id: mensagem.licitacao_id,
            lida: false,
          });

        if (notifError) {
          console.error("Erro ao criar notificação:", notifError);
        } else {
          notificacoesCriadas++;
        }
      }

      // Registrar que foi notificado
      await supabase
        .from("licitacoes_notificacoes_prazo")
        .insert({
          atividade_id: mensagem.id,
          tipo_notificacao: "prazo_proximo",
          user_id: destinatarios[0] || null,
        });
    }

    // Processar mensagens com prazo vencido
    for (const mensagem of (mensagensPrazoVencido || [])) {
      // Verificar se já foi notificado sobre prazo vencido
      const { data: jaNotificado } = await supabase
        .from("licitacoes_notificacoes_prazo")
        .select("id")
        .eq("atividade_id", mensagem.id)
        .eq("tipo_notificacao", "prazo_vencido")
        .single();

      if (jaNotificado) continue;

      // Determinar quem notificar
      const destinatarios: string[] = [];
      
      if (mensagem.responsavel_resposta_id) {
        destinatarios.push(mensagem.responsavel_resposta_id);
      }
      
      if (mensagem.setor_responsavel) {
        const { data: usuariosSetor } = await supabase
          .from("profiles")
          .select("id, setores!inner(nome)")
          .eq("setores.nome", mensagem.setor_responsavel);
        
        if (usuariosSetor) {
          destinatarios.push(...usuariosSetor.map((u: any) => u.id));
        }
      }
      
      if (destinatarios.length === 0 && mensagem.user_id) {
        destinatarios.push(mensagem.user_id);
      }

      const licitacaoData = Array.isArray(mensagem.licitacoes) 
        ? mensagem.licitacoes[0] 
        : mensagem.licitacoes;
      const tituloLicitacao = licitacaoData?.titulo || licitacaoData?.numero_edital || "Licitação";

      // Criar notificações
      for (const userId of [...new Set(destinatarios)]) {
        const { error: notifError } = await supabase
          .from("system_notifications")
          .insert({
            user_id: userId,
            tipo: "licitacao_prazo_vencido",
            titulo: mensagem.is_critico ? "🔴 Prazo de mensagem crítica VENCIDO" : "Prazo de resposta VENCIDO",
            mensagem: `O prazo para responder a mensagem "${mensagem.descricao.slice(0, 50)}${mensagem.descricao.length > 50 ? '...' : ''}" na licitação "${tituloLicitacao}" expirou!`,
            link: `/licitacoes?open=${mensagem.licitacao_id}`,
            referencia_id: mensagem.licitacao_id,
            lida: false,
          });

        if (notifError) {
          console.error("Erro ao criar notificação:", notifError);
        } else {
          notificacoesCriadas++;
        }
      }

      // Registrar que foi notificado
      await supabase
        .from("licitacoes_notificacoes_prazo")
        .insert({
          atividade_id: mensagem.id,
          tipo_notificacao: "prazo_vencido",
          user_id: destinatarios[0] || null,
        });
    }

    console.log(`Notificações de prazo processadas: ${notificacoesCriadas} criadas`);
    console.log(`Mensagens com prazo próximo: ${mensagensPrazoProximo?.length || 0}`);
    console.log(`Mensagens com prazo vencido: ${mensagensPrazoVencido?.length || 0}`);

    return new Response(
      JSON.stringify({
        success: true,
        notificacoesCriadas,
        prazoProximo: mensagensPrazoProximo?.length || 0,
        prazoVencido: mensagensPrazoVencido?.length || 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    console.error("Erro na edge function:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
