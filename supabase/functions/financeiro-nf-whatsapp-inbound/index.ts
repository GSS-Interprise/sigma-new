// O médico responde a solicitação mandando a NOTA pelo WhatsApp — e ela entra sozinha
// no Sigma. Chamada pelo chakra-webhook (fire-and-forget) a cada mensagem recebida;
// ignora tudo que não for documento/imagem chegando NO NÚMERO DO FINANCEIRO.
//
// Input: { payload, phone_number_id }
//
// O download da mídia da Cloud API tem duas etapas (id → url → bytes) e o provedor pode
// proxiar de formas diferentes; por isso tenta em cascata e registra qual caminho serviu,
// em financeiro_nf_solicitacoes.erro quando falha tudo.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { chakraApi, unwrapChakraPayload } from "../_shared/chakra.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const fmtBRL = (v: number) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const sanitize = (n: string) => n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(0, 120);
// o cadastro guarda "48 99974-3464" e o WhatsApp manda "5548999743464": compara o fim
const sufixo = (fone: string) => digits(fone).slice(-8);

type Midia = { id: string; mime: string; nome: string; url: string };

function extrairMensagem(payload: any): { de: string; midia: Midia | null; nomePerfil: string; mensagemId: string; texto: string } | null {
  const raiz = payload?.value ?? payload?.entry?.[0]?.changes?.[0]?.value ?? payload;
  const msg = raiz?.messages?.[0] ?? raiz?.message ?? (raiz?.item ?? null);
  if (!msg) return null;
  const de = digits(msg.from || msg.wa_id || raiz?.contacts?.[0]?.wa_id || "");
  const doc = msg.document || null;
  const img = msg.image || null;
  const midia: Midia | null = doc
    ? { id: String(doc.id || ""), mime: String(doc.mime_type || doc.mimeType || "application/pdf"), nome: String(doc.filename || doc.fileName || "nota.pdf"), url: String(doc.url || "") }
    : img
    ? { id: String(img.id || ""), mime: String(img.mime_type || img.mimeType || "image/jpeg"), nome: "nota.jpg", url: String(img.url || "") }
    : null;
  const nomePerfil = String(raiz?.contacts?.[0]?.profile?.name || msg.profile?.name || "");
  const mensagemId = String(msg.id || msg.message_id || "");
  return { de, midia, nomePerfil, mensagemId, texto: String(msg.text?.body || msg.caption || "") };
}

/** id da mídia → bytes. A Cloud API devolve uma URL intermediária que exige token. */
async function baixarMidia(pluginId: string, mediaId: string, urlDoWebhook: string): Promise<{ bytes: Uint8Array; via: string; mime?: string }> {
  const key = Deno.env.get("CHAKRA_API_KEY")?.trim();
  const base = `/v1/ext/plugin/whatsapp/${pluginId}/api/v24.0/${mediaId}`;
  const tentativas: string[] = [];

  // O webhook do Chakra já entrega a URL assinada do arquivo (lookaside.fbsbx.com com
  // hash e validade). Ir na Graph atrás dela, como se fazia antes, só dava 404 — e as
  // notas de 25 e 26/09 se perderam por isso. A URL do evento vem primeiro; sem token e
  // com token, porque o hash já autentica.
  let urlMidia = urlDoWebhook || "", mimeMidia = "";
  if (!urlMidia) {
    try {
      const meta = unwrapChakraPayload(await chakraApi(base));
      urlMidia = String(meta.url || meta.media_url || "");
      mimeMidia = String(meta.mime_type || meta.mimeType || "");
      tentativas.push(`meta_ok:${urlMidia ? "com_url" : "sem_url"}`);
    } catch (e: any) {
      tentativas.push(`meta_erro:${String(e?.message || e).slice(0, 80)}`);
    }
  }

  const candidatos = [
    ...(urlMidia ? [{ via: "url_do_webhook", url: urlMidia, comToken: false }] : []),
    ...(urlMidia ? [{ via: "url_do_webhook_token", url: urlMidia, comToken: true }] : []),
    { via: "chakra_download", url: `https://api.chakrahq.com${base}/download`, comToken: true },
    { via: "chakra_binario", url: `https://api.chakrahq.com${base}`, comToken: true },
  ];

  for (const c of candidatos) {
    try {
      const r = await fetch(c.url, { headers: c.comToken ? { Authorization: `Bearer ${key}` } : {} });
      const tipo = r.headers.get("content-type") || "";
      if (r.ok && !tipo.includes("application/json")) {
        return { bytes: new Uint8Array(await r.arrayBuffer()), via: c.via, mime: mimeMidia || tipo };
      }
      tentativas.push(`${c.via}:${r.status}:${tipo.slice(0, 30)}`);
    } catch (e: any) {
      tentativas.push(`${c.via}:erro:${String(e?.message || e).slice(0, 60)}`);
    }
  }
  throw new Error(`midia_nao_baixou [${tentativas.join(" | ")}]`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (o: unknown, s = 200) =>
    new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // silencioso = reprocessamento de evento antigo: guarda a nota sem reavisar o canal
    // nem responder ao médico dias depois
    const { payload, phone_number_id, silencioso } = await req.json().catch(() => ({}));

    const { data: cfgRows } = await svc.from("config_lista_items")
      .select("campo_nome, valor").in("campo_nome", ["financeiro_whatsapp_sender_id", "financeiro_canal_id"]);
    const cfg = (n: string) => cfgRows?.find((c: any) => c.campo_nome === n)?.valor || "";
    const senderId = cfg("financeiro_whatsapp_sender_id");
    if (!senderId) return json({ ok: true, ignorado: "financeiro_sem_remetente" });

    const { data: sender } = await svc.from("whatsapp_official_senders")
      .select("id, phone_e164, chakra_plugin_id, chakra_phone_number_id").eq("id", senderId).maybeSingle();
    // mensagem que chegou em outro número (prospecção) não é assunto do financeiro
    if (!sender || String(sender.chakra_phone_number_id) !== String(phone_number_id ?? "")) {
      return json({ ok: true, ignorado: "outro_numero" });
    }

    const msg = extrairMensagem(payload);
    if (!msg?.midia?.id) return json({ ok: true, ignorado: "sem_documento" });

    // BAIXA PRIMEIRO. O link do arquivo no WhatsApp expira em poucos dias; procurar o
    // dono antes e falhar no meio era o que fazia a nota sumir.
    let arquivo: { bytes: Uint8Array; via: string; mime?: string } | null = null;
    let erroDownload: string | null = null;
    try {
      arquivo = await baixarMidia(String(sender.chakra_plugin_id), msg.midia.id, msg.midia.url);
    } catch (e: any) {
      // provedor não entregou o binário: registra assim mesmo. Perder o RASTRO da nota é
      // pior do que ficar sem o arquivo — a equipe salva do WhatsApp e vincula aqui.
      erroDownload = String(e?.message || e).slice(0, 400);
      console.error("[nf-whatsapp] midia nao baixou", erroDownload);
    }

    const mime = arquivo?.mime || msg.midia.mime;
    const agora = new Date().toISOString();

    // de quem é essa nota: primeiro pela solicitação enviada, depois pelo cadastro
    const fim = sufixo(msg.de);
    const { data: solicitacoes } = await svc.from("financeiro_nf_solicitacoes")
      .select("id, pagamento_id, destino, created_at")
      .eq("canal", "whatsapp").eq("status", "enviada")
      .order("created_at", { ascending: false }).limit(200);
    let pagamentoId = (solicitacoes ?? []).find((s: any) => sufixo(s.destino || "") === fim)?.pagamento_id ?? null;

    if (!pagamentoId) {
      const { data: medicos } = await svc.from("medicos").select("id, telefone").not("telefone", "is", null);
      const medico = (medicos ?? []).find((m: any) => sufixo(m.telefone) === fim);
      if (medico) {
        const { data: pend } = await svc.from("financeiro_pagamentos")
          .select("id").eq("medico_id", medico.id).in("nf_status", ["solicitada", "nao_solicitada"])
          .order("ano_referencia", { ascending: false }).order("mes_referencia", { ascending: false })
          .limit(1).maybeSingle();
        pagamentoId = pend?.id ?? null;
      }
    }

    const { data: pag } = pagamentoId
      ? await svc.from("financeiro_pagamentos")
        .select("id, profissional_nome, mes_referencia, ano_referencia, valor_total").eq("id", pagamentoId).maybeSingle()
      : { data: null as any };

    // guarda o arquivo mesmo sem dono: o médico manda do celular pessoal, do escritório
    // ou da contabilidade, e quase nunca do telefone que está no cadastro
    const pasta = pag
      ? `nf/${pag.ano_referencia}-${String(pag.mes_referencia).padStart(2, "0")}/${pag.id}`
      : `nf/entrada/${agora.slice(0, 7)}`;
    let path: string | null = null;
    if (arquivo) {
      path = `${pasta}/${Date.now()}_${sanitize(msg.midia.nome)}`;
      const { error: upErr } = await svc.storage.from("financeiro-anexos")
        .upload(path, arquivo.bytes, { contentType: mime, upsert: false });
      if (upErr) throw upErr;
    }

    const canalId = cfg("financeiro_canal_id");
    const avisar = async (texto: string) => {
      if (!canalId || silencioso) return;
      const { data: parts } = await svc.from("comunicacao_participantes").select("user_id").eq("canal_id", canalId);
      const autor = parts?.[0]?.user_id;
      if (!autor) return;
      const { data: m } = await svc.from("comunicacao_mensagens").insert({
        canal_id: canalId, user_id: autor, user_nome: "Notas fiscais", mensagem: texto,
      }).select("id").single();
      if (m && parts?.length) {
        await svc.from("comunicacao_notificacoes").insert(
          parts.filter((p: any) => p.user_id !== autor).map((p: any) => ({ user_id: p.user_id, canal_id: canalId, mensagem_id: m.id })),
        );
      }
    };

    // mensagem_id é único: reprocessar o mesmo evento não duplica a nota
    await svc.from("financeiro_nf_inbox").upsert({
      origem: "whatsapp", remetente: msg.de, remetente_nome: msg.nomePerfil || null,
      arquivo_nome: msg.midia.nome, arquivo_path: path, mime,
      mensagem_id: msg.mensagemId || null, recebido_em: agora,
      status: pag && path ? "vinculada" : "pendente",
      pagamento_id: pag?.id ?? null,
      vinculado_em: pag && path ? agora : null,
      observacoes: erroDownload ? `arquivo não baixado do provedor: ${erroDownload}` : null,
    }, { onConflict: "mensagem_id" });

    // sem binário não há o que anexar: fica o registro de que a nota chegou
    if (!arquivo || !path) {
      await avisar(
        `📄 *NF recebida, arquivo pendente* — ${msg.nomePerfil || "sem nome"} (${msg.de}) enviou “${msg.midia.nome}”. ` +
        `O provedor não liberou o arquivo; salve do WhatsApp e anexe pela caixa de entrada.`,
      );
      return json({ ok: true, recebida: true, arquivo_salvo: false, erro_download: erroDownload, remetente: msg.de });
    }

    if (!pag) {
      // sem dono: fica na caixa de entrada para a equipe vincular em dois cliques
      await avisar(
        `📄 *NF recebida sem vínculo* — ${msg.nomePerfil || "sem nome"} (${msg.de}) enviou “${msg.midia.nome}”. ` +
        `Está na caixa de entrada das notas, esperando o médico ser escolhido.`,
      );
      return json({ ok: true, recebida: true, vinculada: false, remetente: msg.de, path, via: arquivo.via });
    }

    const compExt = `${MESES[pag.mes_referencia - 1] ?? pag.mes_referencia}/${pag.ano_referencia}`;

    await svc.from("financeiro_anexos").insert({
      pagamento_id: pag.id, tipo: "nf", arquivo_path: path,
      arquivo_nome: msg.midia.nome, mime, status: "recebido",
    });
    await svc.from("financeiro_pagamentos").update({
      nf_status: "recebida", nf_recebida_em: agora, nf_arquivo_path: path,
    }).eq("id", pag.id);
    await svc.from("financeiro_nf_solicitacoes").update({ status: "recebida", recebida_em: agora })
      .eq("pagamento_id", pag.id).eq("status", "enviada");

    // confirma para o médico — dentro da janela de 24h a resposta é livre, sem template
    try {
      if (silencioso) throw new Error("reprocessamento: sem confirmação ao médico");
      await chakraApi(
        `/v1/ext/plugin/whatsapp/${sender.chakra_plugin_id}/api/v24.0/${sender.chakra_phone_number_id}/messages`,
        {
          method: "POST",
          body: JSON.stringify({
            messaging_product: "whatsapp", recipient_type: "individual", to: msg.de,
            type: "text",
            text: { body: `Nota recebida, Dr(a). ${pag.profissional_nome}. Obrigado! Qualquer pendência o financeiro da GSS retorna por aqui.` },
          }),
        },
      );
    } catch (e) {
      console.warn("[nf-whatsapp] falha ao confirmar para o médico", e);
    }

    await avisar(`📄 *NF recebida pelo WhatsApp* — Dr(a). ${pag.profissional_nome}, competência ${compExt}, ${fmtBRL(Number(pag.valor_total))}.`);

    return json({ ok: true, recebida: true, vinculada: true, pagamento_id: pag.id, medico: pag.profissional_nome, via: arquivo.via, path });
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 500);
  }
});
