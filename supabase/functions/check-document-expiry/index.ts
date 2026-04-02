import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Buscar documentos com validade definida (vencidos ou próximos de vencer em 30 dias)
    const hoje = new Date();
    const limite30dias = new Date();
    limite30dias.setDate(limite30dias.getDate() + 30);

    const { data: documentos, error: docError } = await supabase
      .from("medico_documentos")
      .select("id, medico_id, arquivo_nome, tipo_documento, data_validade")
      .not("data_validade", "is", null)
      .lte("data_validade", limite30dias.toISOString().split("T")[0])
      .order("data_validade", { ascending: true });

    if (docError) throw docError;

    if (!documentos || documentos.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhum documento próximo do vencimento", notificacoes_criadas: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar nomes dos médicos
    const medicoIds = [...new Set(documentos.map((d) => d.medico_id))];
    const { data: medicos } = await supabase
      .from("medicos")
      .select("id, nome_completo")
      .in("id", medicoIds);

    const medicoMap = new Map((medicos || []).map((m) => [m.id, m.nome_completo]));

    // 3. Buscar gestoras de contratos (role = gestor_contratos)
    const { data: gestores, error: gestorError } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "gestor_contratos");

    if (gestorError) throw gestorError;

    if (!gestores || gestores.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhum gestor de contratos encontrado", notificacoes_criadas: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const gestorIds = gestores.map((g) => g.user_id);

    // 4. Verificar notificações já enviadas hoje para não duplicar
    const hojeStr = hoje.toISOString().split("T")[0];
    const { data: notificacoesHoje } = await supabase
      .from("system_notifications")
      .select("referencia_id, user_id")
      .in("tipo", ["documento_vencido", "documento_vencendo"])
      .gte("created_at", hojeStr + "T00:00:00Z")
      .lte("created_at", hojeStr + "T23:59:59Z");

    const jaNotificadoSet = new Set(
      (notificacoesHoje || []).map((n) => `${n.referencia_id}_${n.user_id}`)
    );

    // 5. Criar notificações
    const notificacoes: any[] = [];

    for (const doc of documentos) {
      const validade = new Date(doc.data_validade + "T12:00:00");
      const diffDays = Math.ceil((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
      const isVencido = diffDays < 0;
      const medicoNome = medicoMap.get(doc.medico_id) || "Médico";

      const tipo = isVencido ? "documento_vencido" : "documento_vencendo";
      const titulo = isVencido
        ? `⚠️ Documento vencido: ${doc.tipo_documento}`
        : `⏳ Documento vence em ${diffDays} dia(s): ${doc.tipo_documento}`;
      const mensagem = `${doc.arquivo_nome} do(a) ${medicoNome} ${
        isVencido
          ? `venceu em ${validade.toLocaleDateString("pt-BR")}`
          : `vence em ${validade.toLocaleDateString("pt-BR")} (${diffDays} dias)`
      }`;

      for (const userId of gestorIds) {
        const chave = `${doc.id}_${userId}`;
        if (!jaNotificadoSet.has(chave)) {
          notificacoes.push({
            user_id: userId,
            tipo,
            titulo,
            mensagem,
            link: "/medicos",
            referencia_id: doc.id,
          });
          jaNotificadoSet.add(chave);
        }
      }
    }

    if (notificacoes.length > 0) {
      const { error: insertError } = await supabase
        .from("system_notifications")
        .insert(notificacoes);

      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        message: "Verificação concluída",
        documentos_analisados: documentos.length,
        notificacoes_criadas: notificacoes.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Erro:", error);
    return new Response(
      JSON.stringify({ error: error?.message ?? String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
