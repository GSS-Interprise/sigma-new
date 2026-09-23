// Página pública /nf/<token>: o médico anexa a nota sem responder e-mail e sem login.
// É o caminho que faz o recebimento funcionar HOJE — o inbound por e-mail depende do
// MX no DNS da GSS, que ainda não existe. Deploy com --no-verify-jwt.
//
// GET  ?token=...   → dados da solicitação (para a tela montar "Dr. X, NF de 08/2026")
// POST multipart    → token + file; grava no cofre, marca recebida e avisa o financeiro.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const fmtBRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const MIMES_OK = ["application/pdf", "text/xml", "application/xml", "image/png", "image/jpeg"];
const MAX_BYTES = 15 * 1024 * 1024;
const sanitize = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 120);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    let token = new URL(req.url).searchParams.get("token") || "";
    let file: File | null = null;

    if (req.method === "POST") {
      const form = await req.formData();
      token = String(form.get("token") || token);
      const f = form.get("file");
      if (f instanceof File) file = f;
    }
    if (!token) return json({ ok: false, error: "token_ausente" }, 400);

    const { data: solic } = await svc.from("financeiro_nf_solicitacoes")
      .select("id, pagamento_id, status, canal, created_at, enviado_por")
      .eq("token", token).maybeSingle();
    if (!solic) return json({ ok: false, error: "link_invalido" }, 404);

    const { data: pag } = await svc.from("financeiro_pagamentos")
      .select("id, profissional_nome, mes_referencia, ano_referencia, unidade, valor_total, nf_status, nf_recebida_em")
      .eq("id", solic.pagamento_id).maybeSingle();
    if (!pag) return json({ ok: false, error: "pagamento_nao_encontrado" }, 404);

    const compExt = `${MESES[pag.mes_referencia - 1] ?? pag.mes_referencia}/${pag.ano_referencia}`;
    const info = {
      medico: pag.profissional_nome,
      competencia: compExt,
      unidade: pag.unidade,
      valor: fmtBRL(Number(pag.valor_total)),
      ja_recebida: pag.nf_status === "recebida" || !!pag.nf_recebida_em,
      recebida_em: pag.nf_recebida_em,
    };

    if (req.method === "GET") return json({ ok: true, ...info });

    if (!file) return json({ ok: false, error: "arquivo_ausente" }, 400);
    if (file.size > MAX_BYTES) return json({ ok: false, error: "arquivo_muito_grande", detalhe: "Limite de 15 MB." }, 400);
    const mime = file.type || "application/octet-stream";
    if (!MIMES_OK.includes(mime)) {
      return json({ ok: false, error: "formato_nao_aceito", detalhe: "Envie a nota em PDF, XML ou imagem." }, 400);
    }

    const path = `nf/${pag.ano_referencia}-${String(pag.mes_referencia).padStart(2, "0")}/${pag.id}/${Date.now()}_${sanitize(file.name || "nota.pdf")}`;
    const { error: upErr } = await svc.storage.from("financeiro-anexos")
      .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: mime, upsert: false });
    if (upErr) throw upErr;

    const agora = new Date().toISOString();
    await svc.from("financeiro_anexos").insert({
      pagamento_id: pag.id, tipo: "nf", arquivo_path: path,
      arquivo_nome: file.name || "nota.pdf", mime, status: "recebido",
    });
    await svc.from("financeiro_pagamentos").update({
      nf_status: "recebida", nf_recebida_em: agora, nf_arquivo_path: path,
    }).eq("id", pag.id);
    await svc.from("financeiro_nf_solicitacoes").update({ status: "recebida", recebida_em: agora })
      .eq("pagamento_id", pag.id).eq("status", "enviada");

    // avisa o financeiro no canal — é o "chegou nota" que hoje é uma mensagem no WhatsApp
    const { data: cfg } = await svc.from("config_lista_items")
      .select("valor").eq("campo_nome", "financeiro_canal_id").maybeSingle();
    const canalId = cfg?.valor as string | undefined;
    if (canalId) {
      const { data: parts } = await svc.from("comunicacao_participantes").select("user_id").eq("canal_id", canalId);
      // comunicacao_mensagens exige autor: usa quem pediu a NF; se não houver, o
      // primeiro participante do canal — o médico não tem usuário no sistema.
      const autor = solic.enviado_por || parts?.[0]?.user_id || null;
      if (autor) {
        const { data: m, error: msgErr } = await svc.from("comunicacao_mensagens").insert({
          canal_id: canalId, user_id: autor, user_nome: "Notas fiscais",
          mensagem: `📄 *NF recebida* — Dr(a). ${pag.profissional_nome}, competência ${compExt}, ${fmtBRL(Number(pag.valor_total))}.`,
        }).select("id").single();
        if (msgErr) console.error("[nf-upload] falha ao avisar o canal", msgErr.message);
        if (m && parts?.length) {
          await svc.from("comunicacao_notificacoes").insert(
            parts.filter((p: any) => p.user_id !== autor)
              .map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id })),
          );
        }
      }
    }

    return json({ ok: true, recebida: true, ...info, ja_recebida: true, recebida_em: agora });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
