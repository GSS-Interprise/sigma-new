// Alertas do SLA de laudos (radiologia GSS). Cron a cada 5 min com {"acao": "coletor"}; só service_role chama.
//   coletor — sem leitura "ok" da estação há mais de 15 min: abre uma queda e avisa por e-mail; quando volta, fecha e avisa.
// Os alertas para o médico (80% / 100% do prazo) entram aqui depois (docs/arquitetura/sla-laudos-radiologia.md).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const UNIDADES = ["marieta"];
const LIMITE_MIN = 15;

function ehServiceRole(auth: string) {
  try {
    const p = JSON.parse(atob(auth.replace(/^Bearer\s+/i, "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return p?.role === "service_role";
  } catch {
    return false;
  }
}

// Motivo legível a partir da última leitura recebida (qualquer status).
function motivoQueda(ultima: { status: string; detalhe: any; lida_em: string } | null, minutosSemNada: number | null) {
  if (!ultima || (minutosSemNada !== null && minutosSemNada > LIMITE_MIN)) {
    return "A estação parou de mandar leituras: PC desligado ou em suspensão, internet/túnel caído ou a tarefa do coletor parou.";
  }
  const m = ultima.detalhe?.motivo;
  if (m === "pacs_fechado") return "O Vue PACS está fechado na estação.";
  if (m === "tela_indisponivel") return "A tela da estação está bloqueada ou a sessão do usuário caiu.";
  if (ultima.status === "sem_grade") return "O PACS está aberto, mas a lista não aparece: outra janela por cima, outra pasta ou a VPN caiu.";
  return `Última leitura com status "${ultima.status}".`;
}

async function emailar(titulo: string, corpo: string) {
  const resend = Deno.env.get("RESEND_API_KEY");
  const para = (Deno.env.get("SLA_ALERTA_EMAILS") || Deno.env.get("MONITOR_WHATSAPP_EMAILS") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  if (!resend || !para.length) return false;
  const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${resend}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Sigma GSS <avisos@gestaoservicosaude.com.br>", to: para, subject: titulo,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px"><p><b>${esc(titulo)}</b></p>`
        + `<p style="white-space:pre-line">${esc(corpo)}</p>`
        + `<p style="color:#9ca3af;font-size:12px">Coletor de SLA de laudos. O aviso sai quando a leitura para e quando volta.</p></div>`,
      tags: [{ name: "origem", value: "sla_coletor" }],
    }),
  }).catch(() => null);
  return !!r?.ok;
}

const hora = (iso: string | null) => iso
  ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "nunca";

async function checarColetor(admin: any, unidades = UNIDADES) {
  const res: unknown[] = [];
  for (const unidade of unidades) {
    const { data: ok } = await admin.from("sla_leituras").select("lida_em").eq("unidade", unidade).eq("status", "ok")
      .order("lida_em", { ascending: false }).limit(1).maybeSingle();
    const { data: ultima } = await admin.from("sla_leituras").select("lida_em, status, detalhe").eq("unidade", unidade)
      .order("lida_em", { ascending: false }).limit(1).maybeSingle();
    const { data: aberta } = await admin.from("sla_coletor_quedas").select("id, aberta_em").eq("unidade", unidade)
      .is("fechada_em", null).maybeSingle();

    const minOk = ok ? (Date.now() - new Date(ok.lida_em).getTime()) / 60000 : null;
    const minNada = ultima ? (Date.now() - new Date(ultima.lida_em).getTime()) / 60000 : null;
    const parado = minOk === null || minOk > LIMITE_MIN;

    if (parado && !aberta) {
      const motivo = motivoQueda(ultima, minNada);
      await admin.from("sla_coletor_quedas").insert({ unidade, ultima_ok_em: ok?.lida_em ?? null, motivo });
      const email = await emailar(`SLA de laudos: coletor parado (${unidade})`,
        `Ninguém está lendo a fila de laudos desde ${hora(ok?.lida_em ?? null)}.\n${motivo}\n\nEnquanto não voltar, os alertas de prazo não saem.`);
      res.push({ unidade, evento: "caiu", email });
    } else if (!parado && aberta) {
      await admin.from("sla_coletor_quedas").update({ fechada_em: new Date().toISOString() }).eq("id", aberta.id);
      const min = Math.round((Date.now() - new Date(aberta.aberta_em).getTime()) / 60000);
      const email = await emailar(`SLA de laudos: coletor voltou (${unidade})`,
        `A leitura da fila voltou às ${hora(ok!.lida_em)}. Ficou parada cerca de ${min + LIMITE_MIN} min.`);
      res.push({ unidade, evento: "voltou", email });
    } else {
      res.push({ unidade, parado, min_desde_ok: minOk === null ? null : Math.round(minOk) });
    }
  }
  return res;
}

Deno.serve(async (req) => {
  if (!ehServiceRole(req.headers.get("Authorization") || "")) return json({ ok: false, error: "sem_permissao" }, 401);
  const body = await req.json().catch(() => ({}));
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    // body.unidades só para teste manual (ex.: ["teste"]); o cron não manda.
    if (body.acao === "coletor") return json({ ok: true, coletor: await checarColetor(admin, Array.isArray(body.unidades) ? body.unidades.map(String) : UNIDADES) });
    return json({ ok: false, error: "acao" }, 400);
  } catch (e) {
    console.error("[sla-alertas]", e);
    return json({ ok: false, error: String((e as Error).message || e) }, 500);
  }
});
