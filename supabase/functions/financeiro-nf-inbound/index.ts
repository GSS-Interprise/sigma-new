// T06b — webhook do Resend Inbound. Médico RESPONDE o email da solicitação de NF
// (reply-to nf+<pagamento_id>@nf.gestaoservicosaude.com.br) anexando a NF em PDF.
// Resend recebe (MX no subdomínio) → dispara este webhook (event 'email.received').
// Casa pelo token → baixa o anexo (Attachments API) → sobe em financeiro-anexos →
// nf_status='recebida' → avisa no canal Financeiro.
//
// Deploy com --no-verify-jwt (a chamada vem do Resend, não do front).
// Segurança: se RESEND_WEBHOOK_SECRET estiver setado, valida assinatura Svix.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("RESEND_WEBHOOK_SECRET"); // whsec_...

// Verificação Svix (HMAC-SHA256) — manual, sem dependência externa.
async function verifySvix(secret: string, headers: Headers, body: string): Promise<boolean> {
  const id = headers.get("svix-id"), ts = headers.get("svix-timestamp"), sig = headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = `${id}.${ts}.${body}`;
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(signed));
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)));
  // header: "v1,sig1 v1,sig2"
  return sig.split(" ").some((p) => p.split(",")[1] === expected);
}

const UUID_RE = /nf\+([0-9a-f-]{36})@/i;

serve(async (req) => {
  const raw = await req.text();
  try {
    if (WEBHOOK_SECRET) {
      const ok = await verifySvix(WEBHOOK_SECRET, req.headers, raw);
      if (!ok) return new Response("invalid signature", { status: 401 });
    }
    const payload = JSON.parse(raw || "{}");
    if (payload?.type !== "email.received") return new Response("ignored", { status: 200 });

    const data = payload.data ?? {};
    const addrs: string[] = [...(data.to ?? []), ...(data.received_for ?? [])];
    let pagamentoId: string | null = null;
    for (const a of addrs) { const m = String(a).match(UUID_RE); if (m) { pagamentoId = m[1]; break; } }
    // fallback: token no assunto [NF-xxxxxxxx]
    let shortToken: string | null = null;
    if (!pagamentoId) { const m = String(data.subject ?? "").match(/\[NF-([0-9a-f]{8})\]/i); if (m) shortToken = m[1]; }
    if (!pagamentoId && !shortToken) return new Response("no token", { status: 200 });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let pag: any = null;
    if (pagamentoId) {
      pag = (await supabase.from("financeiro_pagamentos").select("id, profissional_nome, valor_total, conferido_por").eq("id", pagamentoId).maybeSingle()).data;
    } else if (shortToken) {
      pag = (await supabase.from("financeiro_pagamentos").select("id, profissional_nome, valor_total, conferido_por").ilike("id", `${shortToken}%`).limit(1).maybeSingle()).data;
    }
    if (!pag) return new Response("pagamento nao encontrado", { status: 200 });

    // busca anexos do email recebido
    const attRes = await fetch(`https://api.resend.com/emails/receiving/${data.email_id}/attachments`, {
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });
    const attJson = await attRes.json().catch(() => ({}));
    const atts: any[] = attJson?.data ?? [];
    const validos = atts.filter((a) => /pdf|image|jpeg|png/i.test(a.content_type || "") && a.download_url);

    let salvos = 0;
    for (const a of validos) {
      const fileRes = await fetch(a.download_url);
      if (!fileRes.ok) continue;
      const bytes = new Uint8Array(await fileRes.arrayBuffer());
      const safe = String(a.filename || "nf.pdf").replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `${pag.id}/nf_${Date.now()}_${safe}`;
      const up = await supabase.storage.from("financeiro-anexos").upload(path, bytes, { contentType: a.content_type || "application/pdf" });
      if (up.error) continue;
      await supabase.from("financeiro_anexos").insert({
        pagamento_id: pag.id, tipo: "nf", arquivo_path: path, arquivo_nome: a.filename, mime: a.content_type, status: "recebido",
      });
      salvos++;
    }

    if (salvos > 0) {
      await supabase.from("financeiro_pagamentos").update({ nf_status: "recebida" }).eq("id", pag.id);
      // avisa no canal Financeiro (best-effort; posta como o conferente)
      const { data: cfg } = await supabase.from("config_lista_items").select("valor").eq("campo_nome", "financeiro_canal_id").maybeSingle();
      const canalId = cfg?.valor as string | undefined;
      const poster = pag.conferido_por as string | undefined;
      if (canalId && poster) {
        const valor = (Number(pag.valor_total) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        const { data: m } = await supabase.from("comunicacao_mensagens").insert({
          canal_id: canalId, user_id: poster, user_nome: "Financeiro (automático)",
          mensagem: `✅ *NF recebida* — ${pag.profissional_nome} (${valor}). ${salvos} anexo(s) na conta.`,
        }).select("id").single();
        if (m) {
          const { data: parts } = await supabase.from("comunicacao_participantes").select("user_id").eq("canal_id", canalId);
          const notifs = (parts ?? []).filter((p: any) => p.user_id !== poster).map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id }));
          if (notifs.length) await supabase.from("comunicacao_notificacoes").insert(notifs);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, pagamento: pag.id, anexos: salvos }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), { status: 200, headers: { "Content-Type": "application/json" } });
  }
});
