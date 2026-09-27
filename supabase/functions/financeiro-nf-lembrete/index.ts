// Cobrança automática de NF (cron diário, jobid 30). Quem teve a nota pedida e não mandou
// recebe a cobrança a cada 48h, no máximo 3 vezes — PELO MESMO CANAL em que foi pedida:
// pedido por WhatsApp é cobrado pelo WhatsApp oficial (template de cobrança aprovado),
// pedido por e-mail é cobrado por e-mail.
//
// Até 27/09 esta função só cobrava por e-mail, com texto próprio. Agora ela só decide
// QUEM cobrar; o envio passa por financeiro-nf-enviar (tipo=lembrete), que já registra
// cada tentativa, o id da mensagem e o erro — a mesma trilha do pedido.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TETO_COBRANCAS = 3;
const HORAS_ENTRE = 48;

serve(async () => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceRole);
  const json = (o: unknown) => new Response(JSON.stringify(o), { headers: { "Content-Type": "application/json" } });

  try {
    const { data: pend } = await svc.from("financeiro_pagamentos")
      .select("id, nf_lembretes, nf_solicitada_em, nf_ultimo_lembrete_em")
      .eq("nf_status", "solicitada")
      .lt("nf_lembretes", TETO_COBRANCAS);

    const corte = Date.now() - HORAS_ENTRE * 3600 * 1000;
    const devidos = (pend ?? []).filter((p: any) => {
      const ref = p.nf_ultimo_lembrete_em || p.nf_solicitada_em;
      return ref ? new Date(ref).getTime() <= corte : false;
    });

    // canal do último pedido real (teste não conta) de cada pagamento
    const porCanal: Record<string, string[]> = { email: [], whatsapp: [] };
    for (const p of devidos) {
      const { data: ult } = await svc.from("financeiro_nf_solicitacoes")
        .select("canal").eq("pagamento_id", p.id).eq("teste", false)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      porCanal[ult?.canal === "whatsapp" ? "whatsapp" : "email"].push(p.id);
    }

    const resultado: Record<string, unknown> = {};
    for (const [canal, ids] of Object.entries(porCanal)) {
      if (!ids.length) continue;
      const r = await fetch(`${supabaseUrl}/functions/v1/financeiro-nf-enviar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceRole}`, apikey: serviceRole, "Content-Type": "application/json" },
        body: JSON.stringify({ pagamento_ids: ids, canal, tipo: "lembrete" }),
      });
      const corpo = await r.json().catch(() => ({}));
      resultado[canal] = { cobrados: corpo.enviados ?? 0, erros: corpo.erros ?? 0, sem_contato: corpo.sem_contato ?? 0 };
    }

    // resumo diário para a equipe: quantos ainda não mandaram (um aviso por dia)
    const { count: totalPend } = await svc.from("financeiro_pagamentos")
      .select("id", { count: "exact", head: true }).eq("nf_status", "solicitada");
    if ((totalPend ?? 0) > 0) {
      const { data: roles } = await svc.from("user_roles").select("user_id").in("role", ["gestor_financeiro", "diretoria"]);
      const userIds = [...new Set((roles ?? []).map((r: any) => r.user_id))];
      const hoje = new Date(); hoje.setUTCHours(0, 0, 0, 0);
      await svc.from("system_notifications").delete().eq("tipo", "financeiro_nf_pendente").gte("created_at", hoje.toISOString());
      if (userIds.length) {
        await svc.from("system_notifications").insert(userIds.map((uid) => ({
          user_id: uid, tipo: "financeiro_nf_pendente", titulo: "Notas fiscais pendentes",
          mensagem: `${totalPend} médico(s) ainda não enviaram a nota fiscal.`, link: "/financeiro", lida: false,
        })));
      }
    }

    return json({ ok: true, devidos: devidos.length, por_canal: resultado, pendentes_total: totalPend ?? 0 });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) });
  }
});
