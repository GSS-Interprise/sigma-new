import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Vencimento de documentos (T10 e T13 de docs/arquitetura/licitacoes-contratos-gss.md).
// Roda 1x por dia (08:00 de Brasília) pelo pg_cron. Certidões da empresa (empresa_documentos,
// só a versão vigente) e documentos dos médicos (medico_documentos.data_validade). Cada documento
// avisa uma vez por marco (30, 15, 7, 1 dia antes, e vencido), e cada pessoa recebe um resumo só
// por dia, no sino e por e-mail. Antecedência e destinatários vêm de vencimentos_config.
// Quem chama: cron (x-internal-sync-key), service role, ou admin logado (teste com dry_run).

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-sync-key" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const SITE = "https://sigma-gss.lovable.app";
const DE = "Sigma GSS <avisos@gestaoservicosaude.com.br>";

// data de hoje em Brasília (YYYY-MM-DD) e diferença em dias entre datas sem hora
const hojeBr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 864e5);
const dataBr = (d: string) => d.split("-").reverse().join("/");

type Item = { origem: string; id: string; titulo: string; detalhe: string; validade: string; resta: number; marco: number };

// marco atingido: vencido (-1) ou o menor "dias antes" que já chegou
function marcoDe(resta: number, dias: number[]) {
  if (resta < 0) return -1;
  const cabem = dias.filter((d) => resta <= d);
  return cabem.length ? Math.min(...cabem) : null;
}

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

  const input = await req.json().catch(() => ({}));
  const dryRun = !!input.dry_run;
  const hoje = hojeBr();

  try {
    const { data: configs } = await svc.from("vencimentos_config").select("*");
    const cfg = (k: string) => (configs ?? []).find((c: any) => c.chave === k);
    const { data: jaEnviados } = await svc.from("vencimento_avisos").select("origem, documento_id, marco");
    const foi = new Set((jaEnviados ?? []).map((a: any) => `${a.origem}|${a.documento_id}|${a.marco}`));
    const porPessoa = new Map<string, Item[]>();
    const enviar: { origem: string; documento_id: string; marco: number }[] = [];

    const coletar = (origem: string, docs: { id: string; titulo: string; detalhe: string; validade: string }[]) => {
      const c = cfg(origem);
      if (!c) return;
      const dias = (c.dias ?? []).map(Number).filter((n: number) => n > 0);
      for (const d of docs) {
        const resta = diasEntre(hoje, d.validade);
        const marco = marcoDe(resta, dias);
        if (marco == null || foi.has(`${origem}|${d.id}|${marco}`)) continue;
        // vencido há mais de 30 dias e nunca avisado (cadastro antigo): não inunda a caixa
        if (resta < -30) continue;
        enviar.push({ origem, documento_id: d.id, marco });
        for (const uid of c.destinatarios ?? []) {
          if (!porPessoa.has(uid)) porPessoa.set(uid, []);
          porPessoa.get(uid)!.push({ origem, ...d, resta, marco });
        }
      }
    };

    const maxEmp = Math.max(0, ...(cfg("empresa_documentos")?.dias ?? [30]));
    const limEmp = new Date(Date.parse(`${hoje}T12:00:00Z`) + maxEmp * 864e5).toISOString().slice(0, 10);
    const { data: emp } = await svc.from("empresa_documentos").select("id, tipo, nome, emissor, validade")
      .is("substituido_em", null).not("validade", "is", null).lte("validade", limEmp);
    coletar("empresa_documentos", (emp ?? []).map((d: any) => ({
      id: d.id, titulo: d.nome ? `${d.tipo} — ${d.nome}` : d.tipo, detalhe: d.emissor ? `Emissor: ${d.emissor}` : "Certidão / documento da GSS", validade: d.validade,
    })));

    const maxMed = Math.max(0, ...(cfg("medico_documentos")?.dias ?? [30]));
    const limMed = new Date(Date.parse(`${hoje}T12:00:00Z`) + maxMed * 864e5).toISOString().slice(0, 10);
    const { data: med } = await svc.from("medico_documentos").select("id, arquivo_nome, tipo_documento, data_validade, medicos(nome_completo)")
      .not("data_validade", "is", null).lte("data_validade", limMed).limit(2000);
    coletar("medico_documentos", (med ?? []).map((d: any) => ({
      id: d.id, titulo: `${d.medicos?.nome_completo ?? "Médico"} — ${String(d.tipo_documento).replace(/_/g, " ")}`, detalhe: d.arquivo_nome, validade: d.data_validade,
    })));

    const ids = [...porPessoa.keys()];
    const { data: perfis } = ids.length ? await svc.from("profiles").select("id, nome_completo, email").in("id", ids) : { data: [] as any[] };
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const relatorio: any[] = [];

    for (const [uid, itens] of porPessoa) {
      itens.sort((a, b) => a.resta - b.resta);
      const vencidos = itens.filter((i) => i.resta < 0).length;
      const titulo = vencidos ? `⚠️ ${vencidos} documento(s) vencido(s)${itens.length > vencidos ? ` e ${itens.length - vencidos} vencendo` : ""}` : `⏳ ${itens.length} documento(s) vencendo`;
      const perfil = (perfis ?? []).find((p: any) => p.id === uid);
      const querEmail = itens.some((i) => cfg(i.origem)?.aviso_email !== false) && !!perfil?.email && !!resendKey;
      relatorio.push({ uid, itens: itens.length, vencidos, email: querEmail });
      if (dryRun) continue;
      const temEmpresa = itens.some((i) => i.origem === "empresa_documentos");
      await svc.from("system_notifications").insert({
        user_id: uid, tipo: "documento_vencimento", titulo,
        mensagem: itens.slice(0, 4).map((i) => `${i.titulo} (${i.resta < 0 ? "venceu" : "vence"} ${dataBr(i.validade)})`).join(" · "),
        link: temEmpresa ? "/contratos?aba=documentos-empresa" : "/contratos?aba=vencimentos-medicos",
      });
      if (querEmail) {
        const linhas = itens.map((i) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(i.titulo)}<br><span style="color:#6b7280;font-size:12px">${esc(i.detalhe)}</span></td>
<td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;white-space:nowrap;color:${i.resta < 0 ? "#b91c1c" : i.resta <= 7 ? "#b45309" : "#1f2937"}">${i.resta < 0 ? `venceu em ${dataBr(i.validade)}` : i.resta === 0 ? "vence hoje" : `vence em ${dataBr(i.validade)} (${i.resta} dia${i.resta > 1 ? "s" : ""})`}</td></tr>`).join("");
        const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:620px">
<p>Olá, ${esc((perfil.nome_completo || "").split(" ")[0])}.</p><p>Documentos que precisam de atenção:</p>
<table style="border-collapse:collapse;width:100%;font-size:13px">${linhas}</table>
<p style="margin-top:16px"><a href="${SITE}/contratos?aba=${temEmpresa ? "documentos-empresa" : "vencimentos-medicos"}" style="background:#166534;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir no Sigma</a></p>
<p style="color:#9ca3af;font-size:12px">Ao renovar, anexe a nova versão no Sigma: o aviso para. Quem recebe e com quantos dias de antecedência se ajusta em Clientes e Contratos › Avisos.</p></div>`;
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST", headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: DE, to: [perfil.email], subject: titulo.replace(/^\S+\s/, ""), html, tags: [{ name: "origem", value: "vencimentos" }] }),
        });
        if (!r.ok) relatorio[relatorio.length - 1].erro_email = `${r.status} ${(await r.text()).slice(0, 200)}`;
      }
    }
    if (!dryRun && enviar.length) {
      const { error } = await svc.from("vencimento_avisos").upsert(enviar, { onConflict: "origem,documento_id,marco", ignoreDuplicates: true });
      if (error) console.error("avisos", error.message);
    }
    return json({ ok: true, dry_run: dryRun, hoje, documentos: enviar.length, pessoas: relatorio });
  } catch (e: any) {
    console.error(e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
