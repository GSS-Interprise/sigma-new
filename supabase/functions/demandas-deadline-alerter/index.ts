import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

/**
 * Cron diário (8h America/Sao_Paulo).
 * Procura demandas (worklist_tarefas, modulo=demandas) com data_limite em:
 *   - vence hoje
 *   - vence em 1 dia
 *   - vence em 2 dias
 *   - atrasadas (data_limite < hoje)
 * Para cada usuário envolvido (criador + responsavel + finalizadores) emite UMA
 * notificação consolidada via system_notifications. Idempotência: limpa as
 * notifs do tipo "demanda_prazo_digest" criadas hoje antes de inserir.
 *
 * Observação: envio de email exige domínio configurado em Lovable Emails.
 * Quando o domínio estiver pronto, basta plugar uma chamada à
 * supabase.functions.invoke("send-transactional-email", ...) no loop final.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface DemandaRow {
  id: string;
  titulo: string;
  data_limite: string;
  created_by: string | null;
  responsavel_id: string | null;
}

function diasAteHoje(dataLimite: string): number {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const d = new Date(dataLimite + "T00:00:00");
  return Math.round((d.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24));
}

function bucketLabel(dias: number): string {
  if (dias < 0) return `Atrasadas (${Math.abs(dias)} dia${Math.abs(dias) === 1 ? "" : "s"})`;
  if (dias === 0) return "Vence hoje";
  if (dias === 1) return "Vence em 1 dia";
  return `Vence em ${dias} dias`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const em2dias = new Date(hoje);
    em2dias.setDate(em2dias.getDate() + 2);

    // Demandas ainda não concluídas, com data_limite ≤ hoje+2
    const { data: rows, error } = await supabase
      .from("worklist_tarefas")
      .select("id, titulo, data_limite, created_by, responsavel_id, status, modulo")
      .eq("modulo", "demandas")
      .neq("status", "concluida")
      .not("data_limite", "is", null)
      .lte("data_limite", em2dias.toISOString().slice(0, 10));

    if (error) throw error;

    const demandas = (rows ?? []) as DemandaRow[];
    if (demandas.length === 0) {
      return new Response(
        JSON.stringify({ success: true, alertas: 0, mensagem: "Nenhuma demanda em alerta" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Finalizadores por demanda
    const ids = demandas.map((d) => d.id);
    const { data: fins } = await supabase
      .from("worklist_tarefa_finalizadores")
      .select("tarefa_id, user_id")
      .in("tarefa_id", ids);
    const finByTarefa = new Map<string, string[]>();
    (fins ?? []).forEach((f: any) => {
      const arr = finByTarefa.get(f.tarefa_id) ?? [];
      arr.push(f.user_id);
      finByTarefa.set(f.tarefa_id, arr);
    });

    // Agrupar por usuário envolvido
    interface DemandaPorUser {
      titulo: string;
      dias: number;
      id: string;
    }
    const porUser = new Map<string, DemandaPorUser[]>();
    for (const d of demandas) {
      const envolvidos = new Set<string>();
      if (d.created_by) envolvidos.add(d.created_by);
      if (d.responsavel_id) envolvidos.add(d.responsavel_id);
      (finByTarefa.get(d.id) ?? []).forEach((u) => envolvidos.add(u));
      const dias = diasAteHoje(d.data_limite);
      envolvidos.forEach((uid) => {
        const arr = porUser.get(uid) ?? [];
        arr.push({ titulo: d.titulo, dias, id: d.id });
        porUser.set(uid, arr);
      });
    }

    // Idempotência: limpa notifs do tipo gerada hoje
    const inicioDia = new Date();
    inicioDia.setHours(0, 0, 0, 0);
    const userIds = Array.from(porUser.keys());
    if (userIds.length) {
      await supabase
        .from("system_notifications")
        .delete()
        .eq("tipo", "demanda_prazo_digest")
        .gte("created_at", inicioDia.toISOString())
        .in("user_id", userIds);
    }

    // Cria notifs consolidadas
    const notifs: any[] = [];
    for (const [uid, lista] of porUser) {
      const buckets = new Map<string, DemandaPorUser[]>();
      lista.forEach((d) => {
        const label = bucketLabel(d.dias);
        const arr = buckets.get(label) ?? [];
        arr.push(d);
        buckets.set(label, arr);
      });
      const linhas: string[] = [];
      buckets.forEach((arr, label) => {
        linhas.push(`${label}: ${arr.map((d) => d.titulo).join(", ")}`);
      });
      const totalAtrasadas = lista.filter((d) => d.dias < 0).length;
      const titulo = totalAtrasadas > 0
        ? `⚠️ ${totalAtrasadas} demanda(s) atrasada(s) + ${lista.length - totalAtrasadas} próxima(s)`
        : `Você tem ${lista.length} demanda(s) próxima(s) do prazo`;
      notifs.push({
        user_id: uid,
        tipo: "demanda_prazo_digest",
        titulo,
        mensagem: linhas.join(" · ").slice(0, 500),
        link: "/demandas",
        referencia_id: null,
      });
    }

    let inseridas = 0;
    if (notifs.length) {
      const { error: insErr, data: ins } = await supabase
        .from("system_notifications")
        .insert(notifs)
        .select("id");
      if (insErr) throw insErr;
      inseridas = ins?.length ?? 0;
    }

    return new Response(
      JSON.stringify({
        success: true,
        demandas: demandas.length,
        usuarios_afetados: userIds.length,
        notificacoes: inseridas,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("[demandas-deadline-alerter]", err);
    return new Response(
      JSON.stringify({ success: false, error: err?.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});