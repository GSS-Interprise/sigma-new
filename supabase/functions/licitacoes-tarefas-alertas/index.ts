import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Avisos das tarefas do edital (T5 de docs/arquitetura/licitacoes-contratos-gss.md).
// Roda a cada 10 min pelo pg_cron. Para cada tarefa aberta que vence nos próximos 7 dias, avisa o
// responsável e quem criou, na antecedência escolhida por cada pessoa (padrão 1 dia e 1 hora,
// como o Trello fazia): notificação no sino do Sigma e e-mail.
// Quem chama: cron (x-internal-sync-key), service role, ou admin logado (teste manual com dry_run).

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-sync-key" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PADRAO_MIN = [1440, 60];
const JANELA_DIAS = 7;
const ROTULO: Record<string, string> = {
  esclarecimento_impugnacao: "Esclarecimento/Impugnação", recurso: "Recurso", contrarrazao: "Contrarrazão",
  mandado_seguranca: "Mandado de segurança", envio_documentos: "Envio de documentos", deliberacao: "Deliberação",
};
const rotulo = (t: any) => {
  const base = t.tipo === "personalizada" ? (t.titulo?.trim() || "Tarefa") : (ROTULO[t.tipo] ?? "Tarefa");
  return t.tipo !== "personalizada" && t.titulo?.trim() ? `${base} — ${t.titulo.trim()}` : base;
};

// "hoje às 14:00 (em 1 hora)", "amanhã às 09:00", "16/10 às 14:00"
function quando(dataHora: Date, agora: Date) {
  const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", ...o }).format(d);
  const dia = (d: Date) => fmt(d, { year: "numeric", month: "2-digit", day: "2-digit" });
  const hora = fmt(dataHora, { hour: "2-digit", minute: "2-digit" });
  const faltaMin = Math.round((dataHora.getTime() - agora.getTime()) / 60000);
  const falta = faltaMin < 60 ? `em ${faltaMin} min` : faltaMin < 24 * 60 ? `em ${Math.round(faltaMin / 60)} h` : null;
  const amanha = new Date(agora.getTime() + 864e5);
  if (dia(dataHora) === dia(agora)) return `hoje às ${hora}${falta ? ` (${falta})` : ""}`;
  if (dia(dataHora) === dia(amanha)) return `amanhã às ${hora}`;
  return `${fmt(dataHora, { day: "2-digit", month: "2-digit" })} às ${hora}`;
}

const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const svc = createClient(supabaseUrl, serviceKey);

  // ── quem pode chamar (nunca confiar no "role" decodificado do JWT) ──
  const auth = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const chaveInterna = Deno.env.get("TWILIO_INTERNAL_SYNC_KEY") || "";
  let permitido = (!!chaveInterna && req.headers.get("x-internal-sync-key") === chaveInterna) || (!!auth && auth === serviceKey);
  if (!permitido && auth) {
    const prova = createClient(supabaseUrl, auth, { auth: { persistSession: false } });
    const { data, error } = await prova.from("integracao_segredos").select("nome").limit(1);
    permitido = !error && Array.isArray(data);
  }
  if (!permitido && auth) {
    const u = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await u.auth.getUser(auth);
    if (user) {
      const { data: papeis } = await svc.from("user_roles").select("role").eq("user_id", user.id);
      permitido = (papeis ?? []).some((p: any) => p.role === "admin");
    }
  }
  if (!permitido) return json({ ok: false, error: "sem_permissao" }, 403);

  const input = await req.json().catch(() => ({}));
  const dryRun = !!input.dry_run;
  const agora = new Date();

  try {
    const { data: tarefas, error } = await svc.from("licitacao_tarefas")
      .select("id, licitacao_id, tipo, titulo, data_hora, responsavel_id, created_by, created_at, avisos_min, licitacoes!inner(titulo, numero_edital, orgao)")
      .is("concluida_em", null)
      .gt("data_hora", agora.toISOString())
      .lte("data_hora", new Date(agora.getTime() + JANELA_DIAS * 864e5).toISOString());
    if (error) throw error;
    if (!tarefas?.length) return json({ ok: true, tarefas: 0, avisos: 0 });

    const pessoas = new Set<string>();
    for (const t of tarefas) { if (t.responsavel_id) pessoas.add(t.responsavel_id); if (t.created_by) pessoas.add(t.created_by); }
    const ids = [...pessoas];
    const [{ data: prefs }, { data: perfis }, { data: enviados }] = await Promise.all([
      svc.from("licitacoes_preferencias").select("user_id, avisos_min, aviso_email").in("user_id", ids),
      svc.from("profiles").select("id, nome_completo, email").in("id", ids),
      svc.from("licitacao_tarefa_avisos").select("tarefa_id, user_id, antecedencia_min").in("tarefa_id", tarefas.map((t) => t.id)),
    ]);
    const prefDe = new Map((prefs ?? []).map((p: any) => [p.user_id, p]));
    const perfilDe = new Map((perfis ?? []).map((p: any) => [p.id, p]));
    const jaFoi = new Set((enviados ?? []).map((e: any) => `${e.tarefa_id}|${e.user_id}|${e.antecedencia_min}`));

    const resendKey = Deno.env.get("RESEND_API_KEY");
    // domínio principal da GSS, verificado no Resend (o financeiro envia por ele). Os secrets
    // RESEND_FROM* deste projeto não trazem um endereço utilizável.
    const de = "Sigma GSS <avisos@gestaoservicosaude.com.br>";
    const site = "https://sigma-gss.lovable.app";
    const relatorio: any[] = [];

    for (const t of tarefas as any[]) {
      const vence = new Date(t.data_hora);
      const criada = new Date(t.created_at);
      const destinatarios = new Set<string>([t.responsavel_id, t.created_by].filter(Boolean));
      for (const uid of destinatarios) {
        const pref = prefDe.get(uid);
        const leads: number[] = (t.avisos_min?.length ? t.avisos_min : pref?.avisos_min?.length ? pref.avisos_min : PADRAO_MIN)
          .map(Number).filter((n: number) => n > 0);
        // antecedências cujo momento já chegou e ainda não foram avisadas
        const vencidas = leads.filter((l) => agora.getTime() >= vence.getTime() - l * 60000 && !jaFoi.has(`${t.id}|${uid}|${l}`));
        if (!vencidas.length) continue;
        const menor = Math.min(...vencidas);
        // quem acabou de criar a tarefa já dentro da janela não precisa ser avisado do que fez
        const silencioso = uid === t.created_by && criada.getTime() >= vence.getTime() - menor * 60000 && agora.getTime() - criada.getTime() < 15 * 60000;

        const card = t.licitacoes?.titulo || t.licitacoes?.numero_edital || "Edital";
        const nome = rotulo(t);
        const q = quando(vence, agora);
        const perfil = perfilDe.get(uid);
        const querEmail = (pref?.aviso_email ?? true) && !!perfil?.email && !!resendKey && !!de;
        const linha: any = { tarefa: t.id, uid, antecedencias: vencidas, silencioso, email: querEmail && !silencioso };
        relatorio.push(linha);
        if (dryRun) continue;

        let emailOk = false;
        if (!silencioso) {
          await svc.from("system_notifications").insert({
            user_id: uid, tipo: "licitacao_tarefa", titulo: `⏰ ${nome} ${q}`, mensagem: card,
            link: `/licitacoes?open=${t.licitacao_id}`, referencia_id: t.id,
          });
          if (querEmail) {
            const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937;max-width:560px">
<p>Olá, ${esc((perfil.nome_completo || "").split(" ")[0])}.</p>
<p><b>${esc(nome)}</b> vence <b>${esc(q)}</b>.</p>
<p style="margin:0 0 4px;color:#6b7280">Edital</p><p style="margin:0 0 16px">${esc(card)}${t.licitacoes?.orgao ? `<br><span style="color:#6b7280">${esc(t.licitacoes.orgao)}</span>` : ""}</p>
<p><a href="${site}/licitacoes?open=${t.licitacao_id}" style="background:#166534;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">Abrir no Sigma</a></p>
<p style="color:#9ca3af;font-size:12px">Você recebe este aviso porque é responsável ou criou a tarefa. A antecedência dos avisos se ajusta no Sigma, em Licitações › tarefas do card › Meus avisos.</p></div>`;
            const r = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ from: de, to: [perfil.email], subject: `${nome} ${q} · ${card}`.slice(0, 180), html, tags: [{ name: "origem", value: "licitacao_tarefa" }] }),
            });
            emailOk = r.ok;
            if (!r.ok) { linha.erro_email = `${r.status} ${(await r.text()).slice(0, 300)}`; console.error("resend", linha.erro_email); }
          }
        }
        const { error: e2 } = await svc.from("licitacao_tarefa_avisos").upsert(
          vencidas.map((l) => ({ tarefa_id: t.id, user_id: uid, antecedencia_min: l, email_enviado: emailOk })),
          { onConflict: "tarefa_id,user_id,antecedencia_min", ignoreDuplicates: true },
        );
        if (e2) console.error("avisos", e2.message);
      }
    }
    return json({ ok: true, dry_run: dryRun, tarefas: tarefas.length, avisos: relatorio.length, relatorio: relatorio.slice(0, 50) });
  } catch (e: any) {
    console.error(e);
    return json({ ok: false, error: e?.message || String(e) }, 500);
  }
});
