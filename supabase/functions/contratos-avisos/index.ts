import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Avisos de contrato (T9 de docs/arquitetura/licitacoes-contratos-gss.md): contrato assinado e
// início do serviço (hora de faturar). O gatilho do banco põe o evento em contrato_avisos; este
// robô (cron a cada 10 min, só quando há pendente) avisa no sino e por e-mail quem estiver em
// vencimentos_config (contrato_assinado / contrato_inicio_servico) e marca como enviado.
// Quem chama: cron (x-internal-sync-key), service role, ou admin logado (teste com dry_run).

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-sync-key" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const brl = (v: number | null) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const SITE = "https://sigma-gss.lovable.app";
const DE = "Sigma GSS <avisos@gestaoservicosaude.com.br>";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey);

  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const chaveInterna = Deno.env.get("TWILIO_INTERNAL_SYNC_KEY") || "";
  let permitido = (!!chaveInterna && req.headers.get("x-internal-sync-key") === chaveInterna) || (!!auth && auth === serviceKey);
  if (!permitido && auth) {
    const { data, error } = await createClient(supabaseUrl, auth, { auth: { persistSession: false } }).from("integracao_segredos").select("nome").limit(1);
    permitido = !error && Array.isArray(data);
  }
  if (!permitido && auth) {
    const { data: { user } } = await createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!).auth.getUser(auth);
    if (user) {
      const { data: papeis } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      permitido = (papeis ?? []).some((p: any) => p.role === "admin");
    }
  }
  if (!permitido) return json({ ok: false, error: "sem_permissao" }, 403);
  const dryRun = !!(await req.json().catch(() => ({}))).dry_run;

  try {
    const { data: pend } = await svc.from("contrato_avisos").select("id, contrato_id, evento").is("enviado_em", null).order("criado_em").limit(50);
    if (!pend?.length) return json({ ok: true, avisos: 0 });
    const { data: cfgs } = await svc.from("vencimentos_config").select("*").in("chave", ["contrato_assinado", "contrato_inicio_servico"]);
    const { data: contratos } = await svc.from("contratos")
      .select("id, codigo_interno, codigo_contrato, objeto_contrato, valor_estimado, data_inicio, servico_iniciado_em, cliente_id, clientes(nome_fantasia, razao_social)")
      .in("id", pend.map((p) => p.contrato_id));
    const ids = [...new Set((cfgs ?? []).flatMap((c: any) => c.destinatarios ?? []))];
    const { data: perfis } = ids.length ? await svc.from("profiles").select("id, nome_completo, email").in("id", ids) : { data: [] as any[] };
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const relatorio: any[] = [];

    for (const p of pend) {
      const c: any = (contratos ?? []).find((x: any) => x.id === p.contrato_id);
      const cfg: any = (cfgs ?? []).find((x: any) => x.chave === (p.evento === "assinado" ? "contrato_assinado" : "contrato_inicio_servico"));
      const cliente = c?.clientes?.nome_fantasia || c?.clientes?.razao_social || "Cliente";
      const num = c?.codigo_interno ? `#${c.codigo_interno}` : "";
      const titulo = p.evento === "assinado"
        ? `✍️ Contrato ${num} assinado · ${cliente}`
        : `▶️ Serviço iniciado: contrato ${num} · ${cliente} (hora de faturar)`;
      const linhas = [
        ["Contrato", `${num} ${c?.codigo_contrato ?? ""}`.trim()], ["Cliente", cliente], ["Objeto", (c?.objeto_contrato ?? "").slice(0, 300)],
        ["Valor estimado", brl(c?.valor_estimado)], ["Início do contrato", c?.data_inicio ? c.data_inicio.split("-").reverse().join("/") : "—"],
        ...(p.evento === "inicio_servico" ? [["Serviço iniciado em", c?.servico_iniciado_em ? c.servico_iniciado_em.split("-").reverse().join("/") : "—"]] : []),
      ];
      const destinatarios: string[] = cfg?.destinatarios ?? [];
      relatorio.push({ aviso: p.id, evento: p.evento, contrato: num, destinatarios: destinatarios.length });
      if (dryRun) continue;
      for (const uid of destinatarios) {
        await svc.from("system_notifications").insert({ user_id: uid, tipo: `contrato_${p.evento}`, titulo, mensagem: (c?.objeto_contrato ?? "").slice(0, 160), link: "/contratos", referencia_id: p.contrato_id });
        const perfil = (perfis ?? []).find((x: any) => x.id === uid);
        if (cfg?.aviso_email !== false && perfil?.email && resendKey) {
          const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:600px">
<p>Olá, ${esc((perfil.nome_completo || "").split(" ")[0])}.</p><p><b>${esc(titulo.replace(/^\S+\s/, ""))}</b></p>
<table style="border-collapse:collapse;font-size:13px">${linhas.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#6b7280">${esc(k)}</td><td style="padding:4px 0">${esc(String(v))}</td></tr>`).join("")}</table>
<p style="margin-top:16px"><a href="${SITE}/contratos" style="background:#166534;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir no Sigma</a></p>
<p style="color:#9ca3af;font-size:12px">Quem recebe este aviso se ajusta no Sigma, em Clientes e Contratos › Avisos de contrato.</p></div>`;
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ from: DE, to: [perfil.email], subject: titulo.replace(/^\S+\s/, ""), html, tags: [{ name: "origem", value: "contrato_aviso" }] }),
          });
          if (!r.ok) relatorio[relatorio.length - 1].erro_email = `${r.status} ${(await r.text()).slice(0, 160)}`;
        }
      }
      await svc.from("contrato_avisos").update({ enviado_em: new Date().toISOString() }).eq("id", p.id);
    }
    return json({ ok: true, dry_run: dryRun, avisos: relatorio.length, relatorio });
  } catch (e: any) {
    console.error(e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
