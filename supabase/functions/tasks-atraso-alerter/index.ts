import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * F2.3 — Cron diário 9h. Identifica tasks pendentes com prazo no passado
 * e cria 1 system_notification por operadora afetada.
 *
 * Critério "atrasada":
 *   - status IN ('pendente', 'snooze')
 *   - prazo_at < NOW() - 1 hour (tolerância pra não alertar tasks ainda
 *     em "limite" no horário do disparo)
 *
 * Agrupa por dono do campanha_lead (assumido_por). Se a task está em
 * campanha_lead sem dono, cai num bucket "sem_dono" que vai pra todos
 * os admins (uma notificação por admin).
 *
 * Idempotência: registra no campo `referencia_id` o hash do dia (YYYY-MM-DD)
 * + user_id pra evitar duplicar se o cron rodar 2x no mesmo dia.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TaskAtrasada {
  task_id: string;
  campanha_lead_id: string;
  tipo: string;
  prazo_at: string;
  lead_nome: string;
  campanha_nome: string;
  assumido_por: string | null;
  assumido_por_nome: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Query direta: tasks pendentes/snooze com prazo no passado (>1h tolerância)
    const { data: rawTasks, error: rawErr } = await supabase
      .from("campanha_lead_tasks")
      .select(
        "id, campanha_lead_id, tipo, prazo_at, campanha_leads(lead_id, assumido_por, leads(nome), campanhas(nome))",
      )
      .in("status", ["pendente", "snooze"])
      .lt("prazo_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if (rawErr) throw rawErr;

    const tasksNormalizadas: TaskAtrasada[] = (rawTasks || []).map((t: any) => ({
      task_id: t.id,
      campanha_lead_id: t.campanha_lead_id,
      tipo: t.tipo,
      prazo_at: t.prazo_at,
      lead_nome: t.campanha_leads?.leads?.nome ?? "(sem nome)",
      campanha_nome: t.campanha_leads?.campanhas?.nome ?? "(sem nome)",
      assumido_por: t.campanha_leads?.assumido_por ?? null,
      assumido_por_nome: null,
    }));

    return await processarAlertas(supabase, tasksNormalizadas);
  } catch (error: any) {
    console.error("Erro tasks-atraso-alerter:", error);
    return new Response(
      JSON.stringify({ success: false, error: error?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

async function processarAlertas(
  supabase: any,
  tasks: TaskAtrasada[],
): Promise<Response> {
  if (tasks.length === 0) {
    return new Response(
      JSON.stringify({ success: true, alertas_criados: 0, mensagem: "Nenhuma task atrasada hoje" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Agrupa por dono. Tasks sem dono vão pra bucket especial "sem_dono".
  const porDono = new Map<string | "sem_dono", TaskAtrasada[]>();
  for (const t of tasks) {
    const key = t.assumido_por || "sem_dono";
    if (!porDono.has(key)) porDono.set(key, []);
    porDono.get(key)!.push(t);
  }

  // Pega admins pra notificar sobre tasks sem dono
  const { data: admins } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");
  const adminIds: string[] = (admins ?? []).map((a: any) => a.user_id);

  const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const alertasParaInserir: any[] = [];

  for (const [donoKey, tasksDono] of porDono) {
    const count = tasksDono.length;
    const primeiras = tasksDono.slice(0, 5).map((t) => t.lead_nome).join(", ");
    const overflow = count > 5 ? ` + ${count - 5} outras` : "";

    const titulo =
      donoKey === "sem_dono"
        ? `${count} task(s) sem dono atrasada(s)`
        : `Você tem ${count} task(s) atrasada(s)`;
    const mensagem = `${primeiras}${overflow}`;
    const link = `/prospeccao?view=acompanhamento`;

    // Quem recebe: o dono específico, ou todos os admins se for "sem_dono"
    const destinatarios: string[] =
      donoKey === "sem_dono" ? adminIds : [donoKey as string];

    for (const userId of destinatarios) {
      alertasParaInserir.push({
        user_id: userId,
        tipo: "task_atrasada",
        titulo,
        mensagem,
        link,
        referencia_id: null,
        lida: false,
        // Hash de idempotência via campo `link` + data: usamos created_at >= hoje 00:00
      });
    }
  }

  if (alertasParaInserir.length === 0) {
    return new Response(
      JSON.stringify({ success: true, alertas_criados: 0 }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Idempotência: evita duplicar se rodar 2x no mesmo dia.
  // Limpa notificações de task_atrasada criadas HOJE pra os mesmos users antes de inserir novas.
  const userIdsUnique = [...new Set(alertasParaInserir.map((a) => a.user_id))];
  const hojeInicio = new Date();
  hojeInicio.setHours(0, 0, 0, 0);
  await supabase
    .from("system_notifications")
    .delete()
    .eq("tipo", "task_atrasada")
    .gte("created_at", hojeInicio.toISOString())
    .in("user_id", userIdsUnique);

  const { error: insertErr, data: inserted } = await supabase
    .from("system_notifications")
    .insert(alertasParaInserir)
    .select("id");

  if (insertErr) throw insertErr;

  return new Response(
    JSON.stringify({
      success: true,
      data: hoje,
      alertas_criados: inserted?.length ?? 0,
      operadoras_afetadas: porDono.size,
      tasks_total: tasks.length,
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
