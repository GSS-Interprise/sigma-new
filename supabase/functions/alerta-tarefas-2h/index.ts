import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Roda a cada 10 min via pg_cron.
 * Procura tarefas cujo (data_limite + data_limite_hora) cai entre
 * agora+1h50 e agora+2h10, marca alerta_2h_enviado_at e cria notificação
 * para criador, responsável e mencionados.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const agora = new Date();
    const min = new Date(agora.getTime() + (2 * 60 - 10) * 60 * 1000); // +1h50
    const max = new Date(agora.getTime() + (2 * 60 + 10) * 60 * 1000); // +2h10
    const hojeISO = agora.toISOString().slice(0, 10);
    const amanhaISO = new Date(agora.getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const { data: tarefas, error } = await supabase
      .from("worklist_tarefas")
      .select("id, titulo, data_limite, data_limite_hora, created_by, responsavel_id, status, alerta_2h_enviado_at")
      .in("data_limite", [hojeISO, amanhaISO])
      .not("data_limite_hora", "is", null)
      .is("alerta_2h_enviado_at", null)
      .neq("status", "concluida");
    if (error) throw error;

    let enviadas = 0;
    for (const t of tarefas ?? []) {
      const due = new Date(`${t.data_limite}T${t.data_limite_hora}-03:00`);
      if (due < min || due > max) continue;

      // pessoas a notificar
      const ids = new Set<string>();
      if (t.created_by) ids.add(t.created_by);
      if (t.responsavel_id) ids.add(t.responsavel_id);
      const { data: mencionados } = await supabase
        .from("worklist_tarefa_mencionados")
        .select("user_id")
        .eq("tarefa_id", t.id);
      (mencionados ?? []).forEach((m) => m.user_id && ids.add(m.user_id));

      const hh = (t.data_limite_hora as string).slice(0, 5);
      const titulo = `⏰ Tarefa expira às ${hh}`;
      const mensagem = t.titulo;
      const link = `/demandas?tarefa=${t.id}`;

      const rows = Array.from(ids).map((user_id) => ({
        user_id,
        tipo: "tarefa_alerta_2h",
        titulo,
        mensagem,
        link,
        referencia_id: t.id,
      }));
      if (rows.length) {
        const { error: nErr } = await supabase
          .from("system_notifications")
          .insert(rows);
        if (nErr) {
          console.error("notif insert", nErr.message);
          continue;
        }
      }

      await supabase
        .from("worklist_tarefas")
        .update({ alerta_2h_enviado_at: new Date().toISOString() })
        .eq("id", t.id);
      enviadas++;
    }

    return new Response(JSON.stringify({ ok: true, enviadas }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error).message ?? e) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});