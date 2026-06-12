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
 * notificação consolidada via system_notifications + UM email via Resend.
 * Idempotência: limpa as notifs do tipo "demanda_prazo_digest" criadas hoje
 * antes de inserir.
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

    // Envio de emails via Resend (paralelo, sem quebrar o cron em caso de falha)
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, email, nome_completo")
      .in("id", userIds);
    const profById = new Map<string, { email: string | null; nome_completo: string | null }>();
    (profs ?? []).forEach((p: any) =>
      profById.set(p.id, { email: p.email, nome_completo: p.nome_completo }),
    );

    const APP_URL = Deno.env.get("APP_URL") ?? "https://sigma-gss.lovable.app";
    let emailsEnviados = 0;
    let emailsFalha = 0;

    await Promise.all(
      Array.from(porUser.entries()).map(async ([uid, lista]) => {
        const prof = profById.get(uid);
        if (!prof?.email) return;

        const atrasadas = lista.filter((d) => d.dias < 0);
        const hoje = lista.filter((d) => d.dias === 0);
        const em1 = lista.filter((d) => d.dias === 1);
        const em2 = lista.filter((d) => d.dias === 2);

        const section = (label: string, arr: typeof lista, cor: string) =>
          arr.length === 0
            ? ""
            : `<h3 style="color:${cor};margin:20px 0 8px;font-size:15px">${label} (${arr.length})</h3>
               <ul style="margin:0;padding-left:20px;color:#222">
                 ${arr.map((d) => `<li style="margin:4px 0">${escapeHtml(d.titulo)}</li>`).join("")}
               </ul>`;

        const subject = atrasadas.length > 0
          ? `⚠️ ${atrasadas.length} demanda(s) atrasada(s) — Sigma GSS`
          : `Você tem ${lista.length} demanda(s) próxima(s) do prazo`;

        const html = `
          <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#fff;color:#222">
            <h2 style="margin:0 0 4px;font-size:20px">Olá, ${escapeHtml(prof.nome_completo ?? "")}</h2>
            <p style="margin:0 0 16px;color:#555">Resumo das suas demandas no Sigma:</p>
            ${section("🔴 Atrasadas", atrasadas, "#b91c1c")}
            ${section("🟠 Vencem hoje", hoje, "#c2410c")}
            ${section("🟡 Vencem em 1 dia", em1, "#a16207")}
            ${section("🟢 Vencem em 2 dias", em2, "#15803d")}
            <div style="margin-top:28px">
              <a href="${APP_URL}/demandas" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Abrir Demandas</a>
            </div>
            <hr style="margin:32px 0 12px;border:none;border-top:1px solid #e5e7eb"/>
            <p style="color:#888;font-size:12px;margin:0">Email automático do Sigma GSS · ${new Date().toLocaleDateString("pt-BR")}</p>
          </div>`;

        try {
          const { error: mailErr } = await supabase.functions.invoke("send-email-resend", {
            body: { to: prof.email, subject, html },
          });
          if (mailErr) throw mailErr;
          emailsEnviados++;
        } catch (e) {
          console.error("[alerter] falha email", prof.email, e);
          emailsFalha++;
        }
      }),
    );

    return new Response(
      JSON.stringify({
        success: true,
        demandas: demandas.length,
        usuarios_afetados: userIds.length,
        notificacoes: inseridas,
        emails_enviados: emailsEnviados,
        emails_falha: emailsFalha,
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}