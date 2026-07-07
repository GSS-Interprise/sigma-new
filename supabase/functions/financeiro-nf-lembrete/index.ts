// Lembretes de NF (cron diário). Médicos "desligados" esquecem de enviar a NF; a
// partir da solicitação (dia 20), reenvia um lembrete a cada ~48h (teto 3) pra quem
// ainda não enviou, e cria uma notificação in-app pra equipe do financeiro com quem
// está pendente (pra cobrarem no WhatsApp).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TETO_LEMBRETES = 3;
const HORAS_ENTRE = 48;
const fmtBRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

serve(async () => {
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });

  try {
    const { data: cfgRows } = await supabase.from("config_lista_items").select("valor").eq("campo_nome", "financeiro_nf_reply_domain").maybeSingle();
    const replyDomain = (cfgRows?.valor as string) || "nf.gestaoservicosaude.com.br";

    // pendentes: solicitada, ainda não recebida, com teto de lembretes
    const { data: pend } = await supabase.from("financeiro_pagamentos")
      .select("id, profissional_nome, medico_id, mes_referencia, ano_referencia, unidade, valor_total, nf_lembretes, nf_solicitada_em, nf_ultimo_lembrete_em")
      .eq("nf_status", "solicitada")
      .lt("nf_lembretes", TETO_LEMBRETES);

    const cutoff = Date.now() - HORAS_ENTRE * 3600 * 1000;
    const devidos = (pend ?? []).filter((p) => {
      const ref = p.nf_ultimo_lembrete_em || p.nf_solicitada_em;
      return ref ? new Date(ref).getTime() <= cutoff : true;
    });

    let enviados = 0;
    for (const p of devidos) {
      if (!p.medico_id) continue;
      const { data: med } = await supabase.from("medicos").select("email").eq("id", p.medico_id).maybeSingle();
      if (!med?.email) continue;
      const compExt = `${MESES[p.mes_referencia - 1] ?? p.mes_referencia}/${p.ano_referencia}`;
      const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1b3a5b;line-height:1.6">
        <p>Olá, Dr(a). <b>${p.profissional_nome}</b>,</p>
        <p>Este é um <b>lembrete</b>: ainda estamos aguardando a sua nota fiscal referente à produção de <b>${compExt}</b>${p.unidade ? ` (${p.unidade})` : ""}, no valor de <b>${fmtBRL(Number(p.valor_total))}</b>.</p>
        <p>Basta <b>responder este email anexando a NF em PDF</b>. Se já enviou, pode desconsiderar.</p>
        <p style="color:#5a6b7b;font-size:12px">GSS Saúde · Financeiro</p></div>`;
      const { error: ee } = await supabase.functions.invoke("send-email-resend", {
        body: {
          to: med.email, from: "GSS Saúde Financeiro <financeiro@gestaoservicosaude.com.br>",
          subject: `Lembrete: emissão da NF pendente — ${compExt}`,
          html, reply_to: `nf+${p.id}@${replyDomain}`,
        },
      });
      if (ee) continue;
      await supabase.from("financeiro_pagamentos")
        .update({ nf_lembretes: (p.nf_lembretes ?? 0) + 1, nf_ultimo_lembrete_em: new Date().toISOString() })
        .eq("id", p.id);
      enviados++;
    }

    // notifica a equipe do financeiro com o total pendente (de-dup do dia)
    const { count: totalPend } = await supabase.from("financeiro_pagamentos")
      .select("id", { count: "exact", head: true }).eq("nf_status", "solicitada");
    let notificados = 0;
    if ((totalPend ?? 0) > 0) {
      const { data: roles } = await supabase.from("user_roles").select("user_id").in("role", ["gestor_financeiro", "diretoria"]);
      const userIds = [...new Set((roles ?? []).map((r) => r.user_id))];
      const todayStart = new Date(); todayStart.setUTCHours(0, 0, 0, 0);
      await supabase.from("system_notifications").delete().eq("tipo", "financeiro_nf_pendente").gte("created_at", todayStart.toISOString());
      const rows = userIds.map((uid) => ({
        user_id: uid, tipo: "financeiro_nf_pendente",
        titulo: "NFs pendentes", mensagem: `${totalPend} médico(s) ainda não enviaram a NF.`,
        link: "/financeiro", lida: false,
      }));
      if (rows.length) { await supabase.from("system_notifications").insert(rows); notificados = rows.length; }
    }

    return json({ ok: true, devidos: devidos.length, lembretes_enviados: enviados, pendentes_total: totalPend ?? 0, equipe_notificada: notificados });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) });
  }
});
