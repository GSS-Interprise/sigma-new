// Eventos do Resend para o e-mail marketing: entregue, aberto, clicado, rejeitado, spam.
// Pública (--no-verify-jwt), mas só aceita chamada ASSINADA pelo Resend (Svix): sem a
// assinatura válida, qualquer um poderia marcar e-mails como abertos ou descadastrar gente.
//
// Rejeição permanente e marcação de spam tiram o endereço de toda campanha futura — é o
// que segura a taxa de spam abaixo do limite de 0,3% do Gmail.
//
// { acao: "configurar" } com service role: cria (uma vez) o webhook no Resend apontando
// para cá e guarda a chave de assinatura em integracao_segredos.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};
const EVENTOS = ["email.sent", "email.delivered", "email.opened", "email.clicked", "email.bounced", "email.complained", "email.failed", "email.suppressed"];
const SEGREDO = "resend_eventos_webhook";

const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

async function assinaturaValida(segredo: string, id: string, ts: string, corpo: string, header: string) {
  if (!id || !ts || !header) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay: janela de 5 min
  const chave = Uint8Array.from(atob(segredo.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", chave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const esperado = b64(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(`${id}.${ts}.${corpo}`)));
  return header.split(" ").some((p) => p.split(",")[1] === esperado);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const svc = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const corpo = await req.text();

  try {
    // ── configuração (uma vez) ─────────────────────────────────────────────
    const auth = req.headers.get("Authorization") || "";
    const ehServiceRole = (() => {
      const parte = auth.replace(/^Bearer\s+/i, "").split(".")[1];
      try { return !!parte && JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/")))?.role === "service_role"; } catch { return false; }
    })();
    const pedido = (() => { try { return JSON.parse(corpo); } catch { return {}; } })();
    if (pedido?.acao === "configurar") {
      if (!ehServiceRole) return json({ ok: false, error: "unauthorized" }, 401);
      const h = { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" };
      const endpoint = `${supabaseUrl}/functions/v1/email-eventos`;
      const lista = await (await fetch("https://api.resend.com/webhooks", { headers: h })).json().catch(() => ({}));
      const existente = (lista?.data ?? []).find((w: any) => w.endpoint === endpoint);
      if (existente) return json({ ok: true, ja_existia: true, webhook_id: existente.id });
      const r = await fetch("https://api.resend.com/webhooks", { method: "POST", headers: h, body: JSON.stringify({ endpoint, events: EVENTOS }) });
      const criado = await r.json().catch(() => ({}));
      if (!r.ok || !criado?.signing_secret) return json({ ok: false, error: criado?.message || `resend_${r.status}` }, 502);
      await svc.from("integracao_segredos").upsert({ nome: SEGREDO, valor: criado.signing_secret, atualizado_em: new Date().toISOString() });
      return json({ ok: true, webhook_id: criado.id });
    }

    // ── domínio de envio do marketing (subdomínio próprio) ─────────────────
    // { acao: "dominio", nome?, verificar? } com service role: lista os domínios da conta,
    // cria o subdomínio se não existir, liga rastreamento de abertura/clique e devolve os
    // registros DNS que a infra da GSS precisa publicar.
    if (pedido?.acao === "dominio") {
      if (!ehServiceRole) return json({ ok: false, error: "unauthorized" }, 401);
      const h = { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" };
      const api = async (metodo: string, caminho: string, body?: unknown) => {
        const r = await fetch(`https://api.resend.com${caminho}`, { method: metodo, headers: h, body: body ? JSON.stringify(body) : undefined });
        return { status: r.status, data: await r.json().catch(() => ({})) };
      };
      const lista = await api("GET", "/domains");
      const dominios = (lista.data?.data ?? []) as any[];
      const nome = String(pedido.nome || "");
      if (!nome) return json({ ok: true, dominios: dominios.map((d) => ({ id: d.id, nome: d.name, status: d.status, regiao: d.region })) });

      let dom = dominios.find((d) => d.name === nome);
      if (!dom) {
        // mesma região do domínio principal, quando houver
        const regiao = dominios[0]?.region || "us-east-1";
        const criado = await api("POST", "/domains", { name: nome, region: regiao });
        if (criado.status >= 300) return json({ ok: false, error: criado.data?.message || `resend_${criado.status}` }, 502);
        dom = criado.data;
      }
      await api("PATCH", `/domains/${dom.id}`, { open_tracking: true, click_tracking: true });
      if (pedido.verificar) await api("POST", `/domains/${dom.id}/verify`);
      const det = await api("GET", `/domains/${dom.id}`);
      return json({ ok: true, dominio: { id: det.data.id, nome: det.data.name, status: det.data.status, regiao: det.data.region },
        registros: (det.data.records ?? []).map((r: any) => ({ tipo: r.type, nome: r.name, valor: r.value, prioridade: r.priority ?? null, status: r.status })) });
    }

    // ── evento do Resend ───────────────────────────────────────────────────
    const { data: seg } = await svc.from("integracao_segredos").select("valor").eq("nome", SEGREDO).maybeSingle();
    if (!seg?.valor) return json({ ok: false, error: "webhook_nao_configurado" }, 503);
    const valida = await assinaturaValida(seg.valor, req.headers.get("svix-id") || "",
      req.headers.get("svix-timestamp") || "", corpo, req.headers.get("svix-signature") || "");
    if (!valida) return json({ ok: false, error: "assinatura_invalida" }, 401);

    const evento = JSON.parse(corpo);
    const tipo = String(evento?.type || "");
    const resendId = String(evento?.data?.email_id || "");
    if (!resendId) return json({ ok: true, ignorado: "sem_email_id" });

    const { data: envio } = await svc.from("email_envios")
      .select("id, email, status, campanha_id, entregue_em, aberto_em, clicado_em").eq("resend_id", resendId).maybeSingle();
    if (!envio) return json({ ok: true, ignorado: "nao_e_email_marketing" }); // transacional, NF etc.

    const quando = evento?.created_at || new Date().toISOString();
    const patch: Record<string, unknown> = {};
    // status só avança (clicado > aberto > entregue > enviado); problema sempre prevalece
    const ordem = ["fila", "enviado", "entregue", "aberto", "clicado"];
    const avanca = (novo: string) => ordem.indexOf(novo) > ordem.indexOf(envio.status) && ordem.includes(envio.status);

    if (tipo === "email.delivered") {
      if (!envio.entregue_em) patch.entregue_em = quando;
      if (avanca("entregue")) patch.status = "entregue";
    } else if (tipo === "email.opened") {
      if (!envio.aberto_em) patch.aberto_em = quando;
      if (!envio.entregue_em) patch.entregue_em = quando;
      if (avanca("aberto")) patch.status = "aberto";
    } else if (tipo === "email.clicked") {
      if (!envio.clicado_em) patch.clicado_em = quando;
      if (!envio.aberto_em) patch.aberto_em = quando;
      if (avanca("clicado")) patch.status = "clicado";
    } else if (tipo === "email.bounced" || tipo === "email.suppressed" || tipo === "email.complained") {
      const spam = tipo === "email.complained";
      // rejeição temporária (caixa cheia etc.) não bloqueia o endereço
      const permanente = spam || tipo === "email.suppressed" ||
        String(evento?.data?.bounce?.type || "permanent").toLowerCase().startsWith("perm") ||
        String(evento?.data?.bounce?.type || "").toLowerCase() === "hard";
      patch.status = spam ? "spam" : "rejeitado";
      patch.erro = String(evento?.data?.bounce?.message || evento?.data?.bounce?.subType || tipo).slice(0, 300);
      if (permanente) {
        await svc.from("email_optout").upsert(
          { email: envio.email, motivo: spam ? "spam" : "rejeitado", campanha_id: envio.campanha_id },
          { onConflict: "email", ignoreDuplicates: true },
        );
        await svc.from("email_envios").update({ status: "bloqueado", erro: spam ? "marcou como spam" : "endereço rejeitado" })
          .eq("email", envio.email).eq("status", "fila");
      }
    } else if (tipo === "email.failed") {
      patch.status = "erro";
      patch.erro = String(evento?.data?.failed?.reason || "falha no provedor").slice(0, 300);
    }

    if (Object.keys(patch).length) await svc.from("email_envios").update(patch).eq("id", envio.id);
    return json({ ok: true, tipo });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
